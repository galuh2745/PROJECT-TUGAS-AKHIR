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
    const { userId, role } = payload as { userId: number; role: string };

    if (role !== 'USER') {
      return NextResponse.json({ success: false, error: 'Forbidden - hanya karyawan yang bisa mengakses' }, { status: 403 });
    }

    // Cari data karyawan
    const karyawan = await prisma.karyawan.findUnique({
      where: { user_id: BigInt(userId) },
      include: { jenis_karyawan: true },
    });

    if (!karyawan) {
      return NextResponse.json({ success: false, error: 'Data karyawan tidak ditemukan' }, { status: 404 });
    }

    // Query parameters untuk filter bulan/tahun
    const { searchParams } = new URL(req.url);
    const bulanParam = searchParams.get('bulan');
    const tahunParam = searchParams.get('tahun');
    const tanggalParam = searchParams.get('tanggal');

    // Gunakan tanggal lokal (konsisten dengan absensi)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const today = new Date(todayStr + 'T00:00:00.000Z');

    // Validasi parameter tanggal jika ada
    if (tanggalParam && !/^\d{4}-\d{2}-\d{2}$/.test(tanggalParam)) {
      return NextResponse.json({ success: false, error: 'Parameter tanggal tidak valid (YYYY-MM-DD)' }, { status: 400 });
    }

    // Tentukan bulan dan tahun untuk filter (dari parameter atau bulan berjalan)
    const parsedBulan = bulanParam ? parseInt(bulanParam, 10) : undefined;
    const parsedTahun = tahunParam ? parseInt(tahunParam, 10) : undefined;

    if (parsedBulan !== undefined && (isNaN(parsedBulan) || parsedBulan < 1 || parsedBulan > 12)) {
      return NextResponse.json({ success: false, error: 'Parameter bulan tidak valid (1-12)' }, { status: 400 });
    }

    if (parsedTahun !== undefined && (isNaN(parsedTahun) || parsedTahun < 2000 || parsedTahun > 2100)) {
      return NextResponse.json({ success: false, error: 'Parameter tahun tidak valid' }, { status: 400 });
    }

    const filterBulan = parsedBulan ?? now.getMonth() + 1;
    const filterTahun = parsedTahun ?? now.getFullYear();

    // Get first and last day of month (UTC agar konsisten)
    const firstDayOfMonth = new Date(Date.UTC(filterTahun, filterBulan - 1, 1));
    const lastDayOfMonth = new Date(Date.UTC(filterTahun, filterBulan, 0, 23, 59, 59, 999));

    // 1. Status absensi hari ini
    let absensiHariIni = await prisma.absensi.findFirst({
      where: {
        karyawan_id: karyawan.id,
        tanggal: today,
      },
    });

    // Shift malam: jika belum ada absensi hari ini, cek kemarin (cross-midnight)
    // Ini untuk menampilkan status "sudah masuk" di dashboard pagi hari
    if (!absensiHariIni && karyawan.jenis_karyawan.is_shift_malam) {
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      
      const openAbsensiKemarin = await prisma.absensi.findFirst({
        where: {
          karyawan_id: karyawan.id,
          tanggal: yesterday,
          jam_pulang: null, // belum checkout
        },
      });

      if (openAbsensiKemarin) {
        absensiHariIni = openAbsensiKemarin;
      }
    }

    // 2. Total kehadiran bulan berjalan
    const totalKehadiranBulanIni = await prisma.absensi.count({
      where: {
        karyawan_id: karyawan.id,
        tanggal: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
        status: { in: ['HADIR', 'TERLAMBAT'] },
      },
    });

    // 3. Total jam lembur bulan berjalan
    const lemburBulanIni = await prisma.lembur.findMany({
      where: {
        karyawan_id: karyawan.id,
        tanggal: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
    });

    const totalJamLemburBulanIni = lemburBulanIni.reduce((total, item) => {
      return total + Number(item.total_jam);
    }, 0);

    // 4. Riwayat absensi (berdasarkan bulan/tahun atau tanggal spesifik)
    const whereTanggalAbsensi = tanggalParam
      ? { gte: new Date(tanggalParam + 'T00:00:00.000Z'), lte: new Date(tanggalParam + 'T23:59:59.999Z') }
      : { gte: firstDayOfMonth, lte: lastDayOfMonth };

    const riwayatAbsensi = await prisma.absensi.findMany({
      where: {
        karyawan_id: karyawan.id,
        tanggal: whereTanggalAbsensi,
      },
      orderBy: {
        tanggal: 'desc',
      },
    });

    // 5. Riwayat izin & cuti (berdasarkan bulan/tahun filter)
    const riwayatIzinCuti = await prisma.izinCuti.findMany({
      where: {
        karyawan_id: karyawan.id,
        OR: [
          {
            tanggal_mulai: { gte: firstDayOfMonth, lte: lastDayOfMonth },
          },
          {
            tanggal_selesai: { gte: firstDayOfMonth, lte: lastDayOfMonth },
          },
        ],
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // 6. Riwayat lembur (berdasarkan bulan/tahun filter)
    const riwayatLembur = await prisma.lembur.findMany({
      where: {
        karyawan_id: karyawan.id,
        tanggal: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
      orderBy: {
        tanggal: 'desc',
      },
    });

    // Format data
    const formattedAbsensiHariIni = absensiHariIni ? {
      id: absensiHariIni.id.toString(),
      tanggal: absensiHariIni.tanggal,
      jam_masuk: absensiHariIni.jam_masuk,
      jam_pulang: absensiHariIni.jam_pulang,
      status: absensiHariIni.status,
    } : null;

    const formattedRiwayatAbsensi = riwayatAbsensi.map((item) => ({
      id: item.id.toString(),
      tanggal: item.tanggal,
      jam_masuk: item.jam_masuk,
      jam_pulang: item.jam_pulang,
      status: item.status,
    }));

    const formattedRiwayatIzinCuti = riwayatIzinCuti.map((item) => ({
      id: item.id.toString(),
      jenis: item.jenis,
      tanggal_mulai: item.tanggal_mulai,
      tanggal_selesai: item.tanggal_selesai,
      alasan: item.alasan,
      status: item.status,
      created_at: item.created_at,
    }));

    const formattedRiwayatLembur = riwayatLembur.map((item) => ({
      id: item.id.toString(),
      tanggal: item.tanggal,
      jam_mulai: item.jam_mulai,
      jam_selesai: item.jam_selesai,
      total_jam: Number(item.total_jam),
      keterangan: item.keterangan,
    }));

    return NextResponse.json({
      success: true,
      data: {
        karyawan: {
          id: karyawan.id.toString(),
          nama: karyawan.nama,
          nip: karyawan.nip,
          jenis_karyawan: karyawan.jenis_karyawan.nama_jenis,
          jam_masuk_normal: karyawan.jenis_karyawan.jam_masuk,
          jam_pulang_normal: karyawan.jenis_karyawan.jam_pulang,
          is_shift_malam: karyawan.jenis_karyawan.is_shift_malam,
          skip_jam_kerja: karyawan.jenis_karyawan.skip_jam_kerja,
        },
        ringkasan: {
          absensi_hari_ini: formattedAbsensiHariIni,
          total_kehadiran_bulan_ini: totalKehadiranBulanIni,
          total_jam_lembur_bulan_ini: Number(totalJamLemburBulanIni.toFixed(2)),
        },
        riwayat: {
          absensi: formattedRiwayatAbsensi,
          izin_cuti: formattedRiwayatIzinCuti,
          lembur: formattedRiwayatLembur,
        },
      },
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
