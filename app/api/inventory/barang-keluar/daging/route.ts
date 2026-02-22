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

// Helper: Generate nomor nota unik NOTA-YYYYMMDD-XXXX
async function generateNomorNota(tanggal: Date, tx: Prisma.TransactionClient): Promise<string> {
  const dateStr = tanggal.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `NOTA-${dateStr}-`;

  const lastNota = await tx.penjualan.findFirst({
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

// Helper: Compute status
function computeStatus(grandTotal: number, jumlahBayar: number): string {
  const sisa = grandTotal - jumlahBayar;
  if (sisa <= 0) return 'lunas';
  if (jumlahBayar > 0) return 'sebagian';
  return 'hutang';
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

    const formattedData = await Promise.all(barangKeluar.map(async (bk) => {
      // Find linked penjualan for piutang info
      const linkedPenjualan = await prisma.penjualan.findFirst({
        where: {
          keterangan: { contains: `Barang Keluar Daging #${bk.id}` },
          jenis_transaksi: 'DAGING',
        },
        select: {
          id: true,
          nomor_nota: true,
          jumlah_bayar: true,
          sisa_piutang: true,
          grand_total: true,
          status: true,
        },
      });

      return {
        id: bk.id.toString(),
        tanggal: bk.tanggal.toISOString().split('T')[0],
        nama_customer: bk.nama_customer,
        total_penjualan: parseFloat(bk.total_penjualan.toString()),
        pengeluaran: parseFloat(bk.pengeluaran.toString()),
        saldo: parseFloat(bk.saldo.toString()),
        keterangan: bk.keterangan,
        // Piutang info from linked penjualan
        nomor_nota: linkedPenjualan?.nomor_nota || null,
        jumlah_bayar: linkedPenjualan ? parseFloat(linkedPenjualan.jumlah_bayar.toString()) : parseFloat(bk.total_penjualan.toString()),
        sisa_piutang: linkedPenjualan ? parseFloat(linkedPenjualan.sisa_piutang.toString()) : 0,
        grand_total: linkedPenjualan ? parseFloat(linkedPenjualan.grand_total.toString()) : parseFloat(bk.saldo.toString()),
        status_piutang: linkedPenjualan?.status || 'lunas',
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
      };
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching barang keluar daging:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat data' }, { status: 500 });
  }
}

// POST - Create new barang keluar daging with details + auto penjualan (piutang)
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

    const pengeluaranVal = pengeluaran || 0;
    const saldo = totalPenjualan - pengeluaranVal;
    const grandTotal = totalPenjualan - pengeluaranVal;
    const namaCustomer = nama_customer?.trim() || customer.nama;
    const bayar = jumlah_bayar !== undefined && jumlah_bayar !== null ? parseFloat(jumlah_bayar) : 0;
    const sisaPiutang = Math.max(0, grandTotal - bayar);
    const statusVal = computeStatus(grandTotal, bayar);
    const metodePembayaran = metode_pembayaran || 'CASH';

    // Validasi jumlah bayar
    if (bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh negatif' }, { status: 400 });
    }
    if (bayar > grandTotal) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi grand total' }, { status: 400 });
    }

    // Create header with details + penjualan in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const header = await tx.barangKeluarDaging.create({
        data: {
          tanggal: new Date(tanggal),
          nama_customer: namaCustomer,
          total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
          pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
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

      // Generate nomor nota
      const nomorNota = await generateNomorNota(new Date(tanggal), tx);

      // Lookup jenis_daging names for penjualan detail
      const jenisDagingIds = (details as DetailItem[]).map(d => BigInt(d.jenis_daging_id));
      const jenisDagingList = await tx.jenisDaging.findMany({
        where: { id: { in: jenisDagingIds } },
        select: { id: true, nama_jenis: true },
      });
      const jenisDagingMap = new Map(jenisDagingList.map(j => [j.id.toString(), j.nama_jenis]));

      // Create Penjualan record with full piutang fields + detail
      const penjualan = await tx.penjualan.create({
        data: {
          nomor_nota: nomorNota,
          customer_id: BigInt(customer_id),
          tanggal: new Date(tanggal),
          jenis_transaksi: 'DAGING',
          total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
          pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
          grand_total: new Decimal(grandTotal.toFixed(2)),
          jumlah_bayar: new Decimal(bayar.toFixed(2)),
          sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
          status: statusVal,
          metode_pembayaran: metodePembayaran,
          keterangan: `Barang Keluar Daging #${header.id} - ${namaCustomer}`,
          detail: {
            create: (details as DetailItem[]).map((item) => ({
              jenis_daging: jenisDagingMap.get(item.jenis_daging_id) || null,
              ekor: null,
              berat: new Decimal(item.berat_kg.toFixed(2)),
              harga: new Decimal(item.harga_per_kg.toFixed(2)),
              subtotal: new Decimal((item.berat_kg * item.harga_per_kg).toFixed(2)),
            })),
          },
        },
      });

      return { header, penjualan };
    });

    return NextResponse.json({
      success: true,
      message: 'Data berhasil disimpan',
      data: {
        id: result.header.id.toString(),
        tanggal: result.header.tanggal.toISOString().split('T')[0],
        nama_customer: result.header.nama_customer,
        total_penjualan: parseFloat(result.header.total_penjualan.toString()),
        pengeluaran: parseFloat(result.header.pengeluaran.toString()),
        saldo: parseFloat(result.header.saldo.toString()),
        grand_total: grandTotal,
        jumlah_bayar: bayar,
        sisa_piutang: sisaPiutang,
        status: statusVal,
        nomor_nota: result.penjualan.nomor_nota,
        detail_count: result.header.details.length,
      },
    });
  } catch (error) {
    console.error('Error creating barang keluar daging:', error);
    return NextResponse.json({ success: false, error: 'Gagal menyimpan data' }, { status: 500 });
  }
}

// PUT - Update barang keluar daging with details + update penjualan
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

    const pengeluaranVal = pengeluaran || 0;
    const saldo = totalPenjualan - pengeluaranVal;
    const grandTotal = totalPenjualan - pengeluaranVal;
    const namaCustomer = nama_customer?.trim() || customer.nama;
    const bayar = jumlah_bayar !== undefined && jumlah_bayar !== null ? parseFloat(jumlah_bayar) : 0;
    const sisaPiutang = Math.max(0, grandTotal - bayar);
    const statusVal = computeStatus(grandTotal, bayar);
    const metodePembayaran = metode_pembayaran || 'CASH';

    // Validasi jumlah bayar
    if (bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh negatif' }, { status: 400 });
    }
    if (bayar > grandTotal) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi grand total' }, { status: 400 });
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
          pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
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

      // Lookup jenis_daging names
      const jenisDagingIds = (details as DetailItem[]).map(d => BigInt(d.jenis_daging_id));
      const jenisDagingList = await tx.jenisDaging.findMany({
        where: { id: { in: jenisDagingIds } },
        select: { id: true, nama_jenis: true },
      });
      const jenisDagingMap = new Map(jenisDagingList.map(j => [j.id.toString(), j.nama_jenis]));

      // Find linked penjualan by keterangan pattern
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          keterangan: { contains: `Barang Keluar Daging #${id}` },
          jenis_transaksi: 'DAGING',
        }
      });

      if (linkedPenjualan) {
        // Delete existing penjualan detail
        await tx.penjualanDetail.deleteMany({
          where: { penjualan_id: linkedPenjualan.id },
        });

        await tx.penjualan.update({
          where: { id: linkedPenjualan.id },
          data: {
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
            pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
            grand_total: new Decimal(grandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(bayar.toFixed(2)),
            sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
            status: statusVal,
            metode_pembayaran: metodePembayaran,
            keterangan: `Barang Keluar Daging #${id} - ${namaCustomer}`,
            detail: {
              create: (details as DetailItem[]).map((item) => ({
                jenis_daging: jenisDagingMap.get(item.jenis_daging_id) || null,
                ekor: null,
                berat: new Decimal(item.berat_kg.toFixed(2)),
                harga: new Decimal(item.harga_per_kg.toFixed(2)),
                subtotal: new Decimal((item.berat_kg * item.harga_per_kg).toFixed(2)),
              })),
            },
          },
        });
      } else {
        const nomorNota = await generateNomorNota(new Date(tanggal), tx);
        await tx.penjualan.create({
          data: {
            nomor_nota: nomorNota,
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            jenis_transaksi: 'DAGING',
            total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
            pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
            grand_total: new Decimal(grandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(bayar.toFixed(2)),
            sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
            status: statusVal,
            metode_pembayaran: metodePembayaran,
            keterangan: `Barang Keluar Daging #${id} - ${namaCustomer}`,
            detail: {
              create: (details as DetailItem[]).map((item) => ({
                jenis_daging: jenisDagingMap.get(item.jenis_daging_id) || null,
                ekor: null,
                berat: new Decimal(item.berat_kg.toFixed(2)),
                harga: new Decimal(item.harga_per_kg.toFixed(2)),
                subtotal: new Decimal((item.berat_kg * item.harga_per_kg).toFixed(2)),
              })),
            },
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
        grand_total: grandTotal,
        jumlah_bayar: bayar,
        sisa_piutang: sisaPiutang,
        status: statusVal,
        detail_count: result.details.length,
      },
    });
  } catch (error) {
    console.error('Error updating barang keluar daging:', error);
    return NextResponse.json({ success: false, error: 'Gagal memperbarui data' }, { status: 500 });
  }
}

// DELETE - Delete barang keluar daging (cascade deletes details) + linked penjualan
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
      // Delete linked penjualan record (cascade deletes penjualan detail)
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
