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

// GET /api/keuangan/bulanan?month=YYYY-MM
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month');

    if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
      return NextResponse.json(
        { success: false, error: 'Parameter month wajib diisi dengan format YYYY-MM' },
        { status: 400 }
      );
    }

    const [year, month] = monthParam.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // ==================== PEMASUKAN ====================

    const penjualanDagingBulanan = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: startDate, lt: endDate },
        jenis_transaksi: 'DAGING',
      },
      _sum: { jumlah_bayar: true, grand_total: true },
    });

    const penjualanAyamHidupBulanan = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: startDate, lt: endDate },
        jenis_transaksi: 'AYAM_HIDUP',
      },
      _sum: { jumlah_bayar: true, grand_total: true },
    });

    const penjualanBulananAll = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: startDate, lt: endDate },
      },
      _sum: { sisa_piutang: true, grand_total: true },
    });

    const pembayaranPiutangBulanan = await prisma.pembayaranPiutang.aggregate({
      where: {
        tanggal: { gte: startDate, lt: endDate },
      },
      _sum: { jumlah_bayar: true },
    });

    const kasMasukDaging = parseFloat(penjualanDagingBulanan._sum.jumlah_bayar?.toString() || '0');
    const kasMasukAyamHidup = parseFloat(penjualanAyamHidupBulanan._sum.jumlah_bayar?.toString() || '0');
    const kasMasukPelunasan = parseFloat(pembayaranPiutangBulanan._sum.jumlah_bayar?.toString() || '0');
    const piutangBaruBulanan = parseFloat(penjualanBulananAll._sum.sisa_piutang?.toString() || '0');
    const totalPenjualanBulanan = parseFloat(penjualanBulananAll._sum.grand_total?.toString() || '0');
    const totalPemasukan = kasMasukDaging + kasMasukAyamHidup + kasMasukPelunasan;

    // ==================== PENGELUARAN ====================

    const beliAyam = await prisma.barangMasuk.aggregate({
      where: { tanggal_masuk: { gte: startDate, lt: endDate } },
      _sum: { total_harga: true },
    });

    const pengeluaranDaging = await prisma.barangKeluarDaging.aggregate({
      where: { tanggal: { gte: startDate, lt: endDate } },
      _sum: { pengeluaran: true },
    });

    const pengeluaranAyamHidup = await prisma.barangKeluarAyamHidup.aggregate({
      where: { tanggal: { gte: startDate, lt: endDate } },
      _sum: { pengeluaran: true },
    });

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

    const totalBeliAyam = parseFloat(beliAyam._sum.total_harga?.toString() || '0');
    const totalPengeluaranDaging = parseFloat(pengeluaranDaging._sum.pengeluaran?.toString() || '0');
    const totalPengeluaranAyamHidup = parseFloat(pengeluaranAyamHidup._sum.pengeluaran?.toString() || '0');
    const totalPengeluaran = totalBeliAyam + totalPengeluaranDaging + totalPengeluaranAyamHidup + totalKerugianAyamMati;
    const saldoBulanan = totalPemasukan - totalPengeluaran;

    // ==================== REKAP HARIAN ====================
    const daysInMonth = new Date(year, month, 0).getDate();
    const rekapHarian = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStart = new Date(year, month - 1, day);
      const dayEnd = new Date(year, month - 1, day + 1);

      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (dayStart > today) break;

      const [beliDay, penDagingDay, penAyamHidupDay, penjualanDay, pelunasanDay] = await Promise.all([
        prisma.barangMasuk.aggregate({
          where: { tanggal_masuk: { gte: dayStart, lt: dayEnd } },
          _sum: { total_harga: true },
        }),
        prisma.barangKeluarDaging.aggregate({
          where: { tanggal: { gte: dayStart, lt: dayEnd } },
          _sum: { pengeluaran: true },
        }),
        prisma.barangKeluarAyamHidup.aggregate({
          where: { tanggal: { gte: dayStart, lt: dayEnd } },
          _sum: { pengeluaran: true },
        }),
        prisma.penjualan.aggregate({
          where: { tanggal: { gte: dayStart, lt: dayEnd } },
          _sum: { jumlah_bayar: true },
        }),
        prisma.pembayaranPiutang.aggregate({
          where: { tanggal: { gte: dayStart, lt: dayEnd } },
          _sum: { jumlah_bayar: true },
        }),
      ]);

      const ayamMatiDay = await prisma.ayamMati.findMany({
        where: {
          tanggal: { gte: dayStart, lt: dayEnd },
          status_claim: 'TIDAK_BISA',
        },
      });

      let kerugianDay = 0;
      for (const am of ayamMatiDay) {
        const ref = await prisma.barangMasuk.findFirst({
          where: {
            perusahaan_id: am.perusahaan_id,
            tanggal_masuk: { lte: am.tanggal },
          },
          orderBy: { tanggal_masuk: 'desc' },
        });
        if (ref) {
          const bw = ref.jumlah_ekor > 0 ? parseFloat(ref.total_kg.toString()) / ref.jumlah_ekor : 0;
          kerugianDay += am.jumlah_ekor * bw * parseFloat(ref.harga_per_kg.toString());
        }
      }

      const kasMasukPenjualanDay = parseFloat(penjualanDay._sum.jumlah_bayar?.toString() || '0');
      const kasMasukPelunasanDay = parseFloat(pelunasanDay._sum.jumlah_bayar?.toString() || '0');
      const pemasukanDay = kasMasukPenjualanDay + kasMasukPelunasanDay;

      const pengeluaranDay =
        parseFloat(beliDay._sum.total_harga?.toString() || '0') +
        parseFloat(penDagingDay._sum.pengeluaran?.toString() || '0') +
        parseFloat(penAyamHidupDay._sum.pengeluaran?.toString() || '0') +
        kerugianDay;

      const saldoDay = pemasukanDay - pengeluaranDay;

      if (pemasukanDay !== 0 || pengeluaranDay !== 0) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        rekapHarian.push({
          tanggal: dateStr,
          pemasukan: pemasukanDay,
          pengeluaran: pengeluaranDay,
          saldo: saldoDay,
        });
      }
    }

    // Total piutang aktif
    const totalPiutangAktifBulanan = await prisma.penjualan.aggregate({
      where: { sisa_piutang: { gt: 0 } },
      _sum: { sisa_piutang: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        bulan: monthParam,
        pemasukan: {
          penjualan_daging: kasMasukDaging,
          penjualan_ayam_hidup: kasMasukAyamHidup,
          kas_masuk_pelunasan: kasMasukPelunasan,
          total: totalPemasukan,
        },
        total_penjualan_bulanan: totalPenjualanBulanan,
        pengeluaran: {
          beli_ayam: totalBeliAyam,
          operasional_daging: totalPengeluaranDaging,
          operasional_ayam_hidup: totalPengeluaranAyamHidup,
          kerugian_ayam_mati: totalKerugianAyamMati,
          total: totalPengeluaran,
        },
        saldo_bulanan: saldoBulanan,
        piutang: {
          piutang_baru: piutangBaruBulanan,
          pelunasan: kasMasukPelunasan,
          total_piutang_aktif: parseFloat(totalPiutangAktifBulanan._sum.sisa_piutang?.toString() || '0'),
        },
        rekap_harian: rekapHarian,
      },
    });
  } catch (error) {
    console.error('Error fetching keuangan bulanan:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data keuangan bulanan' },
      { status: 500 }
    );
  }
}
