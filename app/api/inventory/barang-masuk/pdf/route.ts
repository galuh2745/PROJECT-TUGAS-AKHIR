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

    const where: any = {};
    if (perusahaan_id) where.perusahaan_id = BigInt(perusahaan_id);
    if (tanggal_dari) where.tanggal_masuk = { ...where.tanggal_masuk, gte: new Date(`${tanggal_dari}T00:00:00.000Z`) };
    if (tanggal_sampai) where.tanggal_masuk = { ...where.tanggal_masuk, lte: new Date(`${tanggal_sampai}T23:59:59.999Z`) };

    const data = await prisma.barangMasuk.findMany({
      where,
      include: { perusahaan: true },
      orderBy: { tanggal_masuk: 'asc' },
    });

    const doc = initPdf('landscape');
    addWatermark(doc);

    let filterText = '';
    if (tanggal_dari && tanggal_sampai) filterText = `Periode: ${new Date(tanggal_dari).toLocaleDateString('id-ID')} - ${new Date(tanggal_sampai).toLocaleDateString('id-ID')}`;
    else if (tanggal_dari) filterText = `Dari: ${new Date(tanggal_dari).toLocaleDateString('id-ID')}`;
    else if (tanggal_sampai) filterText = `Sampai: ${new Date(tanggal_sampai).toLocaleDateString('id-ID')}`;

    addHeader(doc, 'LAPORAN BARANG MASUK', filterText || undefined);

    const headers = ['No', 'Tanggal', 'Perusahaan', 'Kandang', 'Ekor', 'Kg', 'BW', 'Harga/Kg', 'Total Harga', 'Transfer', 'Saldo'];
    const rows = data.map((item, i) => [
      (i + 1).toString(),
      new Date(item.tanggal_masuk).toLocaleDateString('id-ID'),
      item.perusahaan.nama_perusahaan,
      item.nama_kandang,
      fmtNum(item.jumlah_ekor),
      parseFloat(item.total_kg.toString()).toFixed(1),
      (item.jumlah_ekor > 0 ? parseFloat(item.total_kg.toString()) / item.jumlah_ekor : 0).toFixed(3),
      fmtRp(parseFloat(item.harga_per_kg.toString())),
      fmtRp(parseFloat(item.total_harga.toString())),
      fmtRp(parseFloat(item.jumlah_transfer.toString())),
      fmtRp(parseFloat(item.saldo_kita.toString())),
    ]);

    const totals = data.reduce((a, i) => ({
      ekor: a.ekor + i.jumlah_ekor,
      kg: a.kg + parseFloat(i.total_kg.toString()),
      harga: a.harga + parseFloat(i.total_harga.toString()),
      transfer: a.transfer + parseFloat(i.jumlah_transfer.toString()),
      saldo: a.saldo + parseFloat(i.saldo_kita.toString()),
    }), { ekor: 0, kg: 0, harga: 0, transfer: 0, saldo: 0 });

    rows.push(['', '', '', 'TOTAL', fmtNum(totals.ekor), totals.kg.toFixed(1), '', '', fmtRp(totals.harga), fmtRp(totals.transfer), fmtRp(totals.saldo)]);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: filterText ? 43 : 37,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        4: { halign: 'right' },
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
    setMeta(doc, { title: 'Laporan Barang Masuk', subject: 'Laporan Barang Masuk' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Laporan_Barang_Masuk.pdf"', 'Content-Length': buf.length.toString() },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
