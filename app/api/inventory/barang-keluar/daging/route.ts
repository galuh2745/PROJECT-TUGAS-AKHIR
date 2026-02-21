import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

interface DetailItem {
  id?: string;
  jenis_daging_id: string;
  berat_kg: number;
  harga_per_kg: number;
}

// Helper function untuk validasi admin
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

// GET - Fetch all barang keluar daging with details
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const tanggal_dari = searchParams.get('tanggal_dari');
    const tanggal_sampai = searchParams.get('tanggal_sampai');
    const search = searchParams.get('search');

    const whereClause: Prisma.BarangKeluarDagingWhereInput = {};

    if (tanggal_dari || tanggal_sampai) {
      whereClause.tanggal = {};
      if (tanggal_dari) {
        whereClause.tanggal.gte = new Date(`${tanggal_dari}T00:00:00.000Z`);
      }
      if (tanggal_sampai) {
        whereClause.tanggal.lte = new Date(`${tanggal_sampai}T23:59:59.999Z`);
      }
    }

    if (search) {
      whereClause.nama_customer = { contains: search };
    }

    const barangKeluar = await prisma.barangKeluarDaging.findMany({
      where: whereClause,
      include: {
        details: {
          include: {
            jenis_daging: {
              select: { id: true, nama_jenis: true },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { tanggal: 'desc' },
    });

    const formattedData = barangKeluar.map((bk) => ({
      id: bk.id.toString(),
      tanggal: bk.tanggal.toISOString().split('T')[0],
      nama_customer: bk.nama_customer,
      total_penjualan: parseFloat(bk.total_penjualan.toString()),
      pengeluaran: parseFloat(bk.pengeluaran.toString()),
      saldo: parseFloat(bk.saldo.toString()),
      keterangan: bk.keterangan,
      created_at: bk.created_at.toISOString(),
      details: bk.details.map((d) => ({
        id: d.id.toString(),
        jenis_daging_id: d.jenis_daging_id.toString(),
        jenis_daging: {
          id: d.jenis_daging.id.toString(),
          nama_jenis: d.jenis_daging.nama_jenis,
        },
        berat_kg: parseFloat(d.berat_kg.toString()),
        harga_per_kg: parseFloat(d.harga_per_kg.toString()),
        subtotal: parseFloat(d.subtotal.toString()),
      })),
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching barang keluar daging:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat data' }, { status: 500 });
  }
}

// POST - Create new barang keluar daging with details
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const { tanggal, nama_customer, customer_id, pengeluaran, keterangan, details, jumlah_bayar, metode_pembayaran } = body;

    // Validations
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!customer_id) {
      return NextResponse.json({ success: false, error: 'Customer wajib dipilih' }, { status: 400 });
    }
    if (!details || !Array.isArray(details) || details.length === 0) {
      return NextResponse.json({ success: false, error: 'Minimal 1 item detail wajib diisi' }, { status: 400 });
    }

    // Validate customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: BigInt(customer_id) }
    });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    // Validate each detail item
    for (let i = 0; i < details.length; i++) {
      const item = details[i] as DetailItem;
      if (!item.jenis_daging_id) {
        return NextResponse.json({ success: false, error: `Baris ${i + 1}: Jenis daging wajib dipilih` }, { status: 400 });
      }
      if (!item.berat_kg || item.berat_kg <= 0) {
        return NextResponse.json({ success: false, error: `Baris ${i + 1}: Berat (kg) harus lebih dari 0` }, { status: 400 });
      }
      if (!item.harga_per_kg || item.harga_per_kg < 0) {
        return NextResponse.json({ success: false, error: `Baris ${i + 1}: Harga per kg tidak valid` }, { status: 400 });
      }
    }

    // Calculate totals at backend (prevent manipulation)
    let totalPenjualan = 0;
    const detailsWithSubtotal = (details as DetailItem[]).map((item) => {
      const subtotal = item.berat_kg * item.harga_per_kg;
      totalPenjualan += subtotal;
      return {
        jenis_daging_id: BigInt(item.jenis_daging_id),
        berat_kg: new Decimal(item.berat_kg.toFixed(2)),
        harga_per_kg: new Decimal(item.harga_per_kg.toFixed(2)),
        subtotal: new Decimal(subtotal.toFixed(2)),
      };
    });

    const saldo = totalPenjualan - (pengeluaran || 0);
    const namaCustomer = nama_customer?.trim() || customer.nama;
    const bayar = jumlah_bayar !== undefined && jumlah_bayar !== null ? parseFloat(jumlah_bayar) : totalPenjualan;
    const sisaPiutang = totalPenjualan - bayar;
    const metodePembayaran = metode_pembayaran || 'CASH';

    // Validasi jumlah bayar
    if (bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh negatif' }, { status: 400 });
    }
    if (bayar > totalPenjualan) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi total penjualan' }, { status: 400 });
    }

    // Create header with details + penjualan in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const header = await tx.barangKeluarDaging.create({
        data: {
          tanggal: new Date(tanggal),
          nama_customer: namaCustomer,
          total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
          pengeluaran: new Decimal((pengeluaran || 0).toFixed(2)),
          saldo: new Decimal(saldo.toFixed(2)),
          keterangan: keterangan || null,
          details: {
            create: detailsWithSubtotal,
          },
        },
        include: {
          details: {
            include: { jenis_daging: { select: { id: true, nama_jenis: true } } },
          },
        },
      });

      // Create Penjualan record (financial layer)
      await tx.penjualan.create({
        data: {
          customer_id: BigInt(customer_id),
          tanggal: new Date(tanggal),
          jenis_transaksi: 'DAGING',
          total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
          jumlah_bayar: new Decimal(bayar.toFixed(2)),
          sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
          metode_pembayaran: metodePembayaran,
          keterangan: `Barang Keluar Daging #${header.id} - ${namaCustomer}`,
        },
      });

      return header;
    });

    return NextResponse.json({
      success: true,
      message: 'Data berhasil disimpan',
      data: {
        id: result.id.toString(),
        tanggal: result.tanggal.toISOString().split('T')[0],
        nama_customer: result.nama_customer,
        total_penjualan: parseFloat(result.total_penjualan.toString()),
        pengeluaran: parseFloat(result.pengeluaran.toString()),
        saldo: parseFloat(result.saldo.toString()),
        jumlah_bayar: bayar,
        sisa_piutang: sisaPiutang,
        detail_count: result.details.length,
      },
    });
  } catch (error) {
    console.error('Error creating barang keluar daging:', error);
    return NextResponse.json({ success: false, error: 'Gagal menyimpan data' }, { status: 500 });
  }
}

