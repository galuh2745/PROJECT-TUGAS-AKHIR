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

// GET /api/keuangan/harian?date=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json(
        { success: false, error: 'Parameter date wajib diisi dengan format YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const targetDate = new Date(dateParam);
    const nextDate = new Date(dateParam);
    nextDate.setDate(nextDate.getDate() + 1);

    // ==================== KAS MASUK (PEMASUKAN NYATA) ====================

    // 1. Penjualan hari ini (kas masuk = jumlah_bayar saat transaksi)
    const penjualanHariIni = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
      },
      _sum: { jumlah_bayar: true, grand_total: true, sisa_piutang: true },
    });

    // 1a. Breakdown by jenis_transaksi
    const penjualanDagingAgg = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
        jenis_transaksi: 'DAGING',
      },
      _sum: { jumlah_bayar: true, grand_total: true },
    });

    const penjualanAyamHidupAgg = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
        jenis_transaksi: 'AYAM_HIDUP',
      },
      _sum: { jumlah_bayar: true, grand_total: true },
    });

    // 2. Pembayaran Piutang → kas masuk dari pelunasan hutang (FIFO)
    const pembayaranPiutang = await prisma.pembayaranPiutang.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
      },
      _sum: { jumlah_bayar: true },
    });

    const kasMasukDaging = parseFloat(penjualanDagingAgg._sum.jumlah_bayar?.toString() || '0');
    const kasMasukAyamHidup = parseFloat(penjualanAyamHidupAgg._sum.jumlah_bayar?.toString() || '0');
    const kasMasukPelunasan = parseFloat(pembayaranPiutang._sum.jumlah_bayar?.toString() || '0');
    const totalKasMasuk = kasMasukDaging + kasMasukAyamHidup + kasMasukPelunasan;

    // Penjualan total (grand_total = total - pengeluaran)
    const penjualanDagingTotal = parseFloat(penjualanDagingAgg._sum.grand_total?.toString() || '0');
    const penjualanAyamHidupTotal = parseFloat(penjualanAyamHidupAgg._sum.grand_total?.toString() || '0');

    // ==================== PENGELUARAN ====================

    const beliAyam = await prisma.barangMasuk.aggregate({
      where: { tanggal_masuk: { gte: targetDate, lt: nextDate } },
      _sum: { total_harga: true },
    });

    const pengeluaranDaging = await prisma.barangKeluarDaging.aggregate({
      where: { tanggal: { gte: targetDate, lt: nextDate } },
      _sum: { pengeluaran: true },
    });

    const pengeluaranAyamHidup = await prisma.barangKeluarAyamHidup.aggregate({
      where: { tanggal: { gte: targetDate, lt: nextDate } },
      _sum: { pengeluaran: true },
    });

    // Ayam Mati TIDAK BISA CLAIM
    const ayamMatiTidakBisaClaim = await prisma.ayamMati.findMany({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
        status_claim: 'TIDAK_BISA',
      },
      include: { perusahaan: true },
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
    const saldoHarian = totalKasMasuk - totalPengeluaran;

    // ==================== PIUTANG ====================

    const piutangBaru = parseFloat(penjualanHariIni._sum.sisa_piutang?.toString() || '0');
    const pelunasanHariIni = kasMasukPelunasan;

    // Total piutang aktif (all time)
    const totalPiutangAktif = await prisma.penjualan.aggregate({
      where: { sisa_piutang: { gt: 0 } },
      _sum: { sisa_piutang: true },
    });

    // Transaksi detail hari ini
    const transaksiHariIni = await prisma.penjualan.findMany({
      where: { tanggal: { gte: targetDate, lt: nextDate } },
      include: {
        customer: { select: { nama: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const pembayaranHariIni = await prisma.pembayaranPiutang.findMany({
      where: { tanggal: { gte: targetDate, lt: nextDate } },
      include: {
        customer: { select: { nama: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        tanggal: dateParam,
        pemasukan: {
          penjualan_daging: kasMasukDaging,
          penjualan_ayam_hidup: kasMasukAyamHidup,
          kas_masuk_pelunasan: kasMasukPelunasan,
          total: totalKasMasuk,
        },
        penjualan_hari_ini: {
          daging: penjualanDagingTotal,
          ayam_hidup: penjualanAyamHidupTotal,
          total: penjualanDagingTotal + penjualanAyamHidupTotal,
        },
        pengeluaran: {
          beli_ayam: totalBeliAyam,
          operasional_daging: totalPengeluaranDaging,
          operasional_ayam_hidup: totalPengeluaranAyamHidup,
          kerugian_ayam_mati: totalKerugianAyamMati,
          total: totalPengeluaran,
        },
        saldo_harian: saldoHarian,
        piutang: {
          piutang_baru: piutangBaru,
          pelunasan: pelunasanHariIni,
          total_piutang_aktif: parseFloat(totalPiutangAktif._sum.sisa_piutang?.toString() || '0'),
        },
        detail_transaksi: transaksiHariIni.map((t) => ({
          id: t.id.toString(),
          nomor_nota: t.nomor_nota,
          customer_nama: t.customer.nama,
          jenis_transaksi: t.jenis_transaksi,
          grand_total: parseFloat(t.grand_total.toString()),
          jumlah_bayar: parseFloat(t.jumlah_bayar.toString()),
          sisa_piutang: parseFloat(t.sisa_piutang.toString()),
          status: t.status,
        })),
        detail_pembayaran: pembayaranHariIni.map((p) => ({
          id: p.id.toString(),
          customer_nama: p.customer.nama,
          jumlah_bayar: parseFloat(p.jumlah_bayar.toString()),
          metode: p.metode,
          keterangan: p.keterangan,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching keuangan harian:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data keuangan harian' },
      { status: 500 }
    );
  }
}
