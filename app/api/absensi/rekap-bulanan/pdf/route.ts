import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * GET /api/absensi/rekap-bulanan/pdf
 * 
 * API untuk generate PDF rekap absensi bulanan menggunakan jsPDF
 * Hanya dapat diakses oleh ADMIN dan OWNER
 */
export async function GET(request: NextRequest) {
  try {
    // =============================================
    // 1. VALIDASI AUTENTIKASI & OTORISASI
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
    // 2. AMBIL DAN VALIDASI PARAMETER
    // =============================================
    const { searchParams } = new URL(request.url);
    const bulan = parseInt(searchParams.get('bulan') || '');
    const tahun = parseInt(searchParams.get('tahun') || '');
    const karyawanId = searchParams.get('karyawan_id');
    const jenisKaryawanId = searchParams.get('jenis_karyawan_id');

    if (isNaN(bulan) || bulan < 1 || bulan > 12) {
      return new NextResponse('Parameter bulan tidak valid', { status: 400 });
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

    if (jenisKaryawanId) {
      whereKaryawan.jenis_karyawan_id = BigInt(jenisKaryawanId);
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

      // Query izin/cuti approved
      const izinCutiData = await prisma.izinCuti.findMany({
        where: {
          karyawan_id: { in: karyawanIds },
          status: 'APPROVED',
          OR: [
            { tanggal_mulai: { gte: tanggalAwal, lte: tanggalAkhir } },
            { tanggal_selesai: { gte: tanggalAwal, lte: tanggalAkhir } },
            { tanggal_mulai: { lte: tanggalAwal }, tanggal_selesai: { gte: tanggalAkhir } },
          ],
        },
      });

      // Hitung hari kerja (Senin-Sabtu) dalam bulan
      const hariKerja: Date[] = [];
      const nowLocal = new Date();
      const todayUTC = new Date(Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999));
      const batasAkhir = tanggalAkhir < todayUTC ? tanggalAkhir : todayUTC;
      for (let d = new Date(tanggalAwal); d <= batasAkhir; d.setUTCDate(d.getUTCDate() + 1)) {
        if (d.getUTCDay() !== 0) hariKerja.push(new Date(d));
      }

      const isDateCoveredByIzinCuti = (karyawanId: bigint, date: Date): string | null => {
        const dateStr = date.toISOString().split('T')[0];
        for (const ic of izinCutiData) {
          if (ic.karyawan_id !== karyawanId) continue;
          const mulai = new Date(ic.tanggal_mulai).toISOString().split('T')[0];
          const selesai = new Date(ic.tanggal_selesai).toISOString().split('T')[0];
          if (dateStr >= mulai && dateStr <= selesai) return ic.jenis;
        }
        return null;
      };

      // Hitung rekap per karyawan with auto-ALPA
      rekapData = karyawanList.map((karyawan) => {
        const absensiKaryawan = absensiData.filter(
          (a) => a.karyawan_id === karyawan.id
        );
        const absensiDateSet = new Set(
          absensiKaryawan.map((a) => a.tanggal.toISOString().split('T')[0])
        );

        const hadir = absensiKaryawan.filter((a) => a.status === 'HADIR').length;
        const terlambat = absensiKaryawan.filter((a) => a.status === 'TERLAMBAT').length;
        let izin = absensiKaryawan.filter((a) => a.status === 'IZIN').length;
        let cuti = absensiKaryawan.filter((a) => a.status === 'CUTI').length;
        let alpha = 0;

        // Alpa hanya dihitung dari HARI SETELAH karyawan dibuat (created_at)
        const karyawanCreatedDate = new Date(karyawan.created_at);
        karyawanCreatedDate.setUTCHours(0, 0, 0, 0);
        karyawanCreatedDate.setUTCDate(karyawanCreatedDate.getUTCDate() + 1); // mulai dari hari setelah akun dibuat

        for (const hk of hariKerja) {
          // Skip hari kerja sebelum karyawan membuat akun
          if (hk < karyawanCreatedDate) continue;

          const hkStr = hk.toISOString().split('T')[0];
          if (absensiDateSet.has(hkStr)) continue;
          const jenis = isDateCoveredByIzinCuti(karyawan.id, hk);
          if (jenis === 'IZIN' || jenis === 'SAKIT') izin++;
          else if (jenis === 'CUTI') cuti++;
          else alpha++;
        }

        return {
          nip: karyawan.nip,
          nama: karyawan.nama,
          jenis: karyawan.jenis_karyawan.nama_jenis,
          hadir, terlambat, izin, cuti, alpha,
        };
      });
    }

    // =============================================
    // 6. GENERATE PDF DENGAN jsPDF
    // =============================================
    const doc = new jsPDF({
      orientation: 'landscape',
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
    doc.text('CV ASWI SENTOSA LAMPUNG', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Jl mufakat wawai, Yukum Jaya, lingkungan VB, Kabupaten Lampung Tengah, Lampung', pageWidth / 2, 21, { align: 'center' });

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 24, pageWidth - 14, 24);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP ABSENSI BULANAN', pageWidth / 2, 31, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${namaBulan[bulan - 1]} ${tahun}`, pageWidth / 2, 37, { align: 'center' });

    // Jika tidak ada data
    if (rekapData.length === 0) {
      doc.setFontSize(12);
      doc.text('Tidak ada data absensi untuk periode ini.', pageWidth / 2, 55, { align: 'center' });
      doc.setFontSize(10);
      doc.text('Silakan pilih periode lain atau periksa data karyawan.', pageWidth / 2, 63, { align: 'center' });
    } else {
      // Siapkan data tabel
      const tableHeaders = ['No', 'NIP', 'Nama Karyawan', 'Jenis', 'Hadir', 'Terlambat', 'Izin', 'Cuti', 'Alpha'];
      
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
        startY: 43,
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
          0: { halign: 'center', cellWidth: 15 },  // No
          1: { halign: 'left', cellWidth: 30 },    // NIP
          2: { halign: 'left', cellWidth: 60 },    // Nama
          3: { halign: 'left', cellWidth: 40 },    // Jenis
          4: { halign: 'center', cellWidth: 20 },  // Hadir
          5: { halign: 'center', cellWidth: 25 },  // Terlambat
          6: { halign: 'center', cellWidth: 20 },  // Izin
          7: { halign: 'center', cellWidth: 20 },  // Cuti
          8: { halign: 'center', cellWidth: 20 },  // Alpha
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
      title: `Rekap Absensi - ${namaBulan[bulan - 1]} ${tahun}`,
      subject: 'Rekap Absensi Bulanan',
      author: 'CV Aswi Sentosa Lampung',
      creator: 'Sistem Absensi CV Aswi Sentosa',
    });

    // =============================================
    // 7. RETURN PDF RESPONSE
    // =============================================
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const filename = `Rekap_Absensi_${namaBulan[bulan - 1]}_${tahun}.pdf`;

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
