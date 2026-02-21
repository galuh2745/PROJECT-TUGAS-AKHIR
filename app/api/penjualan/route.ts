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
    const status = searchParams.get('status'); // lunas | hutang | all

    const whereClause: Prisma.PenjualanWhereInput = {};

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

    if (status === 'hutang') {
      whereClause.sisa_piutang = { gt: 0 };
    } else if (status === 'lunas') {
      whereClause.sisa_piutang = { equals: 0 };
    }

    const penjualan = await prisma.penjualan.findMany({
      where: whereClause,
      include: {
        customer: {
          select: { nama: true },
        },
      },
      orderBy: { tanggal: 'desc' },
    });

    const result = penjualan.map((p) => ({
      id: p.id.toString(),
      customer_id: p.customer_id.toString(),
      customer_nama: p.customer.nama,
      tanggal: p.tanggal,
      total_penjualan: parseFloat(p.total_penjualan.toString()),
      jumlah_bayar: parseFloat(p.jumlah_bayar.toString()),
      sisa_piutang: parseFloat(p.sisa_piutang.toString()),
      metode_pembayaran: p.metode_pembayaran,
      keterangan: p.keterangan,
      created_at: p.created_at,
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

// POST /api/penjualan - Create new penjualan (barang keluar → piutang)
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const { customer_id, tanggal, total_penjualan, jumlah_bayar, metode_pembayaran, keterangan } = body;

    // Validation
    if (!customer_id) {
      return NextResponse.json({ success: false, error: 'Customer wajib dipilih' }, { status: 400 });
    }
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!total_penjualan || total_penjualan <= 0) {
      return NextResponse.json({ success: false, error: 'Total penjualan harus lebih dari 0' }, { status: 400 });
    }
    if (jumlah_bayar === undefined || jumlah_bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak valid' }, { status: 400 });
    }
    if (jumlah_bayar > total_penjualan) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi total penjualan' }, { status: 400 });
    }
    if (!metode_pembayaran) {
      return NextResponse.json({ success: false, error: 'Metode pembayaran wajib dipilih' }, { status: 400 });
    }

    // Check customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: BigInt(customer_id) },
    });

    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    // Check existing piutang for this customer
    const existingPiutang = await prisma.penjualan.aggregate({
      where: {
        customer_id: BigInt(customer_id),
        sisa_piutang: { gt: 0 },
      },
      _sum: { sisa_piutang: true },
    });
    const totalPiutangAktif = parseFloat(existingPiutang._sum.sisa_piutang?.toString() || '0');

    const sisaPiutang = total_penjualan - jumlah_bayar;

    const penjualan = await prisma.penjualan.create({
      data: {
        customer_id: BigInt(customer_id),
        tanggal: new Date(tanggal),
        total_penjualan: new Prisma.Decimal(total_penjualan),
        jumlah_bayar: new Prisma.Decimal(jumlah_bayar),
        sisa_piutang: new Prisma.Decimal(sisaPiutang),
        metode_pembayaran,
        keterangan: keterangan || null,
      },
      include: {
        customer: { select: { nama: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: penjualan.id.toString(),
        customer_id: penjualan.customer_id.toString(),
        customer_nama: penjualan.customer.nama,
        tanggal: penjualan.tanggal,
        total_penjualan: parseFloat(penjualan.total_penjualan.toString()),
        jumlah_bayar: parseFloat(penjualan.jumlah_bayar.toString()),
        sisa_piutang: parseFloat(penjualan.sisa_piutang.toString()),
        metode_pembayaran: penjualan.metode_pembayaran,
        keterangan: penjualan.keterangan,
        piutang_sebelumnya: totalPiutangAktif,
        total_piutang_aktif: totalPiutangAktif + sisaPiutang,
      },
    });
  } catch (error) {
    console.error('Error creating penjualan:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat penjualan' },
      { status: 500 }
    );
  }
}
