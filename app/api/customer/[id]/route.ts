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

// GET /api/customer/[id] - Get customer detail with piutang history
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { id } = await params;
    const customerId = BigInt(id);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        penjualan: {
          orderBy: { tanggal: 'desc' },
        },
        pembayaran: {
          orderBy: { tanggal: 'desc' },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer tidak ditemukan' },
        { status: 404 }
      );
    }

    const totalPiutang = customer.penjualan.reduce(
      (sum, p) => sum + parseFloat(p.sisa_piutang.toString()),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        id: customer.id.toString(),
        nama: customer.nama,
        no_hp: customer.no_hp,
        alamat: customer.alamat,
        created_at: customer.created_at,
        total_piutang: totalPiutang,
        penjualan: customer.penjualan.map((p) => ({
          ...p,
          id: p.id.toString(),
          customer_id: p.customer_id.toString(),
          total_penjualan: parseFloat(p.total_penjualan.toString()),
          jumlah_bayar: parseFloat(p.jumlah_bayar.toString()),
          sisa_piutang: parseFloat(p.sisa_piutang.toString()),
        })),
        pembayaran: customer.pembayaran.map((p) => ({
          ...p,
          id: p.id.toString(),
          customer_id: p.customer_id.toString(),
          jumlah_bayar: parseFloat(p.jumlah_bayar.toString()),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data customer' },
      { status: 500 }
    );
  }
}

// PUT /api/customer/[id] - Update customer
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { id } = await params;
    const customerId = BigInt(id);
    const body = await req.json();
    const { nama, no_hp, alamat } = body;

    if (!nama || nama.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Nama customer wajib diisi' },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.update({
      where: { id: customerId },
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
    console.error('Error updating customer:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengupdate customer' },
      { status: 500 }
    );
  }
}

// DELETE /api/customer/[id] - Delete customer
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { id } = await params;
    const customerId = BigInt(id);

    // Check if customer has unpaid piutang
    const unpaidCount = await prisma.penjualan.count({
      where: {
        customer_id: customerId,
        sisa_piutang: { gt: 0 },
      },
    });

    if (unpaidCount > 0) {
      return NextResponse.json(
        { success: false, error: 'Customer masih memiliki piutang yang belum lunas' },
        { status: 400 }
      );
    }

    await prisma.customer.delete({
      where: { id: customerId },
    });

    return NextResponse.json({ success: true, message: 'Customer berhasil dihapus' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal menghapus customer' },
      { status: 500 }
    );
  }
}
