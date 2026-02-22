import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

async function validateAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    return { error: 'Unauthorized', status: 401 };
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  const { role } = payload as { userId: number; role: string };

  if (role !== 'ADMIN' && role !== 'OWNER') {
    return { error: 'Forbidden - Hanya admin yang dapat mengakses', status: 403 };
  }

  return { role };
}

// GET /api/keuangan/tahunan?year=YYYY
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');

    if (!yearParam || !/^\d{4}$/.test(yearParam)) {
      return NextResponse.json(
        { success: false, error: 'Parameter year wajib diisi dengan format YYYY' },
        { status: 400 }
      );
    }

    const year = parseInt(yearParam);
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    // ==================== TOTAL TAHUNAN ====================

    const [penjualanDagingTahunan, penjualanAyamHidupTahunan, penjualanAllTahunan, pembayaranPiutangTahunan, beliAyam, pengeluaranDaging, pengeluaranAyamHidup] =
      await Promise.all([
        prisma.penjualan.aggregate({
          where: { tanggal: { gte: startDate, lt: endDate }, jenis_transaksi: 'DAGING' },
          _sum: { jumlah_bayar: true, grand_total: true },
        }),
        prisma.penjualan.aggregate({
          where: { tanggal: { gte: startDate, lt: endDate }, jenis_transaksi: 'AYAM_HIDUP' },
          _sum: { jumlah_bayar: true, grand_total: true },
        }),
        prisma.penjualan.aggregate({
          where: { tanggal: { gte: startDate, lt: endDate } },
          _sum: { grand_total: true, sisa_piutang: true },
        }),
        prisma.pembayaranPiutang.aggregate({
          where: { tanggal: { gte: startDate, lt: endDate } },
          _sum: { jumlah_bayar: true },
        }),
        prisma.barangMasuk.aggregate({
          where: { tanggal_masuk: { gte: startDate, lt: endDate } },
          _sum: { total_harga: true },
        }),
        prisma.barangKeluarDaging.aggregate({
          where: { tanggal: { gte: startDate, lt: endDate } },
          _sum: { pengeluaran: true },
        }),
        prisma.barangKeluarAyamHidup.aggregate({
          where: { tanggal: { gte: startDate, lt: endDate } },
          _sum: { pengeluaran: true },
        }),
      ]);

    // Ayam Mati TIDAK BISA CLAIM
    const ayamMatiTidakBisaClaim = await prisma.ayamMati.findMany({
      where: {
        tanggal: { gte: startDate, lt: endDate },
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
        const nilaiPerEkor = bw * hargaPerKg;
        totalKerugianAyamMati += am.jumlah_ekor * nilaiPerEkor;
      }
    }

    const totalPenjualanDaging = parseFloat(penjualanDagingTahunan._sum.jumlah_bayar?.toString() || '0');
    const totalPenjualanAyamHidup = parseFloat(penjualanAyamHidupTahunan._sum.jumlah_bayar?.toString() || '0');
    const totalPelunasan = parseFloat(pembayaranPiutangTahunan._sum.jumlah_bayar?.toString() || '0');
    const totalPemasukan = totalPenjualanDaging + totalPenjualanAyamHidup + totalPelunasan;
    const totalPenjualanTahunan = parseFloat(penjualanAllTahunan._sum.grand_total?.toString() || '0');
    const piutangBaruTahunan = parseFloat(penjualanAllTahunan._sum.sisa_piutang?.toString() || '0');

    const totalBeliAyam = parseFloat(beliAyam._sum.total_harga?.toString() || '0');
    const totalPengeluaranDaging = parseFloat(pengeluaranDaging._sum.pengeluaran?.toString() || '0');
    const totalPengeluaranAyamHidup = parseFloat(pengeluaranAyamHidup._sum.pengeluaran?.toString() || '0');
    const totalPengeluaran = totalBeliAyam + totalPengeluaranDaging + totalPengeluaranAyamHidup + totalKerugianAyamMati;
    const saldoTahunan = totalPemasukan - totalPengeluaran;

    // ==================== REKAP BULANAN ====================
    const rekapBulanan = [];
    const currentDate = new Date();

    for (let m = 1; m <= 12; m++) {
      if (year === currentDate.getFullYear() && m > currentDate.getMonth() + 1) break;

      const monthStart = new Date(year, m - 1, 1);
      const monthEnd = new Date(year, m, 1);

      const [penjualanMonth, pelunasanMonth, beliMonth, penDagingMonth, penAyamHidupMonth] = await Promise.all([
        prisma.penjualan.aggregate({
          where: { tanggal: { gte: monthStart, lt: monthEnd } },
          _sum: { jumlah_bayar: true },
        }),
        prisma.pembayaranPiutang.aggregate({
          where: { tanggal: { gte: monthStart, lt: monthEnd } },
          _sum: { jumlah_bayar: true },
        }),
        prisma.barangMasuk.aggregate({
          where: { tanggal_masuk: { gte: monthStart, lt: monthEnd } },
          _sum: { total_harga: true },
        }),
        prisma.barangKeluarDaging.aggregate({
          where: { tanggal: { gte: monthStart, lt: monthEnd } },
          _sum: { pengeluaran: true },
        }),
        prisma.barangKeluarAyamHidup.aggregate({
          where: { tanggal: { gte: monthStart, lt: monthEnd } },
          _sum: { pengeluaran: true },
        }),
      ]);

      const ayamMatiMonth = await prisma.ayamMati.findMany({
        where: {
          tanggal: { gte: monthStart, lt: monthEnd },
          status_claim: 'TIDAK_BISA',
        },
      });

      let kerugianMonth = 0;
      for (const am of ayamMatiMonth) {
        const ref = await prisma.barangMasuk.findFirst({
          where: {
            perusahaan_id: am.perusahaan_id,
            tanggal_masuk: { lte: am.tanggal },
          },
          orderBy: { tanggal_masuk: 'desc' },
        });
        if (ref) {
          const bw = ref.jumlah_ekor > 0 ? parseFloat(ref.total_kg.toString()) / ref.jumlah_ekor : 0;
          kerugianMonth += am.jumlah_ekor * bw * parseFloat(ref.harga_per_kg.toString());
        }
      }

      const pemasukanMonth =
        parseFloat(penjualanMonth._sum.jumlah_bayar?.toString() || '0') +
        parseFloat(pelunasanMonth._sum.jumlah_bayar?.toString() || '0');

      const pengeluaranMonth =
        parseFloat(beliMonth._sum.total_harga?.toString() || '0') +
        parseFloat(penDagingMonth._sum.pengeluaran?.toString() || '0') +
        parseFloat(penAyamHidupMonth._sum.pengeluaran?.toString() || '0') +
        kerugianMonth;

      const saldoMonth = pemasukanMonth - pengeluaranMonth;

      const monthStr = `${year}-${String(m).padStart(2, '0')}`;
      rekapBulanan.push({
        bulan: monthStr,
        pemasukan: pemasukanMonth,
        pengeluaran: pengeluaranMonth,
        saldo: saldoMonth,
      });
    }

    // Total piutang aktif
    const totalPiutangAktif = await prisma.penjualan.aggregate({
      where: { sisa_piutang: { gt: 0 } },
      _sum: { sisa_piutang: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        tahun: yearParam,
        pemasukan: {
          penjualan_daging: totalPenjualanDaging,
          penjualan_ayam_hidup: totalPenjualanAyamHidup,
          kas_masuk_pelunasan: totalPelunasan,
          total: totalPemasukan,
        },
        total_penjualan_tahunan: totalPenjualanTahunan,
        pengeluaran: {
          beli_ayam: totalBeliAyam,
          operasional_daging: totalPengeluaranDaging,
          operasional_ayam_hidup: totalPengeluaranAyamHidup,
          kerugian_ayam_mati: totalKerugianAyamMati,
          total: totalPengeluaran,
        },
        saldo_tahunan: saldoTahunan,
        piutang: {
          piutang_baru: piutangBaruTahunan,
          pelunasan: totalPelunasan,
          total_piutang_aktif: parseFloat(totalPiutangAktif._sum.sisa_piutang?.toString() || '0'),
        },
        rekap_bulanan: rekapBulanan,
      },
    });
  } catch (error) {
    console.error('Error fetching keuangan tahunan:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data keuangan tahunan' },
      { status: 500 }
    );
  }
}
