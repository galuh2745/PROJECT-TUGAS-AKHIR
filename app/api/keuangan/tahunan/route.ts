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
    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year + 1, 0, 1));

    // ==================== TOTAL TAHUNAN ====================

    // ── PEMASUKAN: Pakai PembayaranPiutang sebagai satu-satunya sumber kas masuk ──
    // Menghindari double-counting karena penjualan.jumlah_bayar bersifat kumulatif
    const pembayaranTahunIni = await prisma.pembayaranPiutang.findMany({
      where: {
        tanggal: { gte: startDate, lt: endDate },
      },
      include: {
        penjualan: {
          select: { jenis_transaksi: true, tanggal: true },
        },
      },
    });

    let kasMasukDaging = 0;
    let kasMasukAyamHidup = 0;
    let kasMasukCampuran = 0;
    let kasMasukPelunasan = 0;

    for (const p of pembayaranTahunIni) {
      const jumlah = parseFloat(p.jumlah_bayar.toString());
      const jenis = p.penjualan?.jenis_transaksi || 'MANUAL';
      const tanggalPenjualan = p.penjualan?.tanggal;

      // Cek apakah pembayaran untuk penjualan HARI YANG SAMA (bukan pelunasan hutang lama)
      const isSameDay = tanggalPenjualan &&
        tanggalPenjualan.toISOString().split('T')[0] === p.tanggal.toISOString().split('T')[0];

      if (isSameDay) {
        if (jenis === 'DAGING') kasMasukDaging += jumlah;
        else if (jenis === 'AYAM_HIDUP') kasMasukAyamHidup += jumlah;
        else if (jenis === 'CAMPURAN') kasMasukCampuran += jumlah;
        else kasMasukDaging += jumlah;
      } else {
        kasMasukPelunasan += jumlah;
      }
    }

    // Pemasukan keuangan = SEMUA kas masuk tahun ini (termasuk pelunasan piutang)
    const totalPemasukan = kasMasukDaging + kasMasukAyamHidup + kasMasukCampuran + kasMasukPelunasan;

    // Info penjualan (grand_total) - hanya untuk display
    const penjualanAllTahunan = await prisma.penjualan.aggregate({
      where: {
        tanggal: { gte: startDate, lt: endDate },
      },
      _sum: { grand_total: true, sisa_piutang: true },
    });

    const totalPenjualanTahunan = parseFloat(penjualanAllTahunan._sum.grand_total?.toString() || '0');
    const piutangBaruTahunan = parseFloat(penjualanAllTahunan._sum.sisa_piutang?.toString() || '0');

    // ── PENGELUARAN ──
    // Pengeluaran operasional BK sudah dikurangi di saldo/total_bersih, tidak dihitung ulang
    const beliAyam = await prisma.barangMasuk.aggregate({
      where: { tanggal_masuk: { gte: startDate, lt: endDate } },
      _sum: { total_harga: true },
    });

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

    const totalBeliAyam = parseFloat(beliAyam._sum.total_harga?.toString() || '0');
    const totalPengeluaran = totalBeliAyam + totalKerugianAyamMati;
    const saldoTahunan = totalPemasukan - totalPengeluaran;

    // ==================== REKAP BULANAN ====================
    const rekapBulanan = [];
    const currentDate = new Date();

    for (let m = 1; m <= 12; m++) {
      if (year === currentDate.getFullYear() && m > currentDate.getMonth() + 1) break;

      const monthStart = new Date(Date.UTC(year, m - 1, 1));
      const monthEnd = new Date(Date.UTC(year, m, 1));

      const [pembayaranMonthAll, beliMonth] = await Promise.all([
        // Kas masuk: findMany untuk filter sama hari
        prisma.pembayaranPiutang.findMany({
          where: { tanggal: { gte: monthStart, lt: monthEnd } },
          include: { penjualan: { select: { tanggal: true } } },
        }),
        prisma.barangMasuk.aggregate({
          where: { tanggal_masuk: { gte: monthStart, lt: monthEnd } },
          _sum: { total_harga: true },
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

      // Hitung pemasukan: SEMUA pembayaran bulan ini (termasuk pelunasan)
      let pemasukanMonth = 0;
      for (const p of pembayaranMonthAll) {
        pemasukanMonth += parseFloat(p.jumlah_bayar.toString());
      }

      const pengeluaranMonth =
        parseFloat(beliMonth._sum.total_harga?.toString() || '0') +
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
          penjualan_daging: kasMasukDaging,
          penjualan_ayam_hidup: kasMasukAyamHidup,
          penjualan_campuran: kasMasukCampuran,
          pelunasan_piutang: kasMasukPelunasan,
          total: totalPemasukan,
        },
        total_penjualan_tahunan: totalPenjualanTahunan,
        pengeluaran: {
          beli_ayam: totalBeliAyam,
          kerugian_ayam_mati: totalKerugianAyamMati,
          total: totalPengeluaran,
        },
        saldo_tahunan: saldoTahunan,
        piutang: {
          piutang_baru: piutangBaruTahunan,
          pelunasan: kasMasukPelunasan,
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
