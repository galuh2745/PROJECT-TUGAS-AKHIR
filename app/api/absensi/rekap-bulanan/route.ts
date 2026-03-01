import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

export const dynamic = 'force-dynamic';

/**
 * GET /api/absensi/rekap-bulanan
 * 
 * API untuk mengambil rekap absensi bulanan per karyawan
 * Hanya dapat diakses oleh ADMIN dan OWNER
 * 
 * Query Parameters:
 * - bulan: number (1-12) - wajib
 * - tahun: number - wajib
 * - karyawan_id: string - opsional, untuk filter spesifik karyawan
 * - jenis_karyawan_id: string - opsional, untuk filter berdasarkan jenis karyawan
 */
export async function GET(request: NextRequest) {
  try {
    // =============================================
    // 1. VALIDASI AUTENTIKASI & OTORISASI
    // =============================================
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Token tidak ditemukan' },
        { status: 401 }
      );
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { role } = payload as { userId: string; role: string };

    // Hanya ADMIN dan OWNER yang bisa mengakses
    if (role !== 'ADMIN' && role !== 'OWNER') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Hanya admin yang dapat mengakses' },
        { status: 403 }
      );
    }

    // =============================================
    // 2. AMBIL DAN VALIDASI PARAMETER
    // =============================================
    const { searchParams } = new URL(request.url);
    const bulan = parseInt(searchParams.get('bulan') || '');
    const tahun = parseInt(searchParams.get('tahun') || '');
    const karyawanId = searchParams.get('karyawan_id');
    const jenisKaryawanId = searchParams.get('jenis_karyawan_id');

    // Validasi bulan dan tahun
    if (isNaN(bulan) || bulan < 1 || bulan > 12) {
      return NextResponse.json(
        { success: false, error: 'Parameter bulan tidak valid (1-12)' },
        { status: 400 }
      );
    }

    if (isNaN(tahun) || tahun < 2000 || tahun > 2100) {
      return NextResponse.json(
        { success: false, error: 'Parameter tahun tidak valid' },
        { status: 400 }
      );
    }

    // =============================================
    // 3. HITUNG RANGE TANGGAL (UTC agar konsisten dengan penyimpanan absensi)
    // =============================================
    const tanggalAwal = new Date(Date.UTC(tahun, bulan - 1, 1));
    const tanggalAkhir = new Date(Date.UTC(tahun, bulan, 0, 23, 59, 59, 999));
    const nowLocal = new Date();
    const todayUTC = new Date(Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999));

    if (tanggalAwal > todayUTC) {
      return NextResponse.json(
        {
          success: true,
          data: {
            periode: {
              bulan,
              tahun,
              tanggal_awal: tanggalAwal.toISOString().split('T')[0],
              tanggal_akhir: tanggalAkhir.toISOString().split('T')[0],
            },
            summary: {
              total_karyawan: 0,
              total_hadir: 0,
              total_terlambat: 0,
              total_izin: 0,
              total_cuti: 0,
              total_alpha: 0,
            },
            rekap: [],
          },
        },
        { status: 200 }
      );
    }

    // =============================================
    // 4. QUERY DATA KARYAWAN DENGAN FILTER
    // =============================================
    const whereKaryawan: Record<string, unknown> = {
      status: 'AKTIF',
    };

    if (karyawanId) {
      whereKaryawan.id = BigInt(karyawanId);
    }

    if (jenisKaryawanId) {
      whereKaryawan.jenis_karyawan_id = BigInt(jenisKaryawanId);
    }

    const karyawanList = await prisma.karyawan.findMany({
      where: whereKaryawan,
      include: {
        jenis_karyawan: {
          select: {
            id: true,
            nama_jenis: true,
            skip_jam_kerja: true,
          },
        },
      },
      orderBy: {
        nama: 'asc',
      },
    });

    // =============================================
    // 5. QUERY DATA ABSENSI BULANAN
    // =============================================
    const karyawanIds = karyawanList.map((k) => k.id);

    const absensiData = await prisma.absensi.findMany({
      where: {
        karyawan_id: {
          in: karyawanIds,
        },
        tanggal: {
          gte: tanggalAwal,
          lte: tanggalAkhir,
        },
      },
      orderBy: {
        tanggal: 'asc',
      },
    });

    // =============================================
    // 5b. QUERY DATA IZIN/CUTI YANG APPROVED
    // =============================================
    const izinCutiData = await prisma.izinCuti.findMany({
      where: {
        karyawan_id: { in: karyawanIds },
        status: 'APPROVED',
        OR: [
          {
            tanggal_mulai: { gte: tanggalAwal, lte: tanggalAkhir },
          },
          {
            tanggal_selesai: { gte: tanggalAwal, lte: tanggalAkhir },
          },
          {
            tanggal_mulai: { lte: tanggalAwal },
            tanggal_selesai: { gte: tanggalAkhir },
          },
        ],
      },
    });

    // =============================================
    // 5c. HITUNG HARI KERJA (Senin-Sabtu) DALAM BULAN (UTC)
    // =============================================
    const hariKerja: Date[] = [];
    const batasAkhir = tanggalAkhir < todayUTC ? tanggalAkhir : todayUTC;
    
    for (let d = new Date(tanggalAwal); d <= batasAkhir; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.getUTCDay(); // 0=Minggu, 6=Sabtu
      if (day !== 0) { // Senin-Sabtu = hari kerja
        hariKerja.push(new Date(d));
      }
    }
    const totalHariKerja = hariKerja.length;

    // Helper: check if a date falls within izin/cuti range
    const isDateCoveredByIzinCuti = (karyawanId: bigint, date: Date): string | null => {
      const dateStr = date.toISOString().split('T')[0];
      for (const ic of izinCutiData) {
        if (ic.karyawan_id !== karyawanId) continue;
        const mulai = new Date(ic.tanggal_mulai).toISOString().split('T')[0];
        const selesai = new Date(ic.tanggal_selesai).toISOString().split('T')[0];
        if (dateStr >= mulai && dateStr <= selesai) {
          return ic.jenis; // 'IZIN', 'CUTI', or 'SAKIT'
        }
      }
      return null;
    };

    // =============================================
    // 6. HITUNG REKAP PER KARYAWAN (DENGAN AUTO-ALPA)
    // =============================================
    const rekapData = karyawanList.map((karyawan) => {
      // Filter absensi untuk karyawan ini
      const absensiKaryawan = absensiData.filter(
        (a) => a.karyawan_id === karyawan.id
      );

      // Cek flag jenis karyawan
      const isSkipJamKerja = (karyawan.jenis_karyawan as any).skip_jam_kerja || false;

      // Set tanggal absensi untuk lookup cepat
      const absensiDateSet = new Set(
        absensiKaryawan.map((a) => a.tanggal.toISOString().split('T')[0])
      );

      // Hitung jumlah per status dari record absensi yang ada
      const jumlahHadir = absensiKaryawan.filter(
        (a) => a.status === 'HADIR'
      ).length;
      
      // Driver/Helper: tidak ada TERLAMBAT
      const jumlahTerlambat = isSkipJamKerja ? 0 : absensiKaryawan.filter(
        (a) => a.status === 'TERLAMBAT'
      ).length;
      
      // Hitung IZIN dan CUTI dari record absensi yang sudah ada
      let jumlahIzinAbsensi = absensiKaryawan.filter(
        (a) => a.status === 'IZIN'
      ).length;
      let jumlahCutiAbsensi = absensiKaryawan.filter(
        (a) => a.status === 'CUTI'
      ).length;

      // Auto-calculate: hitung hari kerja tanpa absensi
      // PENTING: Alpa hanya dihitung mulai dari HARI SETELAH karyawan dibuat (created_at)
      // agar karyawan baru tidak langsung mendapat alpa di hari pembuatan akun
      // Driver/Helper Driver: TIDAK ada perhitungan ALPHA
      let jumlahAlpha = 0;
      let jumlahIzinExtra = 0;
      let jumlahCutiExtra = 0;

      const karyawanCreatedDate = new Date(karyawan.created_at);
      karyawanCreatedDate.setUTCHours(0, 0, 0, 0);
      karyawanCreatedDate.setUTCDate(karyawanCreatedDate.getUTCDate() + 1); // mulai dari hari setelah akun dibuat

      for (const hk of hariKerja) {
        // Skip hari kerja sebelum karyawan membuat akun
        if (hk < karyawanCreatedDate) continue;

        const hkStr = hk.toISOString().split('T')[0];
        // Sudah ada record absensi untuk hari ini? Skip.
        if (absensiDateSet.has(hkStr)) continue;
        
        // Cek apakah hari ini ter-cover oleh izin/cuti yang approved
        const jenisIzinCuti = isDateCoveredByIzinCuti(karyawan.id, hk);
        if (jenisIzinCuti === 'IZIN' || jenisIzinCuti === 'SAKIT') {
          jumlahIzinExtra++;
        } else if (jenisIzinCuti === 'CUTI') {
          jumlahCutiExtra++;
        } else {
          // Driver/Helper: tidak dihitung ALPHA
          if (!isSkipJamKerja) {
            jumlahAlpha++;
          }
        }
      }

      const totalIzin = jumlahIzinAbsensi + jumlahIzinExtra;
      const totalCuti = jumlahCutiAbsensi + jumlahCutiExtra;

      // Detail absensi harian (untuk expand view)
      const detailAbsensi = absensiKaryawan.map((a) => ({
        id: a.id.toString(),
        tanggal: a.tanggal.toISOString().split('T')[0],
        jam_masuk: a.jam_masuk
          ? new Date(a.jam_masuk).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-',
        jam_pulang: a.jam_pulang
          ? new Date(a.jam_pulang).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-',
        status: a.status,
        foto_masuk: a.foto_masuk || null,
        foto_pulang: a.foto_pulang || null,
        latitude: a.latitude != null ? parseFloat(String(a.latitude)) : null,
        longitude: a.longitude != null ? parseFloat(String(a.longitude)) : null,
      }));

      return {
        karyawan_id: karyawan.id.toString(),
        nip: karyawan.nip,
        nama: karyawan.nama,
        jenis_karyawan: {
          id: karyawan.jenis_karyawan.id.toString(),
          nama: karyawan.jenis_karyawan.nama_jenis,
        },
        rekap: {
          hadir: jumlahHadir,
          terlambat: jumlahTerlambat,
          izin: totalIzin,
          cuti: totalCuti,
          alpha: jumlahAlpha,
          total_masuk: jumlahHadir + jumlahTerlambat,
        },
        detail: detailAbsensi,
      };
    });

    // =============================================
    // 7. HITUNG SUMMARY TOTAL
    // =============================================
    const summary = {
      total_karyawan: rekapData.length,
      total_hadir: rekapData.reduce((sum, r) => sum + r.rekap.hadir, 0),
      total_terlambat: rekapData.reduce((sum, r) => sum + r.rekap.terlambat, 0),
      total_izin: rekapData.reduce((sum, r) => sum + r.rekap.izin, 0),
      total_cuti: rekapData.reduce((sum, r) => sum + r.rekap.cuti, 0),
      total_alpha: rekapData.reduce((sum, r) => sum + r.rekap.alpha, 0),
    };

    // =============================================
    // 8. RETURN RESPONSE
    // =============================================
    return NextResponse.json({
      success: true,
      data: {
        periode: {
          bulan,
          tahun,
          tanggal_awal: tanggalAwal.toISOString().split('T')[0],
          tanggal_akhir: tanggalAkhir.toISOString().split('T')[0],
        },
        summary,
        rekap: rekapData,
      },
    });
  } catch (error) {
    console.error('Error fetching rekap absensi bulanan:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
