import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initPdf, addWatermark, addHeader, addFooter, setMeta, getAuthInfo, fmtRp } from '@/lib/pdf-helper';
import autoTable from 'jspdf-autotable';

export async function GET(req: Request) {
  try {
    const auth = await getAuthInfo();
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'OWNER'))
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    if (!dateParam) return NextResponse.json({ success: false, error: 'Parameter date wajib' }, { status: 400 });

    const targetDate = new Date(dateParam);
    const nextDate = new Date(dateParam);
    nextDate.setDate(nextDate.getDate() + 1);

    // KAS MASUK
    const penjualanDaging = await prisma.penjualan.aggregate({ where: { tanggal: { gte: targetDate, lt: nextDate }, jenis_transaksi: 'DAGING' }, _sum: { jumlah_bayar: true } });
    const penjualanAyamHidup = await prisma.penjualan.aggregate({ where: { tanggal: { gte: targetDate, lt: nextDate }, jenis_transaksi: 'AYAM_HIDUP' }, _sum: { jumlah_bayar: true } });
    const pembayaranPiutang = await prisma.pembayaranPiutang.aggregate({ where: { tanggal: { gte: targetDate, lt: nextDate } }, _sum: { jumlah_bayar: true } });

    const kasDaging = parseFloat(penjualanDaging._sum.jumlah_bayar?.toString() || '0');
    const kasAyam = parseFloat(penjualanAyamHidup._sum.jumlah_bayar?.toString() || '0');
    const kasPelunasan = parseFloat(pembayaranPiutang._sum.jumlah_bayar?.toString() || '0');
    const totalMasuk = kasDaging + kasAyam + kasPelunasan;

    // PENGELUARAN
    const beliAyam = await prisma.barangMasuk.aggregate({ where: { tanggal_masuk: { gte: targetDate, lt: nextDate } }, _sum: { total_harga: true } });
    const pengeluaranDaging = await prisma.barangKeluarDaging.aggregate({ where: { tanggal: { gte: targetDate, lt: nextDate } }, _sum: { pengeluaran: true } });
    const pengeluaranAyamHidup = await prisma.barangKeluarAyamHidup.aggregate({ where: { tanggal: { gte: targetDate, lt: nextDate } }, _sum: { pengeluaran: true } });

    const ayamMatiTidakBisa = await prisma.ayamMati.findMany({ where: { tanggal: { gte: targetDate, lt: nextDate }, status_claim: 'TIDAK_BISA' }, include: { perusahaan: true } });
    let totalKerugian = 0;
    for (const am of ayamMatiTidakBisa) {
      const ref = await prisma.barangMasuk.findFirst({ where: { perusahaan_id: am.perusahaan_id, tanggal_masuk: { lte: am.tanggal } }, orderBy: { tanggal_masuk: 'desc' } });
      if (ref) {
        const bw = ref.jumlah_ekor > 0 ? parseFloat(ref.total_kg.toString()) / ref.jumlah_ekor : 0;
        totalKerugian += am.jumlah_ekor * bw * parseFloat(ref.harga_per_kg.toString());
      }
    }

    const tBeli = parseFloat(beliAyam._sum.total_harga?.toString() || '0');
    const tPenDaging = parseFloat(pengeluaranDaging._sum.pengeluaran?.toString() || '0');
    const tPenAyam = parseFloat(pengeluaranAyamHidup._sum.pengeluaran?.toString() || '0');
    const totalKeluar = tBeli + tPenDaging + tPenAyam + totalKerugian;
    const saldo = totalMasuk - totalKeluar;

    const doc = initPdf();
    addWatermark(doc);

    const tgl = new Date(dateParam).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    addHeader(doc, 'LAPORAN KEUANGAN HARIAN', tgl);

    const rows = [
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
      ['SALDO HARIAN', '', fmtRp(saldo)],
    ];

    autoTable(doc, {
      body: rows,
      startY: 43,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 100 },
        2: { halign: 'right', cellWidth: 60 },
      },
      didParseCell: (d) => {
        const val = rows[d.row.index]?.[0] || '';
        if (val === 'KAS MASUK' || val === 'PENGELUARAN' || val === 'SALDO HARIAN' || val.includes('Total')) {
          d.cell.styles.fontStyle = 'bold';
        }
        if (val === 'SALDO HARIAN') {
          d.cell.styles.fillColor = [230, 245, 255];
          d.cell.styles.fontSize = 12;
        }
      },
    });

    addFooter(doc, auth.name);
    setMeta(doc, { title: `Keuangan Harian ${dateParam}`, subject: 'Laporan Keuangan Harian' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Keuangan_Harian_${dateParam}.pdf"`, 'Content-Length': buf.length.toString() },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
