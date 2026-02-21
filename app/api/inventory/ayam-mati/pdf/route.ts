import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initPdf, addWatermark, addHeader, addFooter, setMeta, getAuthInfo, fmtNum } from '@/lib/pdf-helper';
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
    if (tanggal_dari) where.tanggal = { ...where.tanggal, gte: new Date(`${tanggal_dari}T00:00:00.000Z`) };
    if (tanggal_sampai) where.tanggal = { ...where.tanggal, lte: new Date(`${tanggal_sampai}T23:59:59.999Z`) };

    const data = await prisma.ayamMati.findMany({
      where,
      include: { perusahaan: true },
      orderBy: { tanggal: 'asc' },
    });

    const doc = initPdf();
    addWatermark(doc);

    let filterText = '';
    if (tanggal_dari && tanggal_sampai) filterText = `Periode: ${new Date(tanggal_dari).toLocaleDateString('id-ID')} - ${new Date(tanggal_sampai).toLocaleDateString('id-ID')}`;

    addHeader(doc, 'LAPORAN AYAM MATI', filterText || undefined);

    const headers = ['No', 'Tanggal', 'Perusahaan', 'Jumlah Ekor', 'Status Klaim', 'Keterangan'];
    const rows = data.map((item, i) => [
      (i + 1).toString(),
      new Date(item.tanggal).toLocaleDateString('id-ID'),
      item.perusahaan.nama_perusahaan,
      fmtNum(item.jumlah_ekor),
      item.status_claim === 'BISA_CLAIM' ? 'Bisa Klaim' : 'Tidak Bisa',
      item.keterangan || '-',
    ]);

    const totalEkor = data.reduce((s, i) => s + i.jumlah_ekor, 0);
    const bisaClaim = data.filter(i => i.status_claim === 'BISA_CLAIM').reduce((s, i) => s + i.jumlah_ekor, 0);
    const tidakBisa = totalEkor - bisaClaim;

    rows.push(['', '', 'TOTAL', fmtNum(totalEkor), `Bisa: ${fmtNum(bisaClaim)} / Tidak: ${fmtNum(tidakBisa)}`, `${data.length} record`]);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: filterText ? 43 : 37,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        3: { halign: 'right' },
        4: { halign: 'center' },
      },
      didParseCell: (d) => {
        if (d.row.index === rows.length - 1) {
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    addFooter(doc, auth.name);
    setMeta(doc, { title: 'Laporan Ayam Mati', subject: 'Laporan Ayam Mati' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Laporan_Ayam_Mati.pdf"', 'Content-Length': buf.length.toString() },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
