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

// Helper: find or create draft Penjualan for same customer + date
async function findOrCreateDraft(
  tx: Prisma.TransactionClient,
  customerId: bigint,
  tanggal: Date
) {
  const startOfDay = new Date(tanggal);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(tanggal);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const existing = await tx.penjualan.findFirst({
    where: {
      customer_id: customerId,
      tanggal: { gte: startOfDay, lte: endOfDay },
      status: 'draft',
    },
    include: { detail: true },
  });

  return existing;
}

// Helper: recalculate draft totals from its details
async function recalcDraftTotals(tx: Prisma.TransactionClient, penjualanId: bigint) {
  const details = await tx.penjualanDetail.findMany({
    where: { penjualan_id: penjualanId },
  });
  const totalPenjualan = details.reduce((sum, d) => sum + parseFloat(d.subtotal.toString()), 0);

  const penjualan = await tx.penjualan.findUnique({ where: { id: penjualanId } });
  const pengeluaran = penjualan ? parseFloat(penjualan.pengeluaran.toString()) : 0;
  const jumlahBayar = penjualan ? parseFloat(penjualan.jumlah_bayar.toString()) : 0;
  const grandTotal = totalPenjualan - pengeluaran;
  const sisaPiutang = Math.max(0, grandTotal - jumlahBayar);

  await tx.penjualan.update({
    where: { id: penjualanId },
    data: {
      total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
      grand_total: new Decimal(grandTotal.toFixed(2)),
      sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
    },
  });
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
          OR: [
            { keterangan: { contains: `Barang Keluar Daging #${bk.id}` } },
            { keterangan: { contains: `BK Daging #${bk.id}` } },
          ],
          jenis_transaksi: { in: ['DAGING', 'CAMPURAN'] },
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
        jumlah_bayar: linkedPenjualan ? parseFloat(linkedPenjualan.jumlah_bayar.toString()) : 0,
        sisa_piutang: linkedPenjualan ? parseFloat(linkedPenjualan.sisa_piutang.toString()) : parseFloat(bk.total_penjualan.toString()),
        grand_total: linkedPenjualan ? parseFloat(linkedPenjualan.grand_total.toString()) : parseFloat(bk.total_penjualan.toString()),
        status_piutang: linkedPenjualan?.status || 'hutang',
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

// POST - Create new barang keluar daging with details + auto draft penjualan
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const { tanggal, nama_customer, customer_id, pengeluaran, keterangan, details, jumlah_bayar, metode_pembayaran } = body;
    const bayarVal = parseFloat(jumlah_bayar) || 0;
    const metodeVal = metode_pembayaran || null;

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
    const namaCustomer = nama_customer?.trim() || customer.nama;

    // Create header with details + draft penjualan in transaction
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

      // Lookup jenis_daging names for penjualan detail
      const jenisDagingIds = (details as DetailItem[]).map(d => BigInt(d.jenis_daging_id));
      const jenisDagingList = await tx.jenisDaging.findMany({
        where: { id: { in: jenisDagingIds } },
        select: { id: true, nama_jenis: true },
      });
      const jenisDagingMap = new Map(jenisDagingList.map(j => [j.id.toString(), j.nama_jenis]));

      // Find or create draft penjualan for same customer + date
      const existingDraft = await findOrCreateDraft(tx, BigInt(customer_id), new Date(tanggal));

      let penjualanId: bigint;

      if (existingDraft) {
        // Append details to existing draft
        penjualanId = existingDraft.id;

        for (const item of details as DetailItem[]) {
          const namaJenis = jenisDagingMap.get(item.jenis_daging_id) || 'Daging';
          await tx.penjualanDetail.create({
            data: {
              penjualan_id: penjualanId,
              tipe: 'daging',
              jenis_daging: namaJenis,
              ekor: null,
              berat: new Decimal(item.berat_kg.toFixed(2)),
              harga: new Decimal(item.harga_per_kg.toFixed(2)),
              subtotal: new Decimal((item.berat_kg * item.harga_per_kg).toFixed(2)),
            },
          });
        }

        // Update pengeluaran and keterangan
        const newPengeluaran = parseFloat(existingDraft.pengeluaran.toString()) + pengeluaranVal;
        const keteranganParts = existingDraft.keterangan ? existingDraft.keterangan.split('; ') : [];
        keteranganParts.push(`BK Daging #${header.id}`);

        // Update jumlah_bayar: tambah bayar baru ke existing
        const existingBayar = parseFloat(existingDraft.jumlah_bayar.toString());
        const newBayar = existingBayar + bayarVal;

        await tx.penjualan.update({
          where: { id: penjualanId },
          data: {
            jenis_transaksi: 'CAMPURAN',
            pengeluaran: new Decimal(newPengeluaran.toFixed(2)),
            jumlah_bayar: new Decimal(newBayar.toFixed(2)),
            metode_pembayaran: metodeVal || existingDraft.metode_pembayaran,
            keterangan: keteranganParts.join('; '),
          },
        });

        // Recalculate totals
        await recalcDraftTotals(tx, penjualanId);
      } else {
        // Create new draft penjualan
        const grandTotal = totalPenjualan - pengeluaranVal;

        const penjualan = await tx.penjualan.create({
          data: {
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            jenis_transaksi: 'DAGING',
            total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
            pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
            grand_total: new Decimal(grandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(bayarVal.toFixed(2)),
            sisa_piutang: new Decimal(Math.max(0, grandTotal - bayarVal).toFixed(2)),
            status: 'draft',
            status_cetak: false,
            metode_pembayaran: metodeVal,
            keterangan: `BK Daging #${header.id}`,
            detail: {
              create: (details as DetailItem[]).map((item) => ({
                tipe: 'daging',
                jenis_daging: jenisDagingMap.get(item.jenis_daging_id) || 'Daging',
                ekor: null,
                berat: new Decimal(item.berat_kg.toFixed(2)),
                harga: new Decimal(item.harga_per_kg.toFixed(2)),
                subtotal: new Decimal((item.berat_kg * item.harga_per_kg).toFixed(2)),
              })),
            },
          },
        });

        penjualanId = penjualan.id;
      }

      return { header, penjualanId };
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
        draft_penjualan_id: result.penjualanId.toString(),
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
    const { id, tanggal, nama_customer, customer_id, pengeluaran, keterangan, details } = body;

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
    const namaCustomer = nama_customer?.trim() || customer.nama;

    // Update header, replace details, and update linked penjualan in transaction
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
          OR: [
            { keterangan: { contains: `Barang Keluar Daging #${id}` } },
            { keterangan: { contains: `BK Daging #${id}` } },
          ],
        },
        include: { detail: true },
      });

      if (linkedPenjualan) {
        // Remove old daging details for this BK, add new ones
        const oldDagingDetails = linkedPenjualan.detail.filter(d => d.tipe === 'daging');
        // Just delete all daging-type details (we'll re-add them)
        for (const od of oldDagingDetails) {
          await tx.penjualanDetail.delete({ where: { id: od.id } });
        }

        // Add new details
        for (const item of details as DetailItem[]) {
          const namaJenis = jenisDagingMap.get(item.jenis_daging_id) || 'Daging';
          await tx.penjualanDetail.create({
            data: {
              penjualan_id: linkedPenjualan.id,
              tipe: 'daging',
              jenis_daging: namaJenis,
              ekor: null,
              berat: new Decimal(item.berat_kg.toFixed(2)),
              harga: new Decimal(item.harga_per_kg.toFixed(2)),
              subtotal: new Decimal((item.berat_kg * item.harga_per_kg).toFixed(2)),
            },
          });
        }

        if (linkedPenjualan.status === 'draft') {
          await recalcDraftTotals(tx, linkedPenjualan.id);
        }
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

    // Delete (cascade deletes details) + handle linked penjualan
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find linked penjualan record
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          OR: [
            { keterangan: { contains: `Barang Keluar Daging #${id}` } },
            { keterangan: { contains: `BK Daging #${id}` } },
          ],
        },
        include: { detail: true },
      });

      if (linkedPenjualan) {
        // Check if this is the only BK in the draft
        const dagingDetails = linkedPenjualan.detail.filter(d => d.tipe === 'daging');
        const otherDetails = linkedPenjualan.detail.filter(d => d.tipe !== 'daging');

        if (otherDetails.length === 0 && linkedPenjualan.detail.length === dagingDetails.length) {
          // All details are from daging and belong to this BK → delete entire penjualan
          await tx.penjualan.delete({ where: { id: linkedPenjualan.id } });
        } else {
          // Remove daging details, keep others
          for (const dd of dagingDetails) {
            await tx.penjualanDetail.delete({ where: { id: dd.id } });
          }
          // Remove BK ref from keterangan
          const keteranganParts = (linkedPenjualan.keterangan || '').split('; ')
            .filter(p => !p.includes(`BK Daging #${id}`) && !p.includes(`Barang Keluar Daging #${id}`));
          await tx.penjualan.update({
            where: { id: linkedPenjualan.id },
            data: { keterangan: keteranganParts.join('; ') || null },
          });
          await recalcDraftTotals(tx, linkedPenjualan.id);
        }
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
