import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

async function validateAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return { error: 'Unauthorized', status: 401 };
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  const { role } = payload as { userId: number; role: string };
  if (role !== 'ADMIN' && role !== 'OWNER') return { error: 'Forbidden', status: 403 };
  return { role };
}

/**
 * GET /api/inventory/stok/rekap-bulanan
 * 
 * Rekap stok ayam hidup per bulan dengan filter bulan, tahun, perusahaan
 */
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const bulanParam = searchParams.get('bulan');
    const tahunParam = searchParams.get('tahun');
    const perusahaanId = searchParams.get('perusahaan_id');

    if (!bulanParam || !tahunParam) {
      return NextResponse.json({ success: false, error: 'Parameter bulan dan tahun wajib diisi' }, { status: 400 });
    }

    const bulan = parseInt(bulanParam);
    const tahun = parseInt(tahunParam);

    if (isNaN(bulan) || bulan < 1 || bulan > 12) {
      return NextResponse.json({ success: false, error: 'Parameter bulan tidak valid (1-12)' }, { status: 400 });
    }

    const tanggalAwal = new Date(Date.UTC(tahun, bulan - 1, 1));
    const tanggalAkhir = new Date(Date.UTC(tahun, bulan, 0, 23, 59, 59, 999));
    const nowLocal = new Date();
    const todayUTC = new Date(Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999));

    const namaBulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    if (tanggalAwal > todayUTC) {
      return NextResponse.json({
        success: true,
        data: {
          periode: {
            bulan,
            tahun,
            nama_bulan: namaBulan[bulan - 1],
            tanggal_awal: tanggalAwal.toISOString().split('T')[0],
            tanggal_akhir: tanggalAkhir.toISOString().split('T')[0],
          },
          per_perusahaan: [],
          total: { total_masuk: 0, total_mati: 0, total_keluar: 0, selisih: 0 },
        },
      });
    }

    // Get perusahaan list
    const wherePerusahaan: Record<string, unknown> = {};
    if (perusahaanId) wherePerusahaan.id = BigInt(perusahaanId);

    const perusahaanList = await prisma.perusahaan.findMany({
      where: wherePerusahaan,
      orderBy: { nama_perusahaan: 'asc' },
    });

    // Calculate per perusahaan for the month
    const stokPerPerusahaan = await Promise.all(
      perusahaanList.map(async (p) => {
        const dateFilter = { perusahaan_id: p.id };
        const monthFilter = {
          ...dateFilter,
        };

        const [barangMasukSum, ayamMatiSum, barangKeluarSum] = await Promise.all([
          prisma.barangMasuk.aggregate({
            where: {
              perusahaan_id: p.id,
              tanggal_masuk: { gte: tanggalAwal, lte: tanggalAkhir },
            },
            _sum: { jumlah_ekor: true },
            _count: true,
          }),
          prisma.ayamMati.aggregate({
            where: {
              perusahaan_id: p.id,
              tanggal: { gte: tanggalAwal, lte: tanggalAkhir },
            },
            _sum: { jumlah_ekor: true },
            _count: true,
          }),
          prisma.barangKeluarAyamHidup.aggregate({
            where: {
              perusahaan_id: p.id,
              tanggal: { gte: tanggalAwal, lte: tanggalAkhir },
            },
            _sum: { jumlah_ekor: true },
            _count: true,
          }),
        ]);

        const totalMasuk = barangMasukSum._sum.jumlah_ekor || 0;
        const totalMati = ayamMatiSum._sum.jumlah_ekor || 0;
        const totalKeluar = barangKeluarSum._sum.jumlah_ekor || 0;
        const selisih = totalMasuk - totalMati - totalKeluar;

        return {
          perusahaan_id: p.id.toString(),
          nama_perusahaan: p.nama_perusahaan,
          total_masuk: totalMasuk,
          total_mati: totalMati,
          total_keluar: totalKeluar,
          selisih,
          jumlah_transaksi_masuk: barangMasukSum._count,
          jumlah_transaksi_mati: ayamMatiSum._count,
          jumlah_transaksi_keluar: barangKeluarSum._count,
        };
      })
    );

    const total = stokPerPerusahaan.reduce(
      (acc, curr) => ({
        total_masuk: acc.total_masuk + curr.total_masuk,
        total_mati: acc.total_mati + curr.total_mati,
        total_keluar: acc.total_keluar + curr.total_keluar,
        selisih: acc.selisih + curr.selisih,
      }),
      { total_masuk: 0, total_mati: 0, total_keluar: 0, selisih: 0 }
    );

    return NextResponse.json({
      success: true,
      data: {
        periode: {
          bulan,
          tahun,
          nama_bulan: namaBulan[bulan - 1],
          tanggal_awal: tanggalAwal.toISOString().split('T')[0],
          tanggal_akhir: tanggalAkhir.toISOString().split('T')[0],
        },
        per_perusahaan: stokPerPerusahaan,
        total,
      },
    });
  } catch (error) {
    console.error('Error fetching rekap stok bulanan:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
