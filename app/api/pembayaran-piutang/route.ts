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

// GET /api/pembayaran-piutang - List pembayaran piutang
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

    const whereClause: Prisma.PembayaranPiutangWhereInput = {};

    if (tanggal_dari || tanggal_sampai) {
      whereClause.tanggal = {};
      if (tanggal_dari) {
        whereClause.tanggal.gte = new Date(tanggal_dari);
      }
      if (tanggal_sampai) {
        whereClause.tanggal.lte = new Date(tanggal_sampai);
      }
    }

    if (customer_id) {
      whereClause.customer_id = BigInt(customer_id);
    }

    const pembayaran = await prisma.pembayaranPiutang.findMany({
      where: whereClause,
      include: {
        customer: {
          select: { nama: true },
        },
        penjualan: {
          select: { nomor_nota: true },
        },
      },
      orderBy: { tanggal: 'desc' },
    });

    const result = pembayaran.map((p) => ({
      id: p.id.toString(),
      customer_id: p.customer_id.toString(),
      customer_nama: p.customer.nama,
      penjualan_id: p.penjualan_id?.toString() || null,
      nomor_nota: p.penjualan?.nomor_nota || null,
      tanggal: p.tanggal,
      jumlah_bayar: parseFloat(p.jumlah_bayar.toString()),
      metode: p.metode,
      keterangan: p.keterangan,
      created_at: p.created_at,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching pembayaran piutang:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil data pembayaran piutang' },
      { status: 500 }
    );
  }
}

// POST /api/pembayaran-piutang - Create pembayaran piutang (FIFO Rolling)
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const { customer_id, tanggal, jumlah_bayar, metode, keterangan } = body;

    // Validation
    if (!customer_id) {
      return NextResponse.json({ success: false, error: 'Customer wajib dipilih' }, { status: 400 });
    }
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!jumlah_bayar || jumlah_bayar <= 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar harus lebih dari 0' }, { status: 400 });
    }
    if (!metode) {
      return NextResponse.json({ success: false, error: 'Metode pembayaran wajib dipilih' }, { status: 400 });
    }

    // Check customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: BigInt(customer_id) },
    });

    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    // Get outstanding piutang (FIFO - oldest first)
    const outstandingPenjualan = await prisma.penjualan.findMany({
      where: {
        customer_id: BigInt(customer_id),
        sisa_piutang: { gt: 0 },
      },
      orderBy: { tanggal: 'asc' }, // FIFO: hutang tertua dulu
    });

    const totalPiutang = outstandingPenjualan.reduce(
      (sum, p) => sum + parseFloat(p.sisa_piutang.toString()),
      0
    );

    if (totalPiutang <= 0) {
      return NextResponse.json(
        { success: false, error: 'Customer tidak memiliki piutang' },
        { status: 400 }
      );
    }

    if (jumlah_bayar > totalPiutang) {
      return NextResponse.json(
        {
          success: false,
          error: `Jumlah bayar (Rp ${jumlah_bayar.toLocaleString()}) melebihi total piutang (Rp ${totalPiutang.toLocaleString()})`,
        },
        { status: 400 }
      );
    }

    // Use transaction to ensure data consistency (FIFO Rolling)
    const result = await prisma.$transaction(async (tx) => {
      // 1. FIFO: Kurangi hutang dari yang tertua
      let remainingPayment = jumlah_bayar;
      const updatedTransactions: { id: string; nomor_nota: string; dibayar: number; sisa: number; status: string }[] = [];

      for (const penjualan of outstandingPenjualan) {
        if (remainingPayment <= 0) break;

        const currentPiutang = parseFloat(penjualan.sisa_piutang.toString());
        const currentBayar = parseFloat(penjualan.jumlah_bayar.toString());
        const grandTotal = parseFloat(penjualan.grand_total.toString());
        const reduction = Math.min(remainingPayment, currentPiutang);
        const newSisaPiutang = currentPiutang - reduction;
        const newJumlahBayar = currentBayar + reduction;

        // Determine new status
        let newStatus: string;
        if (newSisaPiutang <= 0) {
          newStatus = 'lunas';
        } else if (newJumlahBayar > 0) {
          newStatus = 'sebagian';
        } else {
          newStatus = 'hutang';
        }

        await tx.penjualan.update({
          where: { id: penjualan.id },
          data: {
            sisa_piutang: new Prisma.Decimal(Math.max(0, newSisaPiutang).toFixed(2)),
            jumlah_bayar: new Prisma.Decimal(newJumlahBayar.toFixed(2)),
            status: newStatus,
          },
        });

        updatedTransactions.push({
          id: penjualan.id.toString(),
          nomor_nota: penjualan.nomor_nota,
          dibayar: reduction,
          sisa: Math.max(0, newSisaPiutang),
          status: newStatus,
        });

        remainingPayment -= reduction;
      }

      // 2. Create pembayaran record
      const pembayaran = await tx.pembayaranPiutang.create({
        data: {
          customer_id: BigInt(customer_id),
          tanggal: new Date(tanggal),
          jumlah_bayar: new Prisma.Decimal(jumlah_bayar),
          metode,
          keterangan: keterangan || null,
        },
        include: {
          customer: { select: { nama: true } },
        },
      });

      return { pembayaran, updatedTransactions };
    });

    // Get updated total piutang
    const updatedPiutang = await prisma.penjualan.aggregate({
      where: {
        customer_id: BigInt(customer_id),
        sisa_piutang: { gt: 0 },
      },
      _sum: { sisa_piutang: true },
    });

    return NextResponse.json({
      success: true,
      message: `Pembayaran Rp ${jumlah_bayar.toLocaleString()} berhasil diproses (FIFO)`,
      data: {
        id: result.pembayaran.id.toString(),
        customer_id: result.pembayaran.customer_id.toString(),
        customer_nama: result.pembayaran.customer.nama,
        tanggal: result.pembayaran.tanggal,
        jumlah_bayar: parseFloat(result.pembayaran.jumlah_bayar.toString()),
        metode: result.pembayaran.metode,
        keterangan: result.pembayaran.keterangan,
        piutang_sebelumnya: totalPiutang,
        sisa_piutang_total: parseFloat(updatedPiutang._sum.sisa_piutang?.toString() || '0'),
        transaksi_terdampak: result.updatedTransactions,
      },
    });
  } catch (error) {
    console.error('Error creating pembayaran piutang:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat pembayaran piutang' },
      { status: 500 }
    );
  }
}
