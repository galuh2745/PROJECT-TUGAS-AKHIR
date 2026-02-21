import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initPdf, addWatermark, addHeader, addFooter, setMeta, getAuthInfo, fmtRp } from '@/lib/pdf-helper';
import autoTable from 'jspdf-autotable';

const NAMA_BULAN: Record<number, string> = {
  1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April', 5: 'Mei', 6: 'Juni',
  7: 'Juli', 8: 'Agustus', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
};

export async function GET(req: Request) {
  try {
    const auth = await getAuthInfo();
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'OWNER'))
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    if (!yearParam) return NextResponse.json({ success: false, error: 'Parameter year wajib' }, { status: 400 });

    const year = parseInt(yearParam);
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    // Yearly aggregates
    const penjualanDaging = await prisma.penjualan.aggregate({ where: { tanggal: { gte: startDate, lt: endDate }, jenis_transaksi: 'DAGING' }, _sum: { jumlah_bayar: true } });
    const penjualanAyam = await prisma.penjualan.aggregate({ where: { tanggal: { gte: startDate, lt: endDate }, jenis_transaksi: 'AYAM_HIDUP' }, _sum: { jumlah_bayar: true } });
    const pelunasan = await prisma.pembayaranPiutang.aggregate({ where: { tanggal: { gte: startDate, lt: endDate } }, _sum: { jumlah_bayar: true } });

    const kasDaging = parseFloat(penjualanDaging._sum.jumlah_bayar?.toString() || '0');
    const kasAyam = parseFloat(penjualanAyam._sum.jumlah_bayar?.toString() || '0');
    const kasPelunasan = parseFloat(pelunasan._sum.jumlah_bayar?.toString() || '0');
    const totalMasuk = kasDaging + kasAyam + kasPelunasan;

    const beliAyam = await prisma.barangMasuk.aggregate({ where: { tanggal_masuk: { gte: startDate, lt: endDate } }, _sum: { total_harga: true } });
    const penDaging = await prisma.barangKeluarDaging.aggregate({ where: { tanggal: { gte: startDate, lt: endDate } }, _sum: { pengeluaran: true } });
    const penAyam = await prisma.barangKeluarAyamHidup.aggregate({ where: { tanggal: { gte: startDate, lt: endDate } }, _sum: { pengeluaran: true } });

    const ayamMatiTidakBisa = await prisma.ayamMati.findMany({ where: { tanggal: { gte: startDate, lt: endDate }, status_claim: 'TIDAK_BISA' }, include: { perusahaan: true } });
    let totalKerugian = 0;
    for (const am of ayamMatiTidakBisa) {
      const ref = await prisma.barangMasuk.findFirst({ where: { perusahaan_id: am.perusahaan_id, tanggal_masuk: { lte: am.tanggal } }, orderBy: { tanggal_masuk: 'desc' } });
      if (ref) {
        const bw = ref.jumlah_ekor > 0 ? parseFloat(ref.total_kg.toString()) / ref.jumlah_ekor : 0;
        totalKerugian += am.jumlah_ekor * bw * parseFloat(ref.harga_per_kg.toString());
      }
    }

    const tBeli = parseFloat(beliAyam._sum.total_harga?.toString() || '0');
    const tPenDaging = parseFloat(penDaging._sum.pengeluaran?.toString() || '0');
    const tPenAyam = parseFloat(penAyam._sum.pengeluaran?.toString() || '0');
    const totalKeluar = tBeli + tPenDaging + tPenAyam + totalKerugian;
    const saldo = totalMasuk - totalKeluar;

    // Monthly breakdown
    const today = new Date();
    const lastMonth = today.getFullYear() === year ? today.getMonth() + 1 : 12;
    const monthlyData: { bulan: string; masuk: number; keluar: number; saldo: number }[] = [];

    for (let m = 1; m <= lastMonth; m++) {
      const mStart = new Date(year, m - 1, 1);
      const mEnd = new Date(year, m, 1);

      const [mPenjualan, mPelunasan, mBeli, mPenDaging2, mPenAyam2] = await Promise.all([
        prisma.penjualan.aggregate({ where: { tanggal: { gte: mStart, lt: mEnd } }, _sum: { jumlah_bayar: true } }),
        prisma.pembayaranPiutang.aggregate({ where: { tanggal: { gte: mStart, lt: mEnd } }, _sum: { jumlah_bayar: true } }),
        prisma.barangMasuk.aggregate({ where: { tanggal_masuk: { gte: mStart, lt: mEnd } }, _sum: { total_harga: true } }),
        prisma.barangKeluarDaging.aggregate({ where: { tanggal: { gte: mStart, lt: mEnd } }, _sum: { pengeluaran: true } }),
        prisma.barangKeluarAyamHidup.aggregate({ where: { tanggal: { gte: mStart, lt: mEnd } }, _sum: { pengeluaran: true } }),
      ]);

      const masuk = parseFloat(mPenjualan._sum.jumlah_bayar?.toString() || '0') + parseFloat(mPelunasan._sum.jumlah_bayar?.toString() || '0');
      const keluar = parseFloat(mBeli._sum.total_harga?.toString() || '0') + parseFloat(mPenDaging2._sum.pengeluaran?.toString() || '0') + parseFloat(mPenAyam2._sum.pengeluaran?.toString() || '0');

      monthlyData.push({ bulan: NAMA_BULAN[m], masuk, keluar, saldo: masuk - keluar });
    }

    const doc = initPdf();
    addWatermark(doc);
    addHeader(doc, 'LAPORAN KEUANGAN TAHUNAN', `Tahun ${yearParam}`);

    // Summary section
    const summaryRows = [
      ['KAS MASUK', '', ''],
      ['  Penjualan Daging', '', fmtRp(kasDaging)],
      ['  Penjualan Ayam Hidup', '', fmtRp(kasAyam)],
      ['  Pelunasan Piutang', '', fmtRp(kasPelunasan)],
      ['  Total Kas Masuk', '', fmtRp(totalMasuk)],
      ['', '', ''],
      ['PENGELUARAN', '', ''],
      ['  Beli Ayam', '', fmtRp(tBeli)],
      ['  Operasional Daging', '', fmtRp(tPenDaging)],
      ['  Operasional Ayam Hidup', '', fmtRp(tPenAyam)],
      ['  Kerugian Ayam Mati', '', fmtRp(totalKerugian)],
      ['  Total Pengeluaran', '', fmtRp(totalKeluar)],
      ['', '', ''],
      ['SALDO TAHUNAN', '', fmtRp(saldo)],
    ];

    autoTable(doc, {
      body: summaryRows,
      startY: 43,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 90 }, 2: { halign: 'right', cellWidth: 55 } },
      didParseCell: (d) => {
        const val = summaryRows[d.row.index]?.[0] || '';
        if (val === 'KAS MASUK' || val === 'PENGELUARAN' || val === 'SALDO TAHUNAN' || val.includes('Total')) d.cell.styles.fontStyle = 'bold';
        if (val === 'SALDO TAHUNAN') { d.cell.styles.fillColor = [230, 245, 255]; d.cell.styles.fontSize = 11; }
      },
    });

    // Monthly rekap table
    const finalY = (doc as any).lastAutoTable?.finalY || 160;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Rekap Bulanan', 14, finalY + 10);

    const monthHeaders = ['Bulan', 'Pemasukan', 'Pengeluaran', 'Saldo'];
    const monthRows = monthlyData.map(m => [m.bulan, fmtRp(m.masuk), fmtRp(m.keluar), fmtRp(m.saldo)]);
    monthRows.push(['TOTAL', fmtRp(totalMasuk), fmtRp(totalKeluar), fmtRp(saldo)]);

    autoTable(doc, {
      head: [monthHeaders],
      body: monthRows,
      startY: finalY + 14,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (d) => {
        if (d.row.index === monthRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [240, 240, 240]; }
      },
    });

    addFooter(doc, auth.name);
    setMeta(doc, { title: `Keuangan Tahunan ${yearParam}`, subject: 'Laporan Keuangan Tahunan' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Keuangan_Tahunan_${yearParam}.pdf"`, 'Content-Length': buf.length.toString() },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
