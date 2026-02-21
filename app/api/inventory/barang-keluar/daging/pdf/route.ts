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
    const tanggal_dari = searchParams.get('tanggal_dari');
    const tanggal_sampai = searchParams.get('tanggal_sampai');
    const customer = searchParams.get('search') || searchParams.get('customer');

    const where: any = {};
    if (tanggal_dari) where.tanggal = { ...where.tanggal, gte: new Date(`${tanggal_dari}T00:00:00.000Z`) };
    if (tanggal_sampai) where.tanggal = { ...where.tanggal, lte: new Date(`${tanggal_sampai}T23:59:59.999Z`) };
    if (customer) where.nama_customer = { contains: customer };

    const data = await prisma.barangKeluarDaging.findMany({
      where,
      include: { details: { include: { jenis_daging: true } } },
      orderBy: { tanggal: 'asc' },
    });

    const doc = initPdf('landscape');
    addWatermark(doc);

    let filterText = '';
    if (tanggal_dari && tanggal_sampai) filterText = `Periode: ${new Date(tanggal_dari).toLocaleDateString('id-ID')} - ${new Date(tanggal_sampai).toLocaleDateString('id-ID')}`;

    addHeader(doc, 'LAPORAN BARANG KELUAR - DAGING AYAM', filterText || undefined);

    const headers = ['No', 'Tanggal', 'Customer', 'Detail Jenis Daging', 'Total Berat (Kg)', 'Total Penjualan', 'Pengeluaran', 'Saldo'];
    const rows = data.map((item, i) => {
      const details = item.details.map(d => `${d.jenis_daging.nama_jenis}: ${parseFloat(d.berat_kg.toString()).toFixed(2)}kg @${fmtRp(parseFloat(d.harga_per_kg.toString()))}`).join('\n');
      const totalBerat = item.details.reduce((s, d) => s + parseFloat(d.berat_kg.toString()), 0);
      return [
        (i + 1).toString(),
        new Date(item.tanggal).toLocaleDateString('id-ID'),
        item.nama_customer,
        details,
        totalBerat.toFixed(2),
        fmtRp(parseFloat(item.total_penjualan.toString())),
        fmtRp(parseFloat(item.pengeluaran.toString())),
        fmtRp(parseFloat(item.saldo.toString())),
      ];
    });

    const grandTotal = data.reduce((a, i) => ({
      penjualan: a.penjualan + parseFloat(i.total_penjualan.toString()),
      pengeluaran: a.pengeluaran + parseFloat(i.pengeluaran.toString()),
      saldo: a.saldo + parseFloat(i.saldo.toString()),
    }), { penjualan: 0, pengeluaran: 0, saldo: 0 });

    rows.push(['', '', 'TOTAL', '', '', fmtRp(grandTotal.penjualan), fmtRp(grandTotal.pengeluaran), fmtRp(grandTotal.saldo)]);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: filterText ? 43 : 37,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        3: { cellWidth: 70 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
      didParseCell: (d) => {
        if (d.row.index === rows.length - 1) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    addFooter(doc, auth.name);
    setMeta(doc, { title: 'Laporan Barang Keluar Daging', subject: 'Laporan Barang Keluar Daging Ayam' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Laporan_Barang_Keluar_Daging.pdf"', 'Content-Length': buf.length.toString() },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
