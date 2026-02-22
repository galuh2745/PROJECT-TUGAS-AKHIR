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

// Helper: Generate nomor nota unik NOTA-YYYYMMDD-XXXX
async function generateNomorNota(tanggal: Date, tx?: Prisma.TransactionClient): Promise<string> {
  const db = tx || prisma;
  const dateStr = tanggal.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `NOTA-${dateStr}-`;

  const lastNota = await db.penjualan.findFirst({
    where: { nomor_nota: { startsWith: prefix } },
    orderBy: { nomor_nota: 'desc' },
    select: { nomor_nota: true },
  });

  let nextNumber = 1;
  if (lastNota) {
    const lastNum = parseInt(lastNota.nomor_nota.replace(prefix, ''));
    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

// Helper: Compute status penjualan
function computeStatus(grandTotal: number, jumlahBayar: number): string {
  const sisa = grandTotal - jumlahBayar;
  if (sisa <= 0) return 'lunas';
  if (jumlahBayar > 0) return 'sebagian';
  return 'hutang';
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

// POST /api/penjualan - Create new penjualan (manual / barang keluar → piutang)
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const {
      customer_id,
      tanggal,
      jenis_transaksi,
      total_penjualan,
      pengeluaran: pengeluaranInput,
      jumlah_bayar,
      metode_pembayaran,
      keterangan,
      detail,
    } = body;

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

    const pengeluaran = pengeluaranInput || 0;
    const grandTotal = total_penjualan - pengeluaran;

    if (jumlah_bayar > grandTotal) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi grand total' }, { status: 400 });
    }

    const sisaPiutang = Math.max(0, grandTotal - jumlah_bayar);
    const statusVal = computeStatus(grandTotal, jumlah_bayar);

    // Check existing piutang for this customer
    const existingPiutang = await prisma.penjualan.aggregate({
      where: {
        customer_id: BigInt(customer_id),
        sisa_piutang: { gt: 0 },
      },
      _sum: { sisa_piutang: true },
    });
    const totalPiutangAktif = parseFloat(existingPiutang._sum.sisa_piutang?.toString() || '0');

    const result = await prisma.$transaction(async (tx) => {
      const nomorNota = await generateNomorNota(new Date(tanggal), tx);

      const penjualan = await tx.penjualan.create({
        data: {
          nomor_nota: nomorNota,
          customer_id: BigInt(customer_id),
          tanggal: new Date(tanggal),
          jenis_transaksi: jenis_transaksi || 'MANUAL',
          total_penjualan: new Prisma.Decimal(total_penjualan),
          pengeluaran: new Prisma.Decimal(pengeluaran),
          grand_total: new Prisma.Decimal(grandTotal),
          jumlah_bayar: new Prisma.Decimal(jumlah_bayar),
          sisa_piutang: new Prisma.Decimal(sisaPiutang),
          status: statusVal,
          metode_pembayaran,
          keterangan: keterangan || null,
          ...(detail && detail.length > 0
            ? {
                detail: {
                  create: detail.map((d: { jenis_daging?: string; ekor?: number; berat: number; harga: number }) => ({
                    jenis_daging: d.jenis_daging || null,
                    ekor: d.ekor || null,
                    berat: new Prisma.Decimal(d.berat),
                    harga: new Prisma.Decimal(d.harga),
                    subtotal: new Prisma.Decimal((d.berat * d.harga).toFixed(2)),
                  })),
                },
              }
            : {}),
        },
        include: {
          customer: { select: { nama: true } },
          detail: true,
        },
      });

      return penjualan;
    });

    return NextResponse.json({
      success: true,
      data: {
        id: result.id.toString(),
        nomor_nota: result.nomor_nota,
        customer_id: result.customer_id.toString(),
        customer_nama: result.customer.nama,
        tanggal: result.tanggal,
        jenis_transaksi: result.jenis_transaksi,
        total_penjualan: parseFloat(result.total_penjualan.toString()),
        pengeluaran: parseFloat(result.pengeluaran.toString()),
        grand_total: parseFloat(result.grand_total.toString()),
        jumlah_bayar: parseFloat(result.jumlah_bayar.toString()),
        sisa_piutang: parseFloat(result.sisa_piutang.toString()),
        status: result.status,
        metode_pembayaran: result.metode_pembayaran,
        keterangan: result.keterangan,
        piutang_sebelumnya: totalPiutangAktif,
        total_piutang_aktif: totalPiutangAktif + sisaPiutang,
        detail: result.detail.map((d) => ({
          id: d.id.toString(),
          jenis_daging: d.jenis_daging,
          ekor: d.ekor,
          berat: parseFloat(d.berat.toString()),
          harga: parseFloat(d.harga.toString()),
          subtotal: parseFloat(d.subtotal.toString()),
        })),
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
