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

// GET: Rekap stok harian per perusahaan
// Sisa Kemarin = total masuk s/d kemarin - total mati s/d kemarin - total keluar s/d kemarin
// Masuk Hari Ini, Mati Hari Ini, Keluar Hari Ini = transaksi pada tanggal tersebut
// Total Stok = Sisa Kemarin + Masuk Hari Ini - Mati Hari Ini - Keluar Hari Ini
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const tanggalParam = searchParams.get('tanggal');
    const perusahaanId = searchParams.get('perusahaan_id');

    if (!tanggalParam) {
      return NextResponse.json({ success: false, error: 'Parameter tanggal wajib diisi' }, { status: 400 });
    }

    // Tanggal yang dipilih (hari ini)
    const tanggalHariIni = new Date(`${tanggalParam}T00:00:00.000Z`);
    const tanggalHariIniEnd = new Date(`${tanggalParam}T23:59:59.999Z`);

    // Kemarin = semua data sebelum tanggal yang dipilih
    const tanggalKemarin = new Date(tanggalHariIni);
    tanggalKemarin.setDate(tanggalKemarin.getDate() - 1);
    const tanggalKemarinEnd = new Date(tanggalKemarin);
    tanggalKemarinEnd.setUTCHours(23, 59, 59, 999);

    // Filter perusahaan
    const wherePerusahaan: Record<string, unknown> = {};
    if (perusahaanId) wherePerusahaan.id = BigInt(perusahaanId);

    const perusahaanList = await prisma.perusahaan.findMany({
      where: wherePerusahaan,
      orderBy: { nama_perusahaan: 'asc' },
    });

    const rekapPerPerusahaan = await Promise.all(
      perusahaanList.map(async (p) => {
        // === SISA KEMARIN (akumulasi s/d kemarin) ===
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

        // === HARI INI (hanya tanggal yang dipilih) ===
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

        const masukHariIniVal = masukHariIni._sum.jumlah_ekor || 0;
        const matiHariIniVal = matiHariIni._sum.jumlah_ekor || 0;
        const keluarHariIniVal = keluarHariIni._sum.jumlah_ekor || 0;

        const totalStok = sisaKemarin + masukHariIniVal - matiHariIniVal - keluarHariIniVal;

        return {
          perusahaan_id: p.id.toString(),
          nama_perusahaan: p.nama_perusahaan,
          sisa_kemarin: sisaKemarin,
          masuk_hari_ini: masukHariIniVal,
          mati_hari_ini: matiHariIniVal,
          keluar_hari_ini: keluarHariIniVal,
          total_stok: totalStok,
        };
      })
    );

    // Total keseluruhan
    const total = rekapPerPerusahaan.reduce(
      (acc, curr) => ({
        sisa_kemarin: acc.sisa_kemarin + curr.sisa_kemarin,
        masuk_hari_ini: acc.masuk_hari_ini + curr.masuk_hari_ini,
        mati_hari_ini: acc.mati_hari_ini + curr.mati_hari_ini,
        keluar_hari_ini: acc.keluar_hari_ini + curr.keluar_hari_ini,
        total_stok: acc.total_stok + curr.total_stok,
      }),
      { sisa_kemarin: 0, masuk_hari_ini: 0, mati_hari_ini: 0, keluar_hari_ini: 0, total_stok: 0 }
    );

    return NextResponse.json({
      success: true,
      data: {
        tanggal: tanggalParam,
        per_perusahaan: rekapPerPerusahaan,
        total,
      },
    });
  } catch (error) {
    console.error('Error calculating daily stok:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
