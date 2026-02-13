import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

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
    // 3. HITUNG RANGE TANGGAL
    // =============================================
    // Tanggal awal bulan (1 bulan, tahun, jam 00:00:00)
    const tanggalAwal = new Date(tahun, bulan - 1, 1);
    // Tanggal akhir bulan (tanggal terakhir bulan, jam 23:59:59)
    const tanggalAkhir = new Date(tahun, bulan, 0, 23, 59, 59, 999);

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
    // 6. HITUNG REKAP PER KARYAWAN
    // =============================================
    const rekapData = karyawanList.map((karyawan) => {
      // Filter absensi untuk karyawan ini
      const absensiKaryawan = absensiData.filter(
        (a) => a.karyawan_id === karyawan.id
      );

      // Hitung jumlah per status
      const jumlahHadir = absensiKaryawan.filter(
        (a) => a.status === 'HADIR'
      ).length;
      const jumlahTerlambat = absensiKaryawan.filter(
        (a) => a.status === 'TERLAMBAT'
      ).length;
      const jumlahIzin = absensiKaryawan.filter(
        (a) => a.status === 'IZIN'
      ).length;
      const jumlahCuti = absensiKaryawan.filter(
        (a) => a.status === 'CUTI'
      ).length;
      const jumlahAlpha = absensiKaryawan.filter(
        (a) => a.status === 'ALPHA'
      ).length;

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
          izin: jumlahIzin,
          cuti: jumlahCuti,
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
