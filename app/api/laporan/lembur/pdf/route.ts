import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { role, name: userName } = payload as { userId: number; role: string; name?: string };

    if (role !== 'ADMIN' && role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'Forbidden - hanya admin yang bisa mengakses' }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const tanggalMulai = searchParams.get('tanggal_mulai');
    const tanggalSelesai = searchParams.get('tanggal_selesai');
    const karyawanId = searchParams.get('karyawan_id');

    if (!tanggalMulai || !tanggalSelesai) {
      return NextResponse.json({ success: false, error: 'Tanggal mulai dan selesai harus diisi' }, { status: 400 });
    }

    // Build where clause
    const whereClause: any = {
      tanggal: {
        gte: new Date(tanggalMulai),
        lte: new Date(tanggalSelesai),
      },
    };

    if (karyawanId) {
      whereClause.karyawan_id = BigInt(karyawanId);
    }

    // Fetch data
    const dataLembur = await prisma.lembur.findMany({
      where: whereClause,
      include: {
        karyawan: {
          include: {
            jenis_karyawan: true,
          },
        },
      },
      orderBy: {
        tanggal: 'asc',
      },
    });

    if (dataLembur.length === 0) {
      return NextResponse.json({ success: false, error: 'Tidak ada data lembur untuk periode tersebut' }, { status: 404 });
    }

    // Calculate total hours
    const totalJamLembur = dataLembur.reduce((total, item) => total + Number(item.total_jam), 0);

    // Create PDF with jsPDF
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
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
    doc.setTextColor(0, 0, 0);

    // === HEADER ===
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CV ASWI SENTOSA LAMPUNG', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Jl mufakat wawai, Yukum Jaya, lingkungan VB, Kabupaten Lampung Tengah, Lampung', pageWidth / 2, 21, { align: 'center' });

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 24, pageWidth - 14, 24);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN LEMBUR KARYAWAN', pageWidth / 2, 31, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${new Date(tanggalMulai).toLocaleDateString('id-ID')} - ${new Date(tanggalSelesai).toLocaleDateString('id-ID')}`, pageWidth / 2, 37, { align: 'center' });

    // === TABLE ===
    const tableHeaders = ['No', 'Nama Karyawan', 'Tanggal', 'Jam Mulai', 'Jam Selesai', 'Total Jam', 'Keterangan'];

    const tableData = dataLembur.map((item, index) => {
      const jamMulai = new Date(item.jam_mulai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const jamSelesai = new Date(item.jam_selesai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const keterangan = item.keterangan.length > 40 ? item.keterangan.substring(0, 40) + '...' : item.keterangan;

      return [
        (index + 1).toString(),
        item.karyawan.nama,
        new Date(item.tanggal).toLocaleDateString('id-ID'),
        jamMulai,
        jamSelesai,
        Number(item.total_jam).toFixed(2),
        keterangan,
      ];
    });

    // Total row
    tableData.push(['', '', '', '', 'TOTAL', totalJamLembur.toFixed(2) + ' jam', `${dataLembur.length} record`]);

    autoTable(doc, {
      head: [tableHeaders],
      body: tableData,
      startY: 43,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'left', cellWidth: 50 },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'center', cellWidth: 25 },
        4: { halign: 'center', cellWidth: 25 },
        5: { halign: 'center', cellWidth: 25 },
        6: { halign: 'left' },
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    // === FOOTER ===
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 14, pageHeight - 25);
    doc.text('Mengetahui: Agus Tri Widodo', 14, pageHeight - 20);
    doc.text(`Dicetak oleh: ${userName || 'Admin'}`, 14, pageHeight - 15);
    doc.text('Sistem Absensi Karyawan - CV Aswi Sentosa Lampung', 14, pageHeight - 10);

    // === METADATA ===
    doc.setProperties({
      title: `Laporan Lembur ${tanggalMulai} - ${tanggalSelesai}`,
      subject: 'Laporan Lembur Karyawan',
      author: 'CV Aswi Sentosa Lampung',
      creator: 'Sistem Absensi CV Aswi Sentosa',
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Laporan_Lembur_${tanggalMulai}_${tanggalSelesai}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
