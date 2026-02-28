import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

async function validateAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return { error: 'Unauthorized', status: 401 };
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  const { role, name } = payload as { userId: number; role: string; name?: string };
  if (role !== 'ADMIN' && role !== 'OWNER') return { error: 'Forbidden', status: 403 };
  return { role, name: name || 'Admin' };
}

// GET: Export PDF Stok Saat Ini (all-time accumulation per perusahaan)
export async function GET() {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return new NextResponse(validation.error, { status: validation.status });
    }

    const perusahaanList = await prisma.perusahaan.findMany({
      orderBy: { nama_perusahaan: 'asc' },
    });

    const stokPerPerusahaan = await Promise.all(
      perusahaanList.map(async (p) => {
        const [barangMasukSum, ayamMatiSum, barangKeluarSum] = await Promise.all([
          prisma.barangMasuk.aggregate({
            where: { perusahaan_id: p.id },
            _sum: { jumlah_ekor: true },
          }),
          prisma.ayamMati.aggregate({
            where: { perusahaan_id: p.id },
            _sum: { jumlah_ekor: true },
          }),
          prisma.barangKeluarAyamHidup.aggregate({
            where: { perusahaan_id: p.id },
            _sum: { jumlah_ekor: true },
          }),
        ]);

        const totalMasuk = barangMasukSum._sum.jumlah_ekor || 0;
        const totalMati = ayamMatiSum._sum.jumlah_ekor || 0;
        const totalKeluar = barangKeluarSum._sum.jumlah_ekor || 0;

        return {
          nama_perusahaan: p.nama_perusahaan,
          total_masuk: totalMasuk,
          total_mati: totalMati,
          total_keluar: totalKeluar,
          stok: totalMasuk - totalMati - totalKeluar,
        };
      })
    );

    const totalMasuk = stokPerPerusahaan.reduce((s, r) => s + r.total_masuk, 0);
    const totalMati = stokPerPerusahaan.reduce((s, r) => s + r.total_mati, 0);
    const totalKeluar = stokPerPerusahaan.reduce((s, r) => s + r.total_keluar, 0);
    const totalStok = stokPerPerusahaan.reduce((s, r) => s + r.stok, 0);

    const fmt = (v: number) => new Intl.NumberFormat('id-ID').format(v);

    // Generate PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // === WATERMARK ===
    doc.setFontSize(50);
    doc.setTextColor(200, 200, 200);
    doc.setFont('helvetica', 'bold');
    doc.text('CV ASWI SENTOSA LAMPUNG', pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: 45,
    });

    // Reset
    doc.setTextColor(0, 0, 0);

    // === HEADER ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CV ASWI SENTOSA LAMPUNG', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Jl mufakat wawai, Yukum Jaya, lingkungan VB, Kabupaten Lampung Tengah, Lampung', pageWidth / 2, 26, { align: 'center' });

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 30, pageWidth - 14, 30);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('STOK AYAM HIDUP SAAT INI', pageWidth / 2, 38, { align: 'center' });

    const tanggalCetak = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Per tanggal: ${tanggalCetak}`, pageWidth / 2, 44, { align: 'center' });

    // === TABLE ===
    const tableHeaders = ['No', 'Perusahaan', 'Masuk (ekor)', 'Mati (ekor)', 'Keluar (ekor)', 'Stok (ekor)'];

    const tableData = stokPerPerusahaan.map((row, i) => [
      (i + 1).toString(),
      row.nama_perusahaan,
      `+${fmt(row.total_masuk)}`,
      `-${fmt(row.total_mati)}`,
      `-${fmt(row.total_keluar)}`,
      fmt(row.stok),
    ]);

    tableData.push([
      '',
      'TOTAL',
      `+${fmt(totalMasuk)}`,
      `-${fmt(totalMati)}`,
      `-${fmt(totalKeluar)}`,
      fmt(totalStok),
    ]);

    autoTable(doc, {
      head: [tableHeaders],
      body: tableData,
      startY: 50,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'left', cellWidth: 55 },
        2: { halign: 'right', cellWidth: 28 },
        3: { halign: 'right', cellWidth: 28 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    // === KETERANGAN ===
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY || 120;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Keterangan:', 14, finalY + 8);
    doc.text('STOK = Total Barang Masuk - Total Ayam Mati - Total Barang Keluar (akumulasi seluruh periode)', 14, finalY + 12);

    // === FOOTER ===
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${tanggalCetak}`, 14, pageHeight - 25);
    doc.text('Mengetahui: Agus Tri Widodo', 14, pageHeight - 20);
    doc.text(`Dicetak oleh: ${validation.name}`, 14, pageHeight - 15);
    doc.text('Sistem Inventori - CV Aswi Sentosa Lampung', 14, pageHeight - 10);

    // Metadata
    doc.setProperties({
      title: 'Stok Ayam Hidup Saat Ini',
      subject: 'Stok Ayam Hidup per Perusahaan',
      author: 'CV Aswi Sentosa Lampung',
      creator: 'Sistem Inventori CV Aswi Sentosa',
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const today = new Date().toISOString().split('T')[0];
    const filename = `Stok_Ayam_Saat_Ini_${today}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error generating stok saat ini PDF:', error);
    return new NextResponse('Gagal generate PDF', { status: 500 });
  }
}
