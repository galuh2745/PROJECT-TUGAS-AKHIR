import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

/**
 * GET /api/dashboard/admin/summary?date=YYYY-MM-DD
 *
 * Returns a combined summary of:
 *  - Absensi (attendance)
 *  - Inventory (chicken stock movement)
 *  - Keuangan (financials)
 * for a single day.
 */
export async function GET(req: Request) {
  try {
    // ── Auth ──
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { role } = payload as { userId: number; role: string };

    if (role !== 'ADMIN' && role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // ── Date param ──
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    let dateStr: string;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      dateStr = dateParam;
    } else {
      const now = new Date();
      dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    const targetDate = new Date(dateStr + 'T00:00:00.000Z');
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // ════════════════════════════════════════════════════
    // 1) ABSENSI
    // ════════════════════════════════════════════════════

    const [totalKaryawan, hadirCount, izinCutiCount, alphaCount] = await Promise.all([
      prisma.karyawan.count({ where: { status: 'AKTIF' } }),
      prisma.absensi.count({ where: { tanggal: targetDate, status: { in: ['HADIR', 'TERLAMBAT'] } } }),
      prisma.absensi.count({ where: { tanggal: targetDate, status: { in: ['IZIN', 'CUTI'] } } }),
      prisma.absensi.count({ where: { tanggal: targetDate, status: 'ALPHA' } }),
    ]);

    // ════════════════════════════════════════════════════
    // 2) INVENTORY
    // ════════════════════════════════════════════════════

    const [ayamMasukAgg, ayamMatiAgg, ayamKeluarHidupAgg, totalMasukAll, totalMatiAll, totalKeluarAll] = await Promise.all([
      // Ayam masuk hari ini
      prisma.barangMasuk.aggregate({
        where: { tanggal_masuk: { gte: targetDate, lt: nextDate } },
        _sum: { jumlah_ekor: true },
      }),
      // Ayam mati hari ini
      prisma.ayamMati.aggregate({
        where: { tanggal: { gte: targetDate, lt: nextDate } },
        _sum: { jumlah_ekor: true },
      }),
      // Ayam keluar hidup hari ini
      prisma.barangKeluarAyamHidup.aggregate({
        where: { tanggal: { gte: targetDate, lt: nextDate } },
        _sum: { jumlah_ekor: true },
      }),
      // ── Stok tersisa (all-time) ──
      prisma.barangMasuk.aggregate({ _sum: { jumlah_ekor: true } }),
      prisma.ayamMati.aggregate({ _sum: { jumlah_ekor: true } }),
      prisma.barangKeluarAyamHidup.aggregate({ _sum: { jumlah_ekor: true } }),
    ]);

    const ayamMasuk = ayamMasukAgg._sum.jumlah_ekor ?? 0;
    const ayamMati = ayamMatiAgg._sum.jumlah_ekor ?? 0;
    const ayamKeluar = (ayamKeluarHidupAgg._sum.jumlah_ekor ?? 0);
    const stokTersisa =
      (totalMasukAll._sum.jumlah_ekor ?? 0) -
      (totalMatiAll._sum.jumlah_ekor ?? 0) -
      (totalKeluarAll._sum.jumlah_ekor ?? 0);

    // ════════════════════════════════════════════════════
    // 3) KEUANGAN (konsisten dengan /api/keuangan/harian)
    // Pemasukan = SEMUA pembayaran hari ini (termasuk pelunasan piutang)
    // ════════════════════════════════════════════════════

    const [pembayaranHarianAgg, beliAyamAgg] =
      await Promise.all([
        // Kas masuk – SEMUA pembayaran hari ini (termasuk pelunasan hutang lama)
        prisma.pembayaranPiutang.aggregate({
          where: {
            tanggal: { gte: targetDate, lt: nextDate },
          },
          _sum: { jumlah_bayar: true },
        }),
        // Pengeluaran – beli ayam
        prisma.barangMasuk.aggregate({
          where: { tanggal_masuk: { gte: targetDate, lt: nextDate } },
          _sum: { total_harga: true },
        }),
      ]);

    // Hitung kerugian ayam mati (tidak bisa claim)
    const ayamMatiTidakBisaClaim = await prisma.ayamMati.findMany({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
        status_claim: 'TIDAK_BISA',
      },
    });

    let totalKerugianAyamMati = 0;
    for (const am of ayamMatiTidakBisaClaim) {
      const barangMasukRef = await prisma.barangMasuk.findFirst({
        where: {
          perusahaan_id: am.perusahaan_id,
          tanggal_masuk: { lte: am.tanggal },
        },
        orderBy: { tanggal_masuk: 'desc' },
      });
      if (barangMasukRef) {
        const totalKg = parseFloat(barangMasukRef.total_kg.toString());
        const jumlahEkor = barangMasukRef.jumlah_ekor;
        const hargaPerKg = parseFloat(barangMasukRef.harga_per_kg.toString());
        const bw = jumlahEkor > 0 ? totalKg / jumlahEkor : 0;
        totalKerugianAyamMati += am.jumlah_ekor * bw * hargaPerKg;
      }
    }

    const pemasukan =
      parseFloat(pembayaranHarianAgg._sum.jumlah_bayar?.toString() ?? '0');

    const pengeluaran =
      parseFloat(beliAyamAgg._sum.total_harga?.toString() ?? '0') +
      totalKerugianAyamMati;

    const saldo = pemasukan - pengeluaran;

    // ════════════════════════════════════════════════════
    // RESPONSE
    // ════════════════════════════════════════════════════

    return NextResponse.json({
      success: true,
      data: {
        tanggal: dateStr,
        absensi: {
          total_karyawan: totalKaryawan,
          hadir: hadirCount,
          izin: izinCutiCount,
          alpha: alphaCount,
        },
        inventory: {
          ayam_masuk: ayamMasuk,
          ayam_keluar: ayamKeluar,
          ayam_mati: ayamMati,
          stok_tersisa: stokTersisa,
        },
        keuangan: {
          pemasukan,
          pengeluaran,
          saldo,
        },
      },
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
