import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { Prisma } from '@prisma/client';

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

// GET /api/penjualan - List penjualan with filters
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const tanggal_dari = searchParams.get('tanggal_dari');
    const tanggal_sampai = searchParams.get('tanggal_sampai');
    const customer_id = searchParams.get('customer_id');
    const status = searchParams.get('status'); // lunas | hutang | sebagian | all

    const whereClause: Prisma.PenjualanWhereInput = {
      // Exclude drafts from riwayat list
      status: { not: 'draft' },
    };

    if (tanggal_dari || tanggal_sampai) {
      whereClause.tanggal = {};
      if (tanggal_dari) {
        whereClause.tanggal.gte = new Date(`${tanggal_dari}T00:00:00.000Z`);
      }
      if (tanggal_sampai) {
        whereClause.tanggal.lte = new Date(`${tanggal_sampai}T23:59:59.999Z`);
      }
    }

    if (customer_id) {
      whereClause.customer_id = BigInt(customer_id);
    }

    if (status && status !== 'all') {
      whereClause.status = status;
    }

    const penjualan = await prisma.penjualan.findMany({
      where: whereClause,
      include: {
        customer: {
          select: { nama: true },
        },
        detail: true,
      },
      orderBy: { tanggal: 'desc' },
    });

    const result = penjualan.map((p) => ({
      id: p.id.toString(),
      nomor_nota: p.nomor_nota,
      customer_id: p.customer_id.toString(),
      customer_nama: p.customer.nama,
      tanggal: p.tanggal,
      jenis_transaksi: p.jenis_transaksi,
      total_penjualan: parseFloat(p.total_penjualan.toString()),
      pengeluaran: parseFloat(p.pengeluaran.toString()),
      grand_total: parseFloat(p.grand_total.toString()),
      jumlah_bayar: parseFloat(p.jumlah_bayar.toString()),
      sisa_piutang: parseFloat(p.sisa_piutang.toString()),
      status: p.status,
      metode_pembayaran: p.metode_pembayaran,
      keterangan: p.keterangan,
      created_at: p.created_at,
      updated_at: p.updated_at,
      detail: p.detail.map((d) => ({
        id: d.id.toString(),
        jenis_daging: d.jenis_daging,
        ekor: d.ekor,
        berat: parseFloat(d.berat.toString()),
        harga: parseFloat(d.harga.toString()),
        subtotal: parseFloat(d.subtotal.toString()),
      })),
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching penjualan:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data penjualan' },
      { status: 500 }
    );
  }
}
