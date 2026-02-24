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
  const { role, userId } = payload as { userId: number; role: string };

  if (role !== 'ADMIN' && role !== 'OWNER') {
    return { error: 'Forbidden - Hanya admin yang dapat mengakses', status: 403 };
  }

  return { role, userId };
}

// GET /api/penjualan/[id] - Detail penjualan
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { id } = await params;

    const penjualan = await prisma.penjualan.findUnique({
      where: { id: BigInt(id) },
      include: {
        customer: { select: { id: true, nama: true, no_hp: true, alamat: true } },
        detail: true,
        pembayaran_log: {
          orderBy: { created_at: 'desc' },
        },
        pembayaran: {
          orderBy: { created_at: 'desc' },
          include: {
            customer: { select: { nama: true } },
          },
        },
      },
    });

    if (!penjualan) {
      return NextResponse.json(
        { success: false, error: 'Penjualan tidak ditemukan' },
        { status: 404 }
      );
    }

    const result = {
      id: penjualan.id.toString(),
      nomor_nota: penjualan.nomor_nota,
      customer_id: penjualan.customer_id.toString(),
      customer: {
        id: penjualan.customer.id.toString(),
        nama: penjualan.customer.nama,
        no_hp: penjualan.customer.no_hp,
        alamat: penjualan.customer.alamat,
      },
      tanggal: penjualan.tanggal,
      jenis_transaksi: penjualan.jenis_transaksi,
      total_penjualan: parseFloat(penjualan.total_penjualan.toString()),
      pengeluaran: parseFloat(penjualan.pengeluaran.toString()),
      grand_total: parseFloat(penjualan.grand_total.toString()),
      jumlah_bayar: parseFloat(penjualan.jumlah_bayar.toString()),
      sisa_piutang: parseFloat(penjualan.sisa_piutang.toString()),
      status: penjualan.status,
      status_cetak: penjualan.status_cetak,
      metode_pembayaran: penjualan.metode_pembayaran,
      keterangan: penjualan.keterangan,
      created_at: penjualan.created_at,
      updated_at: penjualan.updated_at,
      detail: penjualan.detail.map((d) => ({
        id: d.id.toString(),
        jenis_daging: d.jenis_daging,
        ekor: d.ekor,
        berat: parseFloat(d.berat.toString()),
        harga: parseFloat(d.harga.toString()),
        subtotal: parseFloat(d.subtotal.toString()),
      })),
      pembayaran_log: penjualan.pembayaran_log.map((log) => ({
        id: log.id.toString(),
        total_lama: parseFloat(log.total_lama.toString()),
        bayar_lama: parseFloat(log.bayar_lama.toString()),
        sisa_lama: parseFloat(log.sisa_lama.toString()),
        bayar_baru: parseFloat(log.bayar_baru.toString()),
        sisa_baru: parseFloat(log.sisa_baru.toString()),
        alasan: log.alasan,
        diubah_oleh: log.diubah_oleh,
        created_at: log.created_at,
      })),
      pembayaran: penjualan.pembayaran.map((p) => ({
        id: p.id.toString(),
        jumlah_bayar: parseFloat(p.jumlah_bayar.toString()),
        metode: p.metode,
        tanggal: p.tanggal,
        keterangan: p.keterangan,
        created_at: p.created_at,
      })),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching penjualan detail:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil detail penjualan' },
      { status: 500 }
    );
  }
}
