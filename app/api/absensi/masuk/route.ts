import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Koordinat kantor dari environment variable, atau default Jakarta
const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT || '-6.200000');
const OFFICE_LON = parseFloat(process.env.OFFICE_LON || '106.816666');
const MAX_DISTANCE = parseInt(process.env.MAX_DISTANCE || '500'); // dalam meter

// Set SKIP_LOCATION_CHECK=true di .env untuk menonaktifkan validasi lokasi
const SKIP_LOCATION_CHECK = process.env.SKIP_LOCATION_CHECK === 'true';

// Maksimal ukuran file 2MB
const MAX_FILE_SIZE = 2 * 1024 * 1024;

// Fungsi hitung jarak (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Fungsi format tanggal untuk watermark
function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

// HERE Maps API Key (opsional, jika ada akan digunakan untuk geocoding lebih akurat)
const HERE_API_KEY = process.env.HERE_API_KEY || '';

// Fungsi reverse geocoding - HERE Maps (primary) + Nominatim (fallback)
async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  // Coba HERE Maps Geocoding API dulu jika API key tersedia
  if (HERE_API_KEY) {
    try {
      console.log('[Geocode] Menggunakan HERE Maps API...');
      const hRes = await fetch(
        `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${latitude},${longitude}&lang=id&apiKey=${HERE_API_KEY}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (hRes.ok) {
        const hData = await hRes.json();
        if (hData.items?.length > 0) {
          const label = (hData.items[0].address?.label || '')
            .replace(/,\s*Indonesia$/i, '')
            .trim();
          if (label) {
            console.log('[Geocode] HERE Maps berhasil:', label);
            return label;
          }
        }
        console.warn('[Geocode] HERE Maps response OK tapi tidak ada hasil');
      } else {
        const errBody = await hRes.text();
        console.error(`[Geocode] HERE Maps gagal (${hRes.status}):`, errBody);
      }
    } catch (err) {
      console.error('[Geocode] HERE Maps error, fallback ke Nominatim:', err);
    }
  } else {
    console.log('[Geocode] HERE_API_KEY tidak diset, langsung pakai Nominatim');
  }

  // Fallback: Nominatim (OpenStreetMap)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=id&zoom=18`,
      {
        headers: { 'User-Agent': 'AbsensiApp/1.0' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) throw new Error('Nominatim request failed');

    const data = await res.json();
    const addr = data.address || {};
    const displayName = data.display_name || '';

    if (displayName) {
      const cleaned = displayName
        .replace(/,\s*(Indonesia)$/i, '')
        .replace(/,\s*(Sumatra|Sumatera)\s*,?/i, '')
        .replace(/,\s*,/g, ',')
        .replace(/,\s*$/g, '')
        .trim();
      if (cleaned) return cleaned;
    }

    const jalan = addr.road || '';
    const nomor = addr.house_number || '';
    const desa = addr.village || addr.suburb || addr.neighbourhood || '';
    const lingkungan = addr.hamlet || addr.residential || '';
    const kecamatan = addr.city_district || addr.county || '';
    const kabupaten = addr.city || addr.town || addr.municipality || '';
    const provinsi = addr.state || '';
    const kodepos = addr.postcode || '';

    const jalanLengkap = [jalan, nomor].filter(Boolean).join(' ');
    const parts = [jalanLengkap, lingkungan, desa, kecamatan, kabupaten, provinsi].filter(Boolean);
    const result = parts.length > 0 ? parts.join(', ') : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    return kodepos ? `${result} ${kodepos}` : result;
  } catch (err) {
    console.error('Reverse geocoding error:', err);
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }
}

// Fungsi untuk escape XML special characters
function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Fungsi untuk membuat watermark SVG
function createWatermarkSvg(nama: string, waktu: string, lokasi: string, width: number): string {
  const padding = 15;
  const fontSize = 14;
  const lineHeight = 22;
  
  // Potong lokasi jika terlalu panjang, buat multi-line
  const maxCharsPerLine = Math.floor((width - padding * 2) / (fontSize * 0.55));
  const lokasiLines: string[] = [];
  let remaining = lokasi;
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      lokasiLines.push(remaining);
      break;
    }
    // Cari posisi koma terdekat sebelum maxCharsPerLine
    let cutIndex = remaining.lastIndexOf(',', maxCharsPerLine);
    if (cutIndex <= 0) cutIndex = maxCharsPerLine;
    lokasiLines.push(remaining.substring(0, cutIndex + 1).trim());
    remaining = remaining.substring(cutIndex + 1).trim();
  }

  const totalLines = 2 + lokasiLines.length; // Nama + Waktu + lokasi lines
  const boxHeight = lineHeight * totalLines + padding * 2 + 10;
  
  let lokasiSvg = '';
  lokasiLines.forEach((line, i) => {
    const y = padding + lineHeight * (3 + i);
    if (i === 0) {
      lokasiSvg += `<text x="${padding}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white" filter="url(#shadow)"><tspan font-weight="bold">Lokasi:</tspan> ${escapeXml(line)}</text>`;
    } else {
      lokasiSvg += `<text x="${padding + 56}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white" filter="url(#shadow)">${escapeXml(line)}</text>`;
    }
  });

  return `
    <svg width="${width}" height="${boxHeight}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="1" stdDeviation="1" flood-opacity="0.5"/>
        </filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${boxHeight}" fill="rgba(0,0,0,0.6)" rx="8"/>
      <text x="${padding}" y="${padding + lineHeight}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white" filter="url(#shadow)">
        <tspan font-weight="bold">Nama:</tspan> ${escapeXml(nama)}
      </text>
      <text x="${padding}" y="${padding + lineHeight * 2}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white" filter="url(#shadow)">
        <tspan font-weight="bold">Waktu:</tspan> ${escapeXml(waktu)}
      </text>
      ${lokasiSvg}
    </svg>
  `;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized - silakan login ulang' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { userId, role } = payload as { userId: number; role: string };

    if (role !== 'USER') {
      return NextResponse.json({ success: false, error: 'Hanya karyawan yang bisa absen' }, { status: 403 });
    }

    const karyawan = await prisma.karyawan.findUnique({
      where: { user_id: BigInt(userId) },
      include: { jenis_karyawan: true },
    });

    if (!karyawan || karyawan.status !== 'AKTIF') {
      return NextResponse.json({ success: false, error: 'Karyawan tidak aktif' }, { status: 403 });
    }

    // Gunakan tanggal lokal (Indonesia WIB = UTC+7)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const today = new Date(todayStr + 'T00:00:00.000Z');
    
    const isShiftMalam = karyawan.jenis_karyawan.is_shift_malam;
    const isSkipJamKerja = karyawan.jenis_karyawan.skip_jam_kerja;
    
    console.log('Absen masuk - karyawan:', karyawan.nama, ', todayStr:', todayStr, ', isShiftMalam:', isShiftMalam, ', skipJamKerja:', isSkipJamKerja);

    // Untuk shift malam: cek apakah ada absensi kemarin yang belum tutup (belum pulang)
    if (isShiftMalam) {
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      
      const openAbsensiKemarin = await prisma.absensi.findFirst({
        where: {
          karyawan_id: karyawan.id,
          tanggal: yesterday,
          jam_pulang: null,
        },
      });

      if (openAbsensiKemarin) {
        return NextResponse.json({ 
          success: false, 
          error: 'Anda masih memiliki absensi kemarin yang belum di-checkout. Silakan absen pulang terlebih dahulu.' 
        }, { status: 400 });
      }
    }

    // Cek apakah sudah ada absensi hari ini
    const existingAbsensi = await prisma.absensi.findFirst({
      where: {
        karyawan_id: karyawan.id,
        tanggal: today,
      },
    });

    if (existingAbsensi) {
      return NextResponse.json({ success: false, error: 'Sudah melakukan check-in hari ini' }, { status: 400 });
    }

    // Cek apakah ada izin/cuti yang disetujui untuk hari ini
    const approvedIzinCuti = await prisma.izinCuti.findFirst({
      where: {
        karyawan_id: karyawan.id,
        status: 'APPROVED',
        tanggal_mulai: { lte: today },
        tanggal_selesai: { gte: today },
      },
    });

    if (approvedIzinCuti) {
      return NextResponse.json({ 
        success: false, 
        error: `Tidak dapat melakukan absensi. Anda sedang ${approvedIzinCuti.jenis.toLowerCase()} yang telah disetujui` 
      }, { status: 400 });
    }

    // Parse FormData
    const formData = await req.formData();
    const photo = formData.get('photo') as File | null;
    const latitude = parseFloat(formData.get('latitude') as string);
    const longitude = parseFloat(formData.get('longitude') as string);

    // Validasi foto wajib
    if (!photo) {
      return NextResponse.json({ success: false, error: 'Foto wajib diambil untuk absen masuk' }, { status: 400 });
    }

    // Validasi tipe file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(photo.type)) {
      return NextResponse.json({ success: false, error: 'Tipe file tidak valid. Gunakan JPG, PNG, atau WebP' }, { status: 400 });
    }

    // Validasi ukuran file
    if (photo.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'Ukuran foto maksimal 2MB' }, { status: 400 });
    }

    // Validasi koordinat
    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json({ success: false, error: 'Lokasi GPS tidak valid' }, { status: 400 });
    }
    
    // Validasi lokasi (bisa dinonaktifkan via env, atau skip untuk driver/helper)
    if (!SKIP_LOCATION_CHECK && !isSkipJamKerja) {
      const distance = calculateDistance(latitude, longitude, OFFICE_LAT, OFFICE_LON);
      if (distance > MAX_DISTANCE) {
        return NextResponse.json({ 
          success: false, 
          error: `Di luar radius lokasi kerja (${Math.round(distance)}m dari kantor, max ${MAX_DISTANCE}m)` 
        }, { status: 400 });
      }
    }

    const currentTime = new Date();
    
    // Tentukan status absensi
    let status: 'HADIR' | 'TERLAMBAT';
    
    if (isSkipJamKerja) {
      // Driver/Helper Driver: selalu HADIR, tidak ada pengecekan jam
      status = 'HADIR';
    } else {
      // Karyawan reguler & shift malam: cek keterlambatan
      const jamMasukNormal = karyawan.jenis_karyawan.jam_masuk;
      const toleransi = karyawan.jenis_karyawan.toleransi_terlambat || 15;
      
      const batasToleransi = new Date();
      batasToleransi.setHours(jamMasukNormal.getHours(), jamMasukNormal.getMinutes() + toleransi, 0, 0);
      
      status = currentTime <= batasToleransi ? 'HADIR' : 'TERLAMBAT';
    }

    // Proses foto dengan watermark
    const photoBuffer = Buffer.from(await photo.arrayBuffer());
    
    // Resize foto terlebih dahulu
    const resizedPhoto = await sharp(photoBuffer)
      .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    
    // Dapatkan metadata gambar SETELAH resize
    const metadata = await sharp(resizedPhoto).metadata();
    const imgWidth = metadata.width || 800;
    
    // Reverse geocode koordinat ke deskripsi alamat
    const lokasiDeskripsi = await reverseGeocode(latitude, longitude);

    // Buat watermark SVG dengan ukuran yang sesuai
    const watermarkSvg = createWatermarkSvg(
      karyawan.nama,
      formatDateTime(currentTime),
      lokasiDeskripsi,
      Math.min(imgWidth - 20, 450)
    );
    
    // Composite watermark ke foto yang sudah di-resize
    const watermarkBuffer = Buffer.from(watermarkSvg);
    const processedPhoto = await sharp(resizedPhoto)
      .composite([
        {
          input: watermarkBuffer,
          gravity: 'southwest',
          blend: 'over'
        }
      ])
      .jpeg({ quality: 100 })
      .toBuffer();

    // Simpan foto ke folder lokal
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'absensi', `${year}-${month}`);
    await fs.mkdir(uploadDir, { recursive: true });
    
    const fileName = `masuk_${karyawan.nip}_${year}${month}${day}_${Date.now()}.jpg`;
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, processedPhoto);
    
    // Path relatif untuk disimpan di database
    const fotoPath = `/uploads/absensi/${year}-${month}/${fileName}`;

    const absensi = await prisma.absensi.create({
      data: {
        karyawan_id: karyawan.id,
        tanggal: today,
        jam_masuk: isSkipJamKerja ? null : currentTime,
        latitude,
        longitude,
        status,
        foto_masuk: fotoPath,
      },
    });
    
    console.log('Absensi created:', {
      id: absensi.id.toString(),
      karyawan_id: absensi.karyawan_id.toString(),
      tanggal: absensi.tanggal.toISOString(),
      status: absensi.status,
      foto_masuk: absensi.foto_masuk
    });

    return NextResponse.json({ 
      success: true,
      message: `Absen masuk berhasil! Status: ${status}`,
      data: {
        jam_masuk: currentTime.toISOString(),
        status,
        foto_masuk: fotoPath
      }
    });
  } catch (error) {
    console.error('Error absen masuk:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
