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

export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return new NextResponse(validation.error, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const tanggalParam = searchParams.get('tanggal');
    const perusahaanId = searchParams.get('perusahaan_id');

    if (!tanggalParam) {
      return new NextResponse('Parameter tanggal wajib diisi', { status: 400 });
    }

    const tanggalHariIni = new Date(`${tanggalParam}T00:00:00.000Z`);
    const tanggalHariIniEnd = new Date(`${tanggalParam}T23:59:59.999Z`);
    const tanggalKemarin = new Date(tanggalHariIni);
    tanggalKemarin.setDate(tanggalKemarin.getDate() - 1);
    const tanggalKemarinEnd = new Date(tanggalKemarin);
    tanggalKemarinEnd.setUTCHours(23, 59, 59, 999);

    const wherePerusahaan: Record<string, unknown> = {};
    if (perusahaanId) wherePerusahaan.id = BigInt(perusahaanId);

    const perusahaanList = await prisma.perusahaan.findMany({
      where: wherePerusahaan,
      orderBy: { nama_perusahaan: 'asc' },
    });

    const rekapPerPerusahaan = await Promise.all(
      perusahaanList.map(async (p) => {
        const [masukSdKemarin, matiSdKemarin, keluarSdKemarin] = await Promise.all([
          prisma.barangMasuk.aggregate({
            where: { perusahaan_id: p.id, tanggal_masuk: { lte: tanggalKemarinEnd } },
            _sum: { jumlah_ekor: true },
          }),
          prisma.ayamMati.aggregate({
            where: { perusahaan_id: p.id, tanggal: { lte: tanggalKemarinEnd } },
            _sum: { jumlah_ekor: true },
          }),
          prisma.barangKeluarAyamHidup.aggregate({
            where: { perusahaan_id: p.id, tanggal: { lte: tanggalKemarinEnd } },
            _sum: { jumlah_ekor: true },
          }),
        ]);

        const sisaKemarin =
          (masukSdKemarin._sum.jumlah_ekor || 0) -
          (matiSdKemarin._sum.jumlah_ekor || 0) -
          (keluarSdKemarin._sum.jumlah_ekor || 0);

        const [masukHariIni, matiHariIni, keluarHariIni] = await Promise.all([
          prisma.barangMasuk.aggregate({
            where: { perusahaan_id: p.id, tanggal_masuk: { gte: tanggalHariIni, lte: tanggalHariIniEnd } },
            _sum: { jumlah_ekor: true },
          }),
          prisma.ayamMati.aggregate({
            where: { perusahaan_id: p.id, tanggal: { gte: tanggalHariIni, lte: tanggalHariIniEnd } },
            _sum: { jumlah_ekor: true },
          }),
          prisma.barangKeluarAyamHidup.aggregate({
            where: { perusahaan_id: p.id, tanggal: { gte: tanggalHariIni, lte: tanggalHariIniEnd } },
            _sum: { jumlah_ekor: true },
          }),
        ]);

        return {
          nama_perusahaan: p.nama_perusahaan,
          sisa_kemarin: sisaKemarin,
          masuk_hari_ini: masukHariIni._sum.jumlah_ekor || 0,
          mati_hari_ini: matiHariIni._sum.jumlah_ekor || 0,
          keluar_hari_ini: keluarHariIni._sum.jumlah_ekor || 0,
          total_stok: sisaKemarin + (masukHariIni._sum.jumlah_ekor || 0) - (matiHariIni._sum.jumlah_ekor || 0) - (keluarHariIni._sum.jumlah_ekor || 0),
        };
      })
    );

    const totalSisaKemarin = rekapPerPerusahaan.reduce((s, r) => s + r.sisa_kemarin, 0);
    const totalMasuk = rekapPerPerusahaan.reduce((s, r) => s + r.masuk_hari_ini, 0);
    const totalMati = rekapPerPerusahaan.reduce((s, r) => s + r.mati_hari_ini, 0);
    const totalKeluar = rekapPerPerusahaan.reduce((s, r) => s + r.keluar_hari_ini, 0);
    const totalStok = rekapPerPerusahaan.reduce((s, r) => s + r.total_stok, 0);

    const fmt = (v: number) => new Intl.NumberFormat('id-ID').format(v);

    const tanggalFormatted = new Date(tanggalParam).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Generate PDF
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // === WATERMARK ===
    doc.setFontSize(50);
    doc.setTextColor(200, 200, 200);
    doc.setFont('helvetica', 'bold');
    doc.text('CV ASWI SENTOSA LAMPUNG', pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: 35,
    });

    // Reset
    doc.setTextColor(0, 0, 0);

    // === HEADER ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CV ASWI SENTOSA LAMPUNG', pageWidth / 2, 18, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Jl mufakat wawai, Yukum Jaya, lingkungan VB, Kabupaten Lampung Tengah, Lampung', pageWidth / 2, 24, { align: 'center' });

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 28, pageWidth - 14, 28);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP STOK HARIAN AYAM HIDUP', pageWidth / 2, 36, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tanggal: ${tanggalFormatted}`, pageWidth / 2, 42, { align: 'center' });

    // === TABLE ===
    const tableHeaders = [
      'No',
      'Perusahaan',
      'Sisa Kemarin\n(ekor)',
      'Masuk Hari Ini\n(ekor)',
      'Mati Hari Ini\n(ekor)',
      'Keluar Hari Ini\n(ekor)',
      'Total Stok\n(ekor)',
    ];

    const tableData = rekapPerPerusahaan.map((row, i) => [
      (i + 1).toString(),
      row.nama_perusahaan,
      fmt(row.sisa_kemarin),
      row.masuk_hari_ini > 0 ? `+${fmt(row.masuk_hari_ini)}` : '0',
      row.mati_hari_ini > 0 ? `-${fmt(row.mati_hari_ini)}` : '0',
      row.keluar_hari_ini > 0 ? `-${fmt(row.keluar_hari_ini)}` : '0',
      fmt(row.total_stok),
    ]);

    // Total row
    tableData.push([
      '',
      'TOTAL',
      fmt(totalSisaKemarin),
      totalMasuk > 0 ? `+${fmt(totalMasuk)}` : '0',
      totalMati > 0 ? `-${fmt(totalMati)}` : '0',
      totalKeluar > 0 ? `-${fmt(totalKeluar)}` : '0',
      fmt(totalStok),
    ]);

    autoTable(doc, {
      head: [tableHeaders],
      body: tableData,
      startY: 48,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'left', cellWidth: 60 },
        2: { halign: 'right', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 30 },
        6: { halign: 'right', cellWidth: 30 },
      },
      didParseCell: (data) => {
        // Bold total row
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
        // Color total_stok column
        if (data.column.index === 6 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // === INFO BOX ===
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Keterangan:', 14, finalY + 8);
    doc.text('Sisa Kemarin = Akumulasi stok s/d hari sebelumnya', 14, finalY + 12);
    doc.text('Total Stok = Sisa Kemarin + Masuk Hari Ini - Mati Hari Ini - Keluar Hari Ini', 14, finalY + 16);

    // === FOOTER ===
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      14, pageHeight - 20
    );
    doc.text('Mengetahui: Agus Tri Widodo', 14, pageHeight - 15);
    doc.text(`Dicetak oleh: ${validation.name}`, 14, pageHeight - 10);

    // Metadata
    doc.setProperties({
      title: `Rekap Stok Harian - ${tanggalFormatted}`,
      subject: 'Rekap Stok Harian Ayam Hidup',
      author: 'CV Aswi Sentosa Lampung',
      creator: 'Sistem Inventori CV Aswi Sentosa',
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const filename = `Rekap_Stok_Harian_${tanggalParam}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error generating daily stok PDF:', error);
    return new NextResponse('Gagal generate PDF', { status: 500 });
  }
}
