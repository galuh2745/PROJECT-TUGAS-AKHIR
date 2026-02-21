import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { role } = payload as { userId: number; role: string };

    if (role !== 'ADMIN' && role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'Forbidden - hanya admin yang bisa mengakses' }, { status: 403 });
    }

    // Get query parameters untuk filter
    const { searchParams } = new URL(req.url);
    const tanggal = searchParams.get('tanggal');
    const karyawanId = searchParams.get('karyawan_id');
    const status = searchParams.get('status');

    if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return NextResponse.json({ success: false, error: 'Parameter tanggal tidak valid (YYYY-MM-DD)' }, { status: 400 });
    }

    // Handle tanggal dengan konsisten (gunakan UTC midnight)
    let todayStr: string;
    if (tanggal) {
      todayStr = tanggal; // YYYY-MM-DD dari parameter
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      todayStr = `${year}-${month}-${day}`;
    }
    const today = new Date(todayStr + 'T00:00:00.000Z');
    
    // Debug log
    console.log('Dashboard admin - todayStr:', todayStr, ', today UTC:', today.toISOString());

    // 1. Total karyawan aktif
    const totalKaryawanAktif = await prisma.karyawan.count({
      where: { status: 'AKTIF' },
    });

    // 2. Jumlah hadir hari ini
    const jumlahHadirHariIni = await prisma.absensi.count({
      where: {
        tanggal: today,
        status: { in: ['HADIR', 'TERLAMBAT'] },
      },
    });

    // 3. Jumlah izin/cuti hari ini (IZIN dan CUTI adalah valid StatusAbsensi)
    const jumlahIzinCutiHariIni = await prisma.absensi.count({
      where: {
        tanggal: today,
        status: { in: ['IZIN', 'CUTI'] },
      },
    });

    // 4. Jumlah lembur hari ini
    const jumlahLemburHariIni = await prisma.lembur.count({
      where: { tanggal: today },
    });

    // 5. Monitoring kehadiran harian dengan filter
    const whereClause: any = {
      tanggal: today,
    };

    if (karyawanId) {
      whereClause.karyawan_id = BigInt(karyawanId);
    }

    if (status) {
      whereClause.status = status;
    }

    const kehadiranHarian = await prisma.absensi.findMany({
      where: whereClause,
      include: {
        karyawan: {
          include: {
            jenis_karyawan: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // 6. Daftar karyawan untuk filter dropdown
    const daftarKaryawan = await prisma.karyawan.findMany({
      where: { status: 'AKTIF' },
      select: {
        id: true,
        nama: true,
        nip: true,
      },
      orderBy: {
        nama: 'asc',
      },
    });

    // Format data kehadiran
    const formattedKehadiran = kehadiranHarian.map((item) => ({
      id: item.id.toString(),
      karyawan_id: item.karyawan_id.toString(),
      karyawan_nama: item.karyawan.nama,
      karyawan_nip: item.karyawan.nip,
      jenis_karyawan: item.karyawan.jenis_karyawan.nama_jenis,
      tanggal: item.tanggal,
      jam_masuk: item.jam_masuk,
      jam_pulang: item.jam_pulang,
      status: item.status,
      latitude: item.latitude ? Number(item.latitude) : null,
      longitude: item.longitude ? Number(item.longitude) : null,
    }));

    // Format daftar karyawan
    const formattedKaryawan = daftarKaryawan.map((item) => ({
      id: item.id.toString(),
      nama: item.nama,
      nip: item.nip,
    }));

    return NextResponse.json({
      success: true,
      data: {
        ringkasan: {
          total_karyawan_aktif: totalKaryawanAktif,
          jumlah_hadir_hari_ini: jumlahHadirHariIni,
          jumlah_izin_cuti_hari_ini: jumlahIzinCutiHariIni,
          jumlah_lembur_hari_ini: jumlahLemburHariIni,
        },
        kehadiran_harian: formattedKehadiran,
        daftar_karyawan: formattedKaryawan,
        filter: {
          tanggal: today,
          karyawan_id: karyawanId,
          status: status,
        },
      },
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
