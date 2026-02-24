import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

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

// Generate INV-YYYYMM-XXX format
async function generateNomorNota(tanggal: Date, tx: Prisma.TransactionClient): Promise<string> {
  const year = tanggal.getFullYear();
  const month = String(tanggal.getMonth() + 1).padStart(2, '0');
  const prefix = `INV-${year}${month}-`;

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

function computeStatus(grandTotal: number, jumlahBayar: number): string {
  const sisa = grandTotal - jumlahBayar;
  if (sisa <= 0) return 'lunas';
  if (jumlahBayar > 0) return 'sebagian';
  return 'hutang';
}

// POST: Finalisasi draft → generate nota, set payment, mark as printed
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
    const body = await req.json();
    const { jumlah_bayar, metode_pembayaran } = body;

    if (jumlah_bayar === undefined || jumlah_bayar === null) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar wajib diisi' }, { status: 400 });
    }
    if (!metode_pembayaran) {
      return NextResponse.json({ success: false, error: 'Metode pembayaran wajib dipilih' }, { status: 400 });
    }

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
    const bayar = parseFloat(jumlah_bayar);

    if (bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh negatif' }, { status: 400 });
    }
    if (bayar > grandTotal) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi grand total' }, { status: 400 });
    }

    const sisaPiutang = Math.max(0, grandTotal - bayar);
    const statusVal = computeStatus(grandTotal, bayar);

    const result = await prisma.$transaction(async (tx) => {
      const nomorNota = await generateNomorNota(penjualan.tanggal, tx);

      const updated = await tx.penjualan.update({
        where: { id: BigInt(id) },
        data: {
          nomor_nota: nomorNota,
          jumlah_bayar: new Decimal(bayar.toFixed(2)),
          sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
          status: statusVal,
          status_cetak: true,
          metode_pembayaran: metode_pembayaran,
        },
      });

      // Create PembayaranPiutang record if bayar > 0
      if (bayar > 0) {
        await tx.pembayaranPiutang.create({
          data: {
            customer_id: penjualan.customer_id,
            penjualan_id: BigInt(id),
            tanggal: penjualan.tanggal,
            jumlah_bayar: new Decimal(bayar.toFixed(2)),
            metode: metode_pembayaran,
            keterangan: `Pembayaran awal saat finalisasi nota ${nomorNota}`,
          },
        });
      }

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
