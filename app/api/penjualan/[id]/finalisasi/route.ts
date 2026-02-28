import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';

async function validateAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return { error: 'Unauthorized', status: 401 };

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  const { role, userId } = payload as { userId: number; role: string };

  if (role !== 'ADMIN' && role !== 'OWNER') {
    return { error: 'Forbidden', status: 403 };
  }
  return { role, userId };
}

// Generate NOTA-YYYYMMDDASL-XXX format
async function generateNomorNota(tanggal: Date, tx: Prisma.TransactionClient): Promise<string> {
  const year = tanggal.getFullYear();
  const month = String(tanggal.getMonth() + 1).padStart(2, '0');
  const day = String(tanggal.getDate()).padStart(2, '0');
  const prefix = `NOTA-${year}${month}${day}ASL-`;

  const lastNota = await tx.penjualan.findFirst({
    where: { nomor_nota: { startsWith: prefix } },
    orderBy: { nomor_nota: 'desc' },
    select: { nomor_nota: true },
  });

  let nextNumber = 1;
  if (lastNota?.nomor_nota) {
    const lastNum = parseInt(lastNota.nomor_nota.replace(prefix, ''));
    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

// POST: Finalisasi draft → generate nota, support pembayaran langsung
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const jumlahBayarInput = parseFloat(body.jumlah_bayar || '0') || 0;
    const metodePembayaran = body.metode_pembayaran || null;

    const penjualan = await prisma.penjualan.findUnique({
      where: { id: BigInt(id) },
      include: { detail: true, customer: true },
    });

    if (!penjualan) {
      return NextResponse.json({ success: false, error: 'Data tidak ditemukan' }, { status: 404 });
    }

    if (penjualan.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Transaksi sudah difinalisasi' }, { status: 400 });
    }

    const grandTotal = parseFloat(penjualan.grand_total.toString());

    // Validasi jumlah bayar tidak melebihi grand total
    const jumlahBayar = Math.min(jumlahBayarInput, grandTotal);
    const sisaPiutang = grandTotal - jumlahBayar;

    // Tentukan status berdasarkan pembayaran
    let status: string;
    let metode: string;
    if (jumlahBayar >= grandTotal) {
      status = 'lunas';
      metode = metodePembayaran || 'CASH';
    } else if (jumlahBayar > 0) {
      status = 'sebagian';
      metode = metodePembayaran || 'CASH';
    } else {
      status = 'hutang';
      metode = 'BELUM_BAYAR';
    }

    const result = await prisma.$transaction(async (tx) => {
      const nomorNota = await generateNomorNota(penjualan.tanggal, tx);

      const updated = await tx.penjualan.update({
        where: { id: BigInt(id) },
        data: {
          nomor_nota: nomorNota,
          jumlah_bayar: new Decimal(jumlahBayar.toFixed(2)),
          sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
          status,
          status_cetak: true,
          metode_pembayaran: metode,
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      message: 'Transaksi berhasil difinalisasi',
      data: {
        id: result.id.toString(),
        nomor_nota: result.nomor_nota,
        grand_total: parseFloat(result.grand_total.toString()),
        jumlah_bayar: parseFloat(result.jumlah_bayar.toString()),
        sisa_piutang: parseFloat(result.sisa_piutang.toString()),
        status: result.status,
      },
    });
  } catch (error) {
    console.error('Error finalizing penjualan:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
