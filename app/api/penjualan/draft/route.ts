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

  if (role !== 'ADMIN' && role !== 'OWNER') {
    return { error: 'Forbidden', status: 403 };
  }
  return { role };
}

// GET: List all draft penjualan
export async function GET() {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const drafts = await prisma.penjualan.findMany({
      where: { status: 'draft' },
      include: {
        customer: { select: { id: true, nama: true, no_hp: true } },
        detail: true,
      },
      orderBy: { tanggal: 'desc' },
    });

    const formattedData = drafts.map((d) => ({
      id: d.id.toString(),
      customer: {
        id: d.customer.id.toString(),
        nama: d.customer.nama,
        no_hp: d.customer.no_hp,
      },
      tanggal: d.tanggal.toISOString().split('T')[0],
      jenis_transaksi: d.jenis_transaksi,
      total_penjualan: parseFloat(d.total_penjualan.toString()),
      pengeluaran: parseFloat(d.pengeluaran.toString()),
      grand_total: parseFloat(d.grand_total.toString()),
      status: d.status,
      keterangan: d.keterangan,
      detail: d.detail.map((det) => ({
        id: det.id.toString(),
        tipe: det.tipe,
        jenis_daging: det.jenis_daging,
        ekor: det.ekor,
        berat: parseFloat(det.berat.toString()),
        harga: parseFloat(det.harga.toString()),
        subtotal: parseFloat(det.subtotal.toString()),
      })),
      created_at: d.created_at.toISOString(),
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching drafts:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
