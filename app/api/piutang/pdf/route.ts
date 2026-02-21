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
    const customerId = searchParams.get('customer_id');

    // Build query: all customers with piutang, or filtered to one
    const customers = await prisma.customer.findMany({
      where: {
        ...(customerId ? { id: parseInt(customerId) } : {}),
        penjualan: { some: { sisa_piutang: { gt: 0 } } },
      },
      include: {
        penjualan: {
          where: { sisa_piutang: { gt: 0 } },
          orderBy: { tanggal: 'asc' },
        },
      },
      orderBy: { nama: 'asc' },
    });

    const customerData = customers.map((c) => {
      const total = c.penjualan.reduce((s, p) => s + parseFloat(p.sisa_piutang.toString()), 0);
      return {
        id: c.id,
        nama: c.nama,
        no_hp: c.no_hp,
        total_piutang: total,
        jumlah_transaksi: c.penjualan.length,
        transaksi: c.penjualan.map((p) => ({
          tanggal: p.tanggal,
          jenis: p.jenis_transaksi,
          total_penjualan: parseFloat(p.total_penjualan.toString()),
          sisa_piutang: parseFloat(p.sisa_piutang.toString()),
        })),
      };
    }).filter((c) => c.total_piutang > 0);

    const grandTotal = customerData.reduce((s, c) => s + c.total_piutang, 0);

    const doc = initPdf();
    addWatermark(doc);

    const isSingle = customerId && customerData.length === 1;
    const title = isSingle ? `LAPORAN PIUTANG - ${customerData[0].nama.toUpperCase()}` : 'LAPORAN PIUTANG SELURUH CUSTOMER';
    addHeader(doc, title, new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));

    if (isSingle) {
      // Detail view for single customer
      const c = customerData[0];
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Customer: ${c.nama}`, 14, 43);
      doc.text(`No HP: ${c.no_hp || '-'}`, 14, 49);
      doc.text(`Total Piutang: ${fmtRp(c.total_piutang)}`, 14, 55);
      doc.text(`Jumlah Transaksi Belum Lunas: ${c.jumlah_transaksi}`, 14, 61);

      const headers = ['No', 'Tanggal', 'Jenis Transaksi', 'Total Penjualan', 'Sisa Piutang'];
      const rows = c.transaksi.map((t, i) => [
        (i + 1).toString(),
        new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
        t.jenis === 'DAGING' ? 'Daging' : 'Ayam Hidup',
        fmtRp(t.total_penjualan),
        fmtRp(t.sisa_piutang),
      ]);

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 67,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.row.index === rows.length - 1) {
            // Last row is not special
          }
        },
      });

      // Total row after table
      const fY = (doc as any).lastAutoTable?.finalY || 100;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total Piutang: ${fmtRp(c.total_piutang)}`, 140, fY + 8, { align: 'right' });
    } else {
      // Summary view for all customers
      const headers = ['No', 'Customer', 'No HP', 'Transaksi', 'Total Piutang'];
      const rows = customerData.map((c, i) => [
        (i + 1).toString(),
        c.nama,
        c.no_hp || '-',
        c.jumlah_transaksi.toString(),
        fmtRp(c.total_piutang),
      ]);

      rows.push(['', 'GRAND TOTAL', '', customerData.reduce((s, c) => s + c.jumlah_transaksi, 0).toString(), fmtRp(grandTotal)]);

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 43,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          3: { halign: 'center' },
          4: { halign: 'right' },
        },
        didParseCell: (d) => {
          if (d.row.index === rows.length - 1) {
            d.cell.styles.fontStyle = 'bold';
            d.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });
    }

    addFooter(doc, auth.name);
    setMeta(doc, { title: isSingle ? `Piutang ${customerData[0].nama}` : 'Piutang Seluruh Customer', subject: 'Laporan Piutang' });

    const buf = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Piutang_${isSingle ? customerData[0].nama.replace(/\s/g, '_') : 'Semua'}.pdf"`,
        'Content-Length': buf.length.toString(),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
