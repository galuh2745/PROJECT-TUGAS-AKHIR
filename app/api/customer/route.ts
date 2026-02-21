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

// GET /api/customer - List all customers with piutang info
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');

    const whereClause: Prisma.CustomerWhereInput = {};
    if (search) {
      whereClause.OR = [
        { nama: { contains: search } },
        { no_hp: { contains: search } },
        { alamat: { contains: search } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      include: {
        penjualan: {
          where: { sisa_piutang: { gt: 0 } },
          select: { sisa_piutang: true },
        },
      },
      orderBy: { nama: 'asc' },
    });

    const result = customers.map((c) => {
      const totalPiutang = c.penjualan.reduce(
        (sum, p) => sum + parseFloat(p.sisa_piutang.toString()),
        0
      );
      return {
        id: c.id.toString(),
        nama: c.nama,
        no_hp: c.no_hp,
        alamat: c.alamat,
        created_at: c.created_at,
        total_piutang: totalPiutang,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data customer' },
      { status: 500 }
    );
  }
}

// POST /api/customer - Create new customer
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const { nama, no_hp, alamat } = body;

    if (!nama || nama.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Nama customer wajib diisi' },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.create({
      data: {
        nama: nama.trim(),
        no_hp: no_hp?.trim() || null,
        alamat: alamat?.trim() || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...customer,
        id: customer.id.toString(),
      },
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat customer' },
      { status: 500 }
    );
  }
}
