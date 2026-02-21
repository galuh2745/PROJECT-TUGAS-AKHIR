import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

async function validateAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    return { error: 'Unauthorized', status: 401 };
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  const { role } = payload as { userId: number; role: string };

  if (role !== 'ADMIN' && role !== 'OWNER') {
    return { error: 'Forbidden - Hanya admin yang dapat mengakses', status: 403 };
  }

  return { role };
}

// GET /api/piutang - Summary piutang
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    // Total piutang aktif (all time)
    const totalPiutangAktif = await prisma.penjualan.aggregate({
      where: { sisa_piutang: { gt: 0 } },
      _sum: { sisa_piutang: true },
    });

    // Get per-customer piutang breakdown
    const customersWithPiutang = await prisma.customer.findMany({
      include: {
        penjualan: {
          where: { sisa_piutang: { gt: 0 } },
          orderBy: { tanggal: 'asc' },
        },
      },
    });

    const customerPiutang = customersWithPiutang
      .map((c) => {
        const total = c.penjualan.reduce(
          (sum, p) => sum + parseFloat(p.sisa_piutang.toString()),
          0
        );
        const totalPenjualan = c.penjualan.reduce(
          (sum, p) => sum + parseFloat(p.total_penjualan.toString()),
          0
        );
        const totalDibayar = c.penjualan.reduce(
          (sum, p) => sum + parseFloat(p.jumlah_bayar.toString()),
          0
        );
        return {
          customer_id: c.id.toString(),
          customer_nama: c.nama,
          no_hp: c.no_hp,
          total_piutang: total,
          total_penjualan: totalPenjualan,
          total_dibayar: totalDibayar,
          jumlah_transaksi: c.penjualan.length,
          transaksi_tertua: c.penjualan.length > 0 ? c.penjualan[0].tanggal : null,
        };
      })
      .filter((c) => c.total_piutang > 0)
      .sort((a, b) => b.total_piutang - a.total_piutang);

    let piutangHariIni = 0;
    let pelunasanHariIni = 0;

    if (dateParam) {
      const targetDate = new Date(dateParam);
      const nextDate = new Date(dateParam);
      nextDate.setDate(nextDate.getDate() + 1);

      // Piutang baru hari ini
      const piutangBaru = await prisma.penjualan.aggregate({
        where: {
          tanggal: { gte: targetDate, lt: nextDate },
          sisa_piutang: { gt: 0 },
        },
        _sum: { sisa_piutang: true },
      });
      piutangHariIni = parseFloat(piutangBaru._sum.sisa_piutang?.toString() || '0');

      // Pelunasan hari ini
      const pelunasan = await prisma.pembayaranPiutang.aggregate({
        where: {
          tanggal: { gte: targetDate, lt: nextDate },
        },
        _sum: { jumlah_bayar: true },
      });
      pelunasanHariIni = parseFloat(pelunasan._sum.jumlah_bayar?.toString() || '0');
    }

    return NextResponse.json({
      success: true,
      data: {
        total_piutang_aktif: parseFloat(totalPiutangAktif._sum.sisa_piutang?.toString() || '0'),
        piutang_hari_ini: piutangHariIni,
        pelunasan_hari_ini: pelunasanHariIni,
        jumlah_customer_hutang: customerPiutang.length,
        detail_per_customer: customerPiutang,
      },
    });
  } catch (error) {
    console.error('Error fetching piutang summary:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data piutang' },
      { status: 500 }
    );
  }
}