// PUT - Update barang keluar daging with details
export async function PUT(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const { id, tanggal, nama_customer, customer_id, pengeluaran, keterangan, details, jumlah_bayar, metode_pembayaran } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
    }

    // Check if exists
    const existing = await prisma.barangKeluarDaging.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Data tidak ditemukan' }, { status: 404 });
    }

    // Validations
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!customer_id) {
      return NextResponse.json({ success: false, error: 'Customer wajib dipilih' }, { status: 400 });
    }
    if (!details || !Array.isArray(details) || details.length === 0) {
      return NextResponse.json({ success: false, error: 'Minimal 1 item detail wajib diisi' }, { status: 400 });
    }

    // Validate customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: BigInt(customer_id) }
    });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    // Validate each detail item
    for (let i = 0; i < details.length; i++) {
      const item = details[i] as DetailItem;
      if (!item.jenis_daging_id) {
        return NextResponse.json({ success: false, error: `Baris ${i + 1}: Jenis daging wajib dipilih` }, { status: 400 });
      }
      if (!item.berat_kg || item.berat_kg <= 0) {
        return NextResponse.json({ success: false, error: `Baris ${i + 1}: Berat (kg) harus lebih dari 0` }, { status: 400 });
      }
      if (!item.harga_per_kg || item.harga_per_kg < 0) {
        return NextResponse.json({ success: false, error: `Baris ${i + 1}: Harga per kg tidak valid` }, { status: 400 });
      }
    }

    // Calculate totals at backend
    let totalPenjualan = 0;
    const detailsWithSubtotal = (details as DetailItem[]).map((item) => {
      const subtotal = item.berat_kg * item.harga_per_kg;
      totalPenjualan += subtotal;
      return {
        jenis_daging_id: BigInt(item.jenis_daging_id),
        berat_kg: new Decimal(item.berat_kg.toFixed(2)),
        harga_per_kg: new Decimal(item.harga_per_kg.toFixed(2)),
        subtotal: new Decimal(subtotal.toFixed(2)),
      };
    });

    const saldo = totalPenjualan - (pengeluaran || 0);
    const namaCustomer = nama_customer?.trim() || customer.nama;
    const bayar = jumlah_bayar !== undefined && jumlah_bayar !== null ? parseFloat(jumlah_bayar) : totalPenjualan;
    const sisaPiutang = totalPenjualan - bayar;
    const metodePembayaran = metode_pembayaran || 'CASH';

    // Validasi jumlah bayar
    if (bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh negatif' }, { status: 400 });
    }
    if (bayar > totalPenjualan) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi total penjualan' }, { status: 400 });
    }

    // Update header, replace details, and update/create penjualan in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Delete existing details
      await tx.barangKeluarDagingDetail.deleteMany({
        where: { barang_keluar_daging_id: BigInt(id) },
      });

      // Update header and create new details
      const header = await tx.barangKeluarDaging.update({
        where: { id: BigInt(id) },
        data: {
          tanggal: new Date(tanggal),
          nama_customer: namaCustomer,
          total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
          pengeluaran: new Decimal((pengeluaran || 0).toFixed(2)),
          saldo: new Decimal(saldo.toFixed(2)),
          keterangan: keterangan || null,
          details: {
            create: detailsWithSubtotal,
          },
        },
        include: {
          details: {
            include: { jenis_daging: { select: { id: true, nama_jenis: true } } },
          },
        },
      });

      // Find linked penjualan by keterangan pattern
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          keterangan: { contains: `Barang Keluar Daging #${id}` },
          jenis_transaksi: 'DAGING',
        }
      });

      if (linkedPenjualan) {
        await tx.penjualan.update({
          where: { id: linkedPenjualan.id },
          data: {
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
            jumlah_bayar: new Decimal(bayar.toFixed(2)),
            sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
            metode_pembayaran: metodePembayaran,
            keterangan: `Barang Keluar Daging #${id} - ${namaCustomer}`,
          },
        });
      } else {
        await tx.penjualan.create({
          data: {
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            jenis_transaksi: 'DAGING',
            total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
            jumlah_bayar: new Decimal(bayar.toFixed(2)),
            sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
            metode_pembayaran: metodePembayaran,
            keterangan: `Barang Keluar Daging #${id} - ${namaCustomer}`,
          },
        });
      }

      return header;
    });

    return NextResponse.json({
      success: true,
      message: 'Data berhasil diperbarui',
      data: {
        id: result.id.toString(),
        tanggal: result.tanggal.toISOString().split('T')[0],
        nama_customer: result.nama_customer,
        total_penjualan: parseFloat(result.total_penjualan.toString()),
        pengeluaran: parseFloat(result.pengeluaran.toString()),
        saldo: parseFloat(result.saldo.toString()),
        jumlah_bayar: bayar,
        sisa_piutang: sisaPiutang,
        detail_count: result.details.length,
      },
    });
  } catch (error) {
    console.error('Error updating barang keluar daging:', error);
    return NextResponse.json({ success: false, error: 'Gagal memperbarui data' }, { status: 500 });
  }
}

// DELETE - Delete barang keluar daging (cascade deletes details)
export async function DELETE(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi' }, { status: 400 });
    }

    // Check if exists
    const existing = await prisma.barangKeluarDaging.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Data tidak ditemukan' }, { status: 404 });
    }

    // Delete (cascade deletes details) + linked penjualan
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Delete linked penjualan record
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          keterangan: { contains: `Barang Keluar Daging #${id}` },
          jenis_transaksi: 'DAGING',
        }
      });
      if (linkedPenjualan) {
        await tx.penjualan.delete({ where: { id: linkedPenjualan.id } });
      }

      await tx.barangKeluarDaging.delete({
        where: { id: BigInt(id) },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Data berhasil dihapus',
    });
  } catch (error) {
    console.error('Error deleting barang keluar daging:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus data' }, { status: 500 });
  }
}
