import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initPdf, addWatermark, addHeader, addFooter, setMeta, getAuthInfo, fmtRp, fmtNum } from '@/lib/pdf-helper';
import autoTable from 'jspdf-autotable';

export async function GET(req: Request) {
  try {
    const auth = await getAuthInfo();
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'OWNER'))
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const perusahaan_id = searchParams.get('perusahaan_id');
    const tanggal_dari = searchParams.get('tanggal_dari');
    const tanggal_sampai = searchParams.get('tanggal_sampai');
    const search = searchParams.get('search');

    const where: any = {};
    if (perusahaan_id) where.perusahaan_id = BigInt(perusahaan_id);
    if (tanggal_dari) where.tanggal = { ...where.tanggal, gte: new Date(`${tanggal_dari}T00:00:00.000Z`) };
    if (tanggal_sampai) where.tanggal = { ...where.tanggal, lte: new Date(`${tanggal_sampai}T23:59:59.999Z`) };
    if (search) where.nama_customer = { contains: search };

    const data = await prisma.barangKeluarAyamHidup.findMany({
      where,
      include: { perusahaan: true },
      orderBy: { tanggal: 'asc' },
    });

    const doc = initPdf('landscape');
    addWatermark(doc);

    let filterText = '';
    if (tanggal_dari && tanggal_sampai) filterText = `Periode: ${new Date(tanggal_dari).toLocaleDateString('id-ID')} - ${new Date(tanggal_sampai).toLocaleDateString('id-ID')}`;

    addHeader(doc, 'LAPORAN BARANG KELUAR - AYAM HIDUP', filterText || undefined);

    const headers = ['No', 'Tanggal', 'Customer', 'Perusahaan', 'Jenis', 'Ekor', 'Kg', 'Harga/Kg', 'Total Penjualan', 'Pengeluaran', 'Saldo Bersih'];
    const rows = data.map((item, i) => [
      (i + 1).toString(),
      new Date(item.tanggal).toLocaleDateString('id-ID'),
      item.nama_customer,
      item.perusahaan.nama_perusahaan,
      item.jenis_daging,
      fmtNum(item.jumlah_ekor),
      parseFloat(item.total_kg.toString()).toFixed(2),
      fmtRp(parseFloat(item.harga_per_kg.toString())),
      fmtRp(parseFloat(item.total_penjualan.toString())),
      fmtRp(parseFloat(item.pengeluaran.toString())),
      fmtRp(parseFloat(item.total_bersih.toString())),
    ]);

    const totals = data.reduce((a, i) => ({
      ekor: a.ekor + i.jumlah_ekor,
      kg: a.kg + parseFloat(i.total_kg.toString()),
      penjualan: a.penjualan + parseFloat(i.total_penjualan.toString()),
      pengeluaran: a.pengeluaran + parseFloat(i.pengeluaran.toString()),
      bersih: a.bersih + parseFloat(i.total_bersih.toString()),
    }), { ekor: 0, kg: 0, penjualan: 0, pengeluaran: 0, bersih: 0 });

    rows.push(['', '', '', 'TOTAL', '', fmtNum(totals.ekor), totals.kg.toFixed(2), '', fmtRp(totals.penjualan), fmtRp(totals.pengeluaran), fmtRp(totals.bersih)]);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: filterText ? 43 : 37,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
        10: { halign: 'right' },
      },
      didParseCell: (d) => {
        if (d.row.index === rows.length - 1) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    addFooter(doc, auth.name);
    setMeta(doc, { title: 'Laporan Barang Keluar Ayam Hidup', subject: 'Laporan Barang Keluar Ayam Hidup' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Laporan_Barang_Keluar_Ayam_Hidup.pdf"', 'Content-Length': buf.length.toString() },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
