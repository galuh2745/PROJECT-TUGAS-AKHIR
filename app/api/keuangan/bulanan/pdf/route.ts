import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initPdf, addWatermark, addHeader, addFooter, setMeta, getAuthInfo, fmtRp } from '@/lib/pdf-helper';
import autoTable from 'jspdf-autotable';

const NAMA_BULAN: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April', '05': 'Mei', '06': 'Juni',
  '07': 'Juli', '08': 'Agustus', '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

export async function GET(req: Request) {
  try {
    const auth = await getAuthInfo();
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'OWNER'))
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month');
    if (!monthParam) return NextResponse.json({ success: false, error: 'Parameter month wajib (YYYY-MM)' }, { status: 400 });

    const [yearStr, monthStr] = monthParam.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // Aggregate the whole month
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

    // Daily breakdown
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const dailyData: { tanggal: string; masuk: number; keluar: number; saldo: number }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(year, month - 1, d);
      const dayEnd = new Date(year, month - 1, d + 1);
      if (dayStart > today) break;

      const [dPenjualan, dPelunasan, dBeli, dPenDaging, dPenAyam] = await Promise.all([
        prisma.penjualan.aggregate({ where: { tanggal: { gte: dayStart, lt: dayEnd } }, _sum: { jumlah_bayar: true } }),
        prisma.pembayaranPiutang.aggregate({ where: { tanggal: { gte: dayStart, lt: dayEnd } }, _sum: { jumlah_bayar: true } }),
        prisma.barangMasuk.aggregate({ where: { tanggal_masuk: { gte: dayStart, lt: dayEnd } }, _sum: { total_harga: true } }),
        prisma.barangKeluarDaging.aggregate({ where: { tanggal: { gte: dayStart, lt: dayEnd } }, _sum: { pengeluaran: true } }),
        prisma.barangKeluarAyamHidup.aggregate({ where: { tanggal: { gte: dayStart, lt: dayEnd } }, _sum: { pengeluaran: true } }),
      ]);

      const masuk = parseFloat(dPenjualan._sum.jumlah_bayar?.toString() || '0') + parseFloat(dPelunasan._sum.jumlah_bayar?.toString() || '0');
      const keluar = parseFloat(dBeli._sum.total_harga?.toString() || '0') + parseFloat(dPenDaging._sum.pengeluaran?.toString() || '0') + parseFloat(dPenAyam._sum.pengeluaran?.toString() || '0');

      if (masuk > 0 || keluar > 0) {
        dailyData.push({
          tanggal: `${year}-${monthStr}-${String(d).padStart(2, '0')}`,
          masuk,
          keluar,
          saldo: masuk - keluar,
        });
      }
    }

    const doc = initPdf();
    addWatermark(doc);

    const bulanLabel = `${NAMA_BULAN[monthStr]} ${yearStr}`;
    addHeader(doc, 'LAPORAN KEUANGAN BULANAN', bulanLabel);

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
      ['SALDO BULANAN', '', fmtRp(saldo)],
    ];

    autoTable(doc, {
      body: summaryRows,
      startY: 43,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 90 }, 2: { halign: 'right', cellWidth: 55 } },
      didParseCell: (d) => {
        const val = summaryRows[d.row.index]?.[0] || '';
        if (val === 'KAS MASUK' || val === 'PENGELUARAN' || val === 'SALDO BULANAN' || val.includes('Total')) d.cell.styles.fontStyle = 'bold';
        if (val === 'SALDO BULANAN') { d.cell.styles.fillColor = [230, 245, 255]; d.cell.styles.fontSize = 11; }
      },
    });

    // Daily table
    if (dailyData.length > 0) {
      const finalY = (doc as any).lastAutoTable?.finalY || 160;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Rekap Harian', 14, finalY + 10);

      const dailyHeaders = ['Tanggal', 'Pemasukan', 'Pengeluaran', 'Saldo'];
      const dailyRows = dailyData.map(d => {
        const [, , dd] = d.tanggal.split('-');
        return [`${parseInt(dd)} ${NAMA_BULAN[monthStr]}`, fmtRp(d.masuk), fmtRp(d.keluar), fmtRp(d.saldo)];
      });
      dailyRows.push(['TOTAL', fmtRp(totalMasuk), fmtRp(totalKeluar), fmtRp(saldo)]);

      autoTable(doc, {
        head: [dailyHeaders],
        body: dailyRows,
        startY: finalY + 14,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        didParseCell: (d) => {
          if (d.row.index === dailyRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [240, 240, 240]; }
        },
      });
    }

    addFooter(doc, auth.name);
    setMeta(doc, { title: `Keuangan Bulanan ${bulanLabel}`, subject: 'Laporan Keuangan Bulanan' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Keuangan_Bulanan_${monthParam}.pdf"`, 'Content-Length': buf.length.toString() },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
