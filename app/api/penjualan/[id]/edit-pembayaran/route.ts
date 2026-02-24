import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { Prisma } from '@prisma/client';

async function validateAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    return { error: 'Unauthorized', status: 401, name: '' };
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  const { role, userId } = payload as { userId: number; role: string };

  if (role !== 'ADMIN' && role !== 'OWNER') {
    return { error: 'Forbidden', status: 403, name: '' };
  }

  // Get user name for audit trail
  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
    select: { name: true },
  });

  return { role, userId, name: user?.name || 'Unknown' };
}

// PUT /api/penjualan/[id]/edit-pembayaran - Edit pembayaran
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.status }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { tambah_bayar, metode, alasan } = body;

    // Validasi input
    if (!tambah_bayar || tambah_bayar <= 0) {
      return NextResponse.json(
        { success: false, error: 'Jumlah tambahan pembayaran harus lebih dari 0' },
        { status: 400 }
      );
    }

    if (!metode) {
      return NextResponse.json(
        { success: false, error: 'Metode pembayaran wajib dipilih' },
        { status: 400 }
      );
    }

    if (!alasan || alasan.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Alasan perubahan wajib diisi' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Ambil data lama
      const penjualan = await tx.penjualan.findUnique({
        where: { id: BigInt(id) },
      });

      if (!penjualan) {
        throw new Error('Penjualan tidak ditemukan');
      }

      const grandTotal = parseFloat(penjualan.grand_total.toString());
      const bayarLama = parseFloat(penjualan.jumlah_bayar.toString());
      const sisaLama = parseFloat(penjualan.sisa_piutang.toString());
      const tambahBayarNum = parseFloat(tambah_bayar);

      // 2. Validasi tidak melebihi sisa piutang
      if (tambahBayarNum > sisaLama) {
        throw new Error(`Jumlah bayar (Rp ${tambahBayarNum.toLocaleString()}) melebihi sisa piutang (Rp ${sisaLama.toLocaleString()})`);
      }

      // 3. Insert record pembayaran baru ke PembayaranPiutang
      await tx.pembayaranPiutang.create({
        data: {
          customer_id: penjualan.customer_id,
          penjualan_id: BigInt(id),
          tanggal: new Date(),
          jumlah_bayar: new Prisma.Decimal(tambahBayarNum.toFixed(2)),
          metode: metode,
          keterangan: alasan.trim(),
        },
      });

      // 4. Hitung ulang totalBayar dari SUM(PembayaranPiutang)
      const sumPembayaran = await tx.pembayaranPiutang.aggregate({
        where: { penjualan_id: BigInt(id) },
        _sum: { jumlah_bayar: true },
      });
      const totalBayarBaru = parseFloat(sumPembayaran._sum.jumlah_bayar?.toString() || '0');
      const sisaBaru = Math.max(0, grandTotal - totalBayarBaru);

      // 5. Tentukan status
      let status: string;
      if (sisaBaru <= 0) {
        status = 'lunas';
      } else if (totalBayarBaru > 0) {
        status = 'sebagian';
      } else {
        status = 'hutang';
      }

      // 6. Simpan ke PembayaranLog (audit trail)
      await tx.pembayaranLog.create({
        data: {
          penjualan_id: BigInt(id),
          total_lama: new Prisma.Decimal(grandTotal),
          bayar_lama: new Prisma.Decimal(bayarLama),
          sisa_lama: new Prisma.Decimal(sisaLama),
          bayar_baru: new Prisma.Decimal(totalBayarBaru),
          sisa_baru: new Prisma.Decimal(sisaBaru),
          alasan: alasan.trim(),
          diubah_oleh: validation.name,
        },
      });

      // 7. Update penjualan dengan totalBayar dari SUM
      const updated = await tx.penjualan.update({
        where: { id: BigInt(id) },
        data: {
          jumlah_bayar: new Prisma.Decimal(totalBayarBaru.toFixed(2)),
          sisa_piutang: new Prisma.Decimal(sisaBaru.toFixed(2)),
          status,
        },
        include: {
          customer: { select: { nama: true } },
        },
      });

      return {
        id: updated.id.toString(),
        nomor_nota: updated.nomor_nota,
        grand_total: grandTotal,
        tambah_bayar: tambahBayarNum,
        jumlah_bayar: totalBayarBaru,
        sisa_piutang: sisaBaru,
        status,
        bayar_lama: bayarLama,
        sisa_lama: sisaLama,
      };
    });

    return NextResponse.json({
      success: true,
      message: 'Pembayaran berhasil ditambahkan',
      data: result,
    });
  } catch (error) {
    console.error('Error updating pembayaran:', error);
    const message = error instanceof Error ? error.message : 'Gagal mengupdate pembayaran';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
