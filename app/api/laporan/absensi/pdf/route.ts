import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * GET /api/laporan/absensi/pdf
 * 
 * API Export Laporan Absensi ke PDF menggunakan jsPDF
 * Hanya dapat diakses oleh ADMIN dan OWNER
 * 
 * Query Parameters:
 * - bulan: number (1-12, required)
 * - tahun: number (required)
 * - karyawan_id: string (optional)
 */
export async function GET(req: Request) {
  try {
    // =============================================
    // 1. AUTENTIKASI & OTORISASI
    // =============================================
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    
    let role: string;
    let userName: string = 'Admin';
    try {
      const { payload } = await jwtVerify(token, secret);
      role = (payload as { role: string; name?: string }).role;
      userName = (payload as { name?: string }).name || 'Admin';
    } catch {
      return new NextResponse('Token tidak valid', { status: 401 });
    }

    if (role !== 'ADMIN' && role !== 'OWNER') {
      return new NextResponse('Forbidden - Hanya admin yang dapat mengakses', { status: 403 });
    }

    // =============================================
    // 2. VALIDASI PARAMETER
    // =============================================
    const { searchParams } = new URL(req.url);
    const bulanParam = searchParams.get('bulan');
    const tahunParam = searchParams.get('tahun');
    const karyawanId = searchParams.get('karyawan_id');

    if (!bulanParam || !tahunParam) {
      return new NextResponse('Parameter bulan dan tahun wajib diisi', { status: 400 });
    }

    const bulan = parseInt(bulanParam);
    const tahun = parseInt(tahunParam);

    if (isNaN(bulan) || bulan < 1 || bulan > 12) {
      return new NextResponse('Parameter bulan tidak valid (1-12)', { status: 400 });
    }

    if (isNaN(tahun) || tahun < 2000 || tahun > 2100) {
      return new NextResponse('Parameter tahun tidak valid', { status: 400 });
    }

    // =============================================
    // 3. HITUNG RANGE TANGGAL
    // =============================================
    const tanggalAwal = new Date(Date.UTC(tahun, bulan - 1, 1));
    const tanggalAkhir = new Date(Date.UTC(tahun, bulan, 0, 23, 59, 59, 999));

    const namaBulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    // =============================================
    // 4. QUERY DATA KARYAWAN
    // =============================================
    const whereKaryawan: Record<string, unknown> = {
      status: 'AKTIF',
    };

    if (karyawanId) {
      whereKaryawan.id = BigInt(karyawanId);
    }

    const karyawanList = await prisma.karyawan.findMany({
      where: whereKaryawan,
      include: {
        jenis_karyawan: {
          select: { nama_jenis: true },
        },
      },
      orderBy: { nama: 'asc' },
    });

    // =============================================
    // 5. QUERY DATA ABSENSI
    // =============================================
    let rekapData: Array<{
      nip: string;
      nama: string;
      jenis: string;
      hadir: number;
      terlambat: number;
      izin: number;
      cuti: number;
      alpha: number;
    }> = [];

    if (karyawanList.length > 0) {
      const karyawanIds = karyawanList.map((k) => k.id);

      const absensiData = await prisma.absensi.findMany({
        where: {
          karyawan_id: { in: karyawanIds },
          tanggal: {
            gte: tanggalAwal,
            lte: tanggalAkhir,
          },
        },
      });

      rekapData = karyawanList.map((karyawan) => {
        const absensiKaryawan = absensiData.filter(
          (a) => a.karyawan_id === karyawan.id
        );

        return {
          nip: karyawan.nip,
          nama: karyawan.nama,
          jenis: karyawan.jenis_karyawan.nama_jenis,
          hadir: absensiKaryawan.filter((a) => a.status === 'HADIR').length,
          terlambat: absensiKaryawan.filter((a) => a.status === 'TERLAMBAT').length,
          izin: absensiKaryawan.filter((a) => a.status === 'IZIN').length,
          cuti: absensiKaryawan.filter((a) => a.status === 'CUTI').length,
          alpha: absensiKaryawan.filter((a) => a.status === 'ALPHA').length,
        };
      });
    }

    // =============================================
    // 6. GENERATE PDF DENGAN jsPDF
    // =============================================
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

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
    doc.text('CV ASWI SENTOSA LAMPUNG', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Jl mufakat wawai, Yukum Jaya, lingkungan VB, Kabupaten Lampung Tengah, Lampung', pageWidth / 2, 26, { align: 'center' });

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 30, pageWidth - 14, 30);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN ABSENSI BULANAN', pageWidth / 2, 38, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${namaBulan[bulan - 1]} ${tahun}`, pageWidth / 2, 44, { align: 'center' });

    // Jika tidak ada data
    if (rekapData.length === 0) {
      doc.setFontSize(12);
      doc.text('Tidak ada data absensi untuk periode ini.', pageWidth / 2, 65, { align: 'center' });
      doc.setFontSize(10);
      doc.text('Silakan pilih periode lain atau periksa data karyawan.', pageWidth / 2, 75, { align: 'center' });
    } else {
      // Siapkan data tabel
      const tableHeaders = ['No', 'NIP', 'Nama', 'Jenis', 'Hadir', 'Terlambat', 'Izin', 'Cuti', 'Alpha'];
      
      const tableData = rekapData.map((row, index) => [
        (index + 1).toString(),
        row.nip,
        row.nama,
        row.jenis,
        row.hadir.toString(),
        row.terlambat.toString(),
        row.izin.toString(),
        row.cuti.toString(),
        row.alpha.toString(),
      ]);

      // Hitung total
      const totalHadir = rekapData.reduce((sum, r) => sum + r.hadir, 0);
      const totalTerlambat = rekapData.reduce((sum, r) => sum + r.terlambat, 0);
      const totalIzin = rekapData.reduce((sum, r) => sum + r.izin, 0);
      const totalCuti = rekapData.reduce((sum, r) => sum + r.cuti, 0);
      const totalAlpha = rekapData.reduce((sum, r) => sum + r.alpha, 0);

      // Tambah baris total
      tableData.push([
        '',
        '',
        '',
        'TOTAL',
        totalHadir.toString(),
        totalTerlambat.toString(),
        totalIzin.toString(),
        totalCuti.toString(),
        totalAlpha.toString(),
      ]);

      // Generate tabel dengan autoTable
      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: 50,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },  // No
          1: { halign: 'left', cellWidth: 22 },    // NIP
          2: { halign: 'left', cellWidth: 40 },    // Nama
          3: { halign: 'left', cellWidth: 28 },    // Jenis
          4: { halign: 'center', cellWidth: 15 },  // Hadir
          5: { halign: 'center', cellWidth: 20 },  // Terlambat
          6: { halign: 'center', cellWidth: 12 },  // Izin
          7: { halign: 'center', cellWidth: 12 },  // Cuti
          8: { halign: 'center', cellWidth: 15 },  // Alpha
        },
        didParseCell: (data) => {
          // Style baris total (baris terakhir)
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });
    }

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      14,
      pageHeight - 25
    );
    doc.text('Mengetahui: Agus Tri Widodo', 14, pageHeight - 20);
    doc.text(`Dicetak oleh: ${userName}`, 14, pageHeight - 15);
    doc.text('Sistem Absensi Karyawan - CV Aswi Sentosa Lampung', 14, pageHeight - 10);

    // Metadata
    doc.setProperties({
      title: `Laporan Absensi - ${namaBulan[bulan - 1]} ${tahun}`,
      subject: 'Laporan Absensi Bulanan',
      author: 'CV Aswi Sentosa Lampung',
      creator: 'Sistem Absensi CV Aswi Sentosa',
    });

    // =============================================
    // 7. RETURN PDF RESPONSE
    // =============================================
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const filename = `Laporan_Absensi_${namaBulan[bulan - 1]}_${tahun}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Error generating PDF:', error);
    return new NextResponse('Gagal generate PDF. Silakan coba lagi.', { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
