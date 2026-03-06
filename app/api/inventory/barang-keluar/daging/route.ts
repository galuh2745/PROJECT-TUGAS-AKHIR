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

// Helper: recalculate penjualan totals from its BK references
async function recalcPenjualanTotals(tx: Prisma.TransactionClient, penjualanId: bigint) {
  const penjualan = await tx.penjualan.findUnique({ where: { id: penjualanId } });
  if (!penjualan) return;

  // Parse BK references from keterangan to rebuild pengeluaran
  const ket = penjualan.keterangan || '';
  const dagingRefMatches = [...ket.matchAll(/BK Daging #(\d+)/g)];
  const ayamRefMatches = [...ket.matchAll(/BK Ayam #(\d+)/g)];

  let totalPengeluaran = 0;

  // Delete existing details and rebuild from BK records
  await tx.penjualanDetail.deleteMany({ where: { penjualan_id: penjualanId } });

  for (const match of dagingRefMatches) {
    const bkId = BigInt(match[1]);
    const bk = await tx.barangKeluarDaging.findUnique({
      where: { id: bkId },
      include: { details: { include: { jenis_daging: { select: { nama_jenis: true } } } } },
    });
    if (bk) {
      totalPengeluaran += parseFloat(bk.pengeluaran.toString());
      for (const d of bk.details) {
        await tx.penjualanDetail.create({
          data: {
            penjualan_id: penjualanId,
            tipe: 'daging',
            jenis_daging: d.jenis_daging.nama_jenis,
            ekor: null,
            berat: d.berat_kg,
            harga: d.harga_per_kg,
            subtotal: d.subtotal,
          },
        });
      }
    }
  }

  for (const match of ayamRefMatches) {
    const bkId = BigInt(match[1]);
    const bk = await tx.barangKeluarAyamHidup.findUnique({ where: { id: bkId } });
    if (bk) {
      totalPengeluaran += parseFloat(bk.pengeluaran.toString());
      await tx.penjualanDetail.create({
        data: {
          penjualan_id: penjualanId,
          tipe: 'ayam_hidup',
          jenis_daging: `Ayam Hidup ${bk.jenis_daging}`,
          ekor: bk.jumlah_ekor,
          berat: bk.total_kg,
          harga: bk.harga_per_kg,
          subtotal: bk.total_penjualan,
        },
      });
    }
  }

  // Recalculate totals
  const allDetails = await tx.penjualanDetail.findMany({ where: { penjualan_id: penjualanId } });
  const newTotalPenjualan = allDetails.reduce((sum, d) => sum + parseFloat(d.subtotal.toString()), 0);
  const newGrandTotal = newTotalPenjualan - totalPengeluaran;
  const jumlahBayar = parseFloat(penjualan.jumlah_bayar.toString());
  const newSisaPiutang = Math.max(0, newGrandTotal - jumlahBayar);

  let newStatus: string;
  if (jumlahBayar >= newGrandTotal && newGrandTotal > 0) newStatus = 'lunas';
  else if (jumlahBayar > 0) newStatus = 'sebagian';
  else newStatus = 'hutang';

  // Determine jenis_transaksi
  const hasDaging = dagingRefMatches.length > 0;
  const hasAyam = ayamRefMatches.length > 0;
  const jenisTransaksi = (hasDaging && hasAyam) ? 'CAMPURAN' : hasDaging ? 'DAGING' : hasAyam ? 'AYAM_HIDUP' : penjualan.jenis_transaksi;

  await tx.penjualan.update({
    where: { id: penjualanId },
    data: {
      jenis_transaksi: jenisTransaksi,
      total_penjualan: new Decimal(newTotalPenjualan.toFixed(2)),
      pengeluaran: new Decimal(totalPengeluaran.toFixed(2)),
      grand_total: new Decimal(newGrandTotal.toFixed(2)),
      sisa_piutang: new Decimal(newSisaPiutang.toFixed(2)),
      status: newStatus,
    },
  });
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

// POST - Create new barang keluar daging with details + auto penjualan
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const { tanggal, nama_customer, customer_id, pengeluaran, keterangan, details, jumlah_bayar, metode_pembayaran, total_penjualan_custom } = body;
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

    // Add harga bis if provided
    if (total_penjualan_custom && parseFloat(total_penjualan_custom) > 0) {
      totalPenjualan += parseFloat(total_penjualan_custom);
    }

    const pengeluaranVal = pengeluaran || 0;
    const saldo = totalPenjualan - pengeluaranVal;
    const namaCustomer = nama_customer?.trim() || customer.nama;

    // Create header with details + auto-finalized penjualan in transaction
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

      // Check for existing penjualan for same customer + same date (merge into 1 nota)
      const existingPenjualan = await tx.penjualan.findFirst({
        where: {
          customer_id: BigInt(customer_id),
          tanggal: new Date(tanggal),
        },
        include: { detail: true },
      });

      let penjualanId: bigint;
      let nomorNota: string;
      let finalStatus: string;

      if (existingPenjualan) {
        // ── MERGE into existing penjualan ──
        // Add new detail items
        for (const item of details as DetailItem[]) {
          const namaJenis = jenisDagingMap.get(item.jenis_daging_id) || 'Daging';
          await tx.penjualanDetail.create({
            data: {
              penjualan_id: existingPenjualan.id,
              tipe: 'daging',
              jenis_daging: namaJenis,
              ekor: null,
              berat: new Decimal(item.berat_kg.toFixed(2)),
              harga: new Decimal(item.harga_per_kg.toFixed(2)),
              subtotal: new Decimal((item.berat_kg * item.harga_per_kg).toFixed(2)),
            },
          });
        }

        // Recalculate totals
        const allDetails = await tx.penjualanDetail.findMany({
          where: { penjualan_id: existingPenjualan.id },
        });
        const newTotalPenjualan = allDetails.reduce((sum, d) => sum + parseFloat(d.subtotal.toString()), 0);
        const newPengeluaran = parseFloat(existingPenjualan.pengeluaran.toString()) + pengeluaranVal;
        const newGrandTotal = newTotalPenjualan - newPengeluaran;

        // Handle payment for this new BK
        const existingBayar = parseFloat(existingPenjualan.jumlah_bayar.toString());
        const newBayar = Math.min(bayarVal, Math.max(0, newGrandTotal - existingBayar));
        const totalBayar = existingBayar + newBayar;
        const newSisaPiutang = Math.max(0, newGrandTotal - totalBayar);

        // Determine status
        let status: string;
        let metode: string;
        if (totalBayar >= newGrandTotal && newGrandTotal > 0) {
          status = 'lunas';
          metode = metodeVal || existingPenjualan.metode_pembayaran || 'CASH';
        } else if (totalBayar > 0) {
          status = 'sebagian';
          metode = metodeVal || existingPenjualan.metode_pembayaran || 'CASH';
        } else {
          status = 'hutang';
          metode = 'BELUM_BAYAR';
        }

        // Update jenis_transaksi to CAMPURAN if different types
        const existingJenis = existingPenjualan.jenis_transaksi;
        const newJenis = existingJenis === 'DAGING' ? 'DAGING' : 'CAMPURAN';

        // Append BK reference to keterangan
        const existingKet = existingPenjualan.keterangan || '';
        const newKet = existingKet ? `${existingKet}; BK Daging #${header.id}` : `BK Daging #${header.id}`;

        await tx.penjualan.update({
          where: { id: existingPenjualan.id },
          data: {
            jenis_transaksi: newJenis,
            total_penjualan: new Decimal(newTotalPenjualan.toFixed(2)),
            pengeluaran: new Decimal(newPengeluaran.toFixed(2)),
            grand_total: new Decimal(newGrandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(totalBayar.toFixed(2)),
            sisa_piutang: new Decimal(newSisaPiutang.toFixed(2)),
            status,
            metode_pembayaran: metode,
            keterangan: newKet,
          },
        });

        // Create PembayaranPiutang if there's new payment
        if (newBayar > 0) {
          await tx.pembayaranPiutang.create({
            data: {
              customer_id: BigInt(customer_id),
              penjualan_id: existingPenjualan.id,
              tanggal: new Date(tanggal),
              jumlah_bayar: new Decimal(newBayar.toFixed(2)),
              metode: metode === 'BELUM_BAYAR' ? 'CASH' : metode,
              keterangan: `Pembayaran ${existingPenjualan.nomor_nota} (BK Daging #${header.id})`,
            },
          });
        }

        penjualanId = existingPenjualan.id;
        nomorNota = existingPenjualan.nomor_nota || '';
        finalStatus = status;
      } else {
        // ── CREATE new penjualan ──
        nomorNota = await generateNomorNota(new Date(tanggal), tx);

        const grandTotal = totalPenjualan - pengeluaranVal;
        const jumlahBayarFinal = Math.min(bayarVal, Math.max(0, grandTotal));
        const sisaPiutang = Math.max(0, grandTotal - jumlahBayarFinal);

        let status: string;
        let metode: string;
        if (jumlahBayarFinal >= grandTotal && grandTotal > 0) {
          status = 'lunas';
          metode = metodeVal || 'CASH';
        } else if (jumlahBayarFinal > 0) {
          status = 'sebagian';
          metode = metodeVal || 'CASH';
        } else {
          status = 'hutang';
          metode = 'BELUM_BAYAR';
        }

        const penjualan = await tx.penjualan.create({
          data: {
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            nomor_nota: nomorNota,
            jenis_transaksi: 'DAGING',
            total_penjualan: new Decimal(totalPenjualan.toFixed(2)),
            pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
            grand_total: new Decimal(grandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(jumlahBayarFinal.toFixed(2)),
            sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
            status,
            status_cetak: true,
            metode_pembayaran: metode,
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

        // Buat PembayaranPiutang jika ada pembayaran
        if (jumlahBayarFinal > 0) {
          await tx.pembayaranPiutang.create({
            data: {
              customer_id: BigInt(customer_id),
              penjualan_id: penjualan.id,
              tanggal: new Date(tanggal),
              jumlah_bayar: new Decimal(jumlahBayarFinal.toFixed(2)),
              metode: metode === 'BELUM_BAYAR' ? 'CASH' : metode,
              keterangan: `Pembayaran ${nomorNota}`,
            },
          });
        }

        penjualanId = penjualan.id;
        finalStatus = status;
      }

      return { header, penjualanId, nomorNota, status: finalStatus };
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
        penjualan_id: result.penjualanId.toString(),
        nomor_nota: result.nomorNota,
        status: result.status,
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
    const { id, tanggal, nama_customer, customer_id, pengeluaran, keterangan, details, total_penjualan_custom } = body;

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

    // Add harga bis if provided
    if (total_penjualan_custom && parseFloat(total_penjualan_custom) > 0) {
      totalPenjualan += parseFloat(total_penjualan_custom);
    }

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
        // Recalculate penjualan totals from all linked BK records
        await recalcPenjualanTotals(tx, linkedPenjualan.id);
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
        // Check if this BK is the ONLY reference in the penjualan
        const ket = linkedPenjualan.keterangan || '';
        const allRefs = [...ket.matchAll(/BK (Daging|Ayam) #(\d+)/g)];

        if (allRefs.length <= 1) {
          // Only this BK → delete PembayaranPiutang first, then entire penjualan
          await tx.pembayaranPiutang.deleteMany({ where: { penjualan_id: linkedPenjualan.id } });
          await tx.penjualan.delete({ where: { id: linkedPenjualan.id } });
        } else {
          // Multiple BK references → remove this BK ref from keterangan, then recalc
          const keteranganParts = (ket).split('; ')
            .filter(p => !p.includes(`BK Daging #${id}`) && !p.includes(`Barang Keluar Daging #${id}`));
          await tx.penjualan.update({
            where: { id: linkedPenjualan.id },
            data: { keterangan: keteranganParts.join('; ') || null },
          });
          await recalcPenjualanTotals(tx, linkedPenjualan.id);
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
