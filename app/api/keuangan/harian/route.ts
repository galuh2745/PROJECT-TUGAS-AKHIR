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
    // Revenue ONLY from Penjualan (linked to BarangKeluar) + PembayaranPiutang
    // NO double counting - BarangKeluar.total_penjualan/saldo NOT used for revenue

    // 1. Penjualan (kas masuk dari penjualan hari ini)
    const penjualanHariIni = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
      },
      _sum: { jumlah_bayar: true, total_penjualan: true, sisa_piutang: true },
    });

    // 1a. Penjualan by jenis_transaksi (for breakdown)
    const penjualanDagingAgg = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
        jenis_transaksi: 'DAGING',
      },
      _sum: { jumlah_bayar: true },
    });

    const penjualanAyamHidupAgg = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
        jenis_transaksi: 'AYAM_HIDUP',
      },
      _sum: { jumlah_bayar: true },
    });

    // 2. Pembayaran Piutang → kas masuk dari pelunasan hutang
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

    // ==================== PENGELUARAN ====================

    // 1. Barang Masuk (Beli Ayam) → barang_masuk.total_harga
    const beliAyam = await prisma.barangMasuk.aggregate({
      where: {
        tanggal_masuk: { gte: targetDate, lt: nextDate },
      },
      _sum: { total_harga: true },
    });

    // 2. Pengeluaran Operasional Daging → barang_keluar_daging.pengeluaran
    const pengeluaranDaging = await prisma.barangKeluarDaging.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
      },
      _sum: { pengeluaran: true },
    });

    // 3. Pengeluaran Operasional Ayam Hidup → barang_keluar_ayam_hidup.pengeluaran
    const pengeluaranAyamHidup = await prisma.barangKeluarAyamHidup.aggregate({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
      },
      _sum: { pengeluaran: true },
    });

    // 4. Ayam Mati TIDAK BISA CLAIM → hitung kerugian
    const ayamMatiTidakBisaClaim = await prisma.ayamMati.findMany({
      where: {
        tanggal: { gte: targetDate, lt: nextDate },
        status_claim: 'TIDAK_BISA',
      },
      include: {
        perusahaan: true,
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

    const totalPengeluaran =
      totalBeliAyam + totalPengeluaranDaging + totalPengeluaranAyamHidup + totalKerugianAyamMati;

    const saldoHarian = totalKasMasuk - totalPengeluaran;

    // ==================== PIUTANG ====================

    // Piutang baru hari ini (sisa_piutang dari penjualan hari ini)
    const piutangBaru = parseFloat(penjualanHariIni._sum.sisa_piutang?.toString() || '0');

    // Pelunasan hari ini
    const pelunasanHariIni = kasMasukPelunasan;

    // Total piutang aktif (all time)
    const totalPiutangAktif = await prisma.penjualan.aggregate({
      where: { sisa_piutang: { gt: 0 } },
      _sum: { sisa_piutang: true },
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
