import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

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

// Helper function untuk cek stok tersedia
async function getStokPerusahaan(perusahaan_id: bigint): Promise<number> {
  const [barangMasukSum, ayamMatiSum, barangKeluarSum] = await Promise.all([
    prisma.barangMasuk.aggregate({
      where: { perusahaan_id },
      _sum: { jumlah_ekor: true }
    }),
    prisma.ayamMati.aggregate({
      where: { perusahaan_id },
      _sum: { jumlah_ekor: true }
    }),
    prisma.barangKeluarAyamHidup.aggregate({
      where: { perusahaan_id },
      _sum: { jumlah_ekor: true }
    })
  ]);

  const totalMasuk = barangMasukSum._sum.jumlah_ekor || 0;
  const totalMati = ayamMatiSum._sum.jumlah_ekor || 0;
  const totalKeluar = barangKeluarSum._sum.jumlah_ekor || 0;

  return totalMasuk - totalMati - totalKeluar;
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

// GET: Ambil semua barang keluar ayam hidup
export async function GET(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const perusahaan_id = searchParams.get('perusahaan_id');
    const tanggal_dari = searchParams.get('tanggal_dari');
    const tanggal_sampai = searchParams.get('tanggal_sampai');
    const search = searchParams.get('search');

    const whereClause: any = {};
    
    if (perusahaan_id) {
      whereClause.perusahaan_id = BigInt(perusahaan_id);
    }

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

    const barangKeluar = await prisma.barangKeluarAyamHidup.findMany({
      where: whereClause,
      include: {
        perusahaan: {
          select: {
            id: true,
            nama_perusahaan: true,
          }
        }
      },
      orderBy: { tanggal: 'desc' }
    });

    const formattedData = await Promise.all(barangKeluar.map(async (bk) => {
      // Find linked penjualan for piutang info
      const linkedPenjualan = await prisma.penjualan.findFirst({
        where: {
          OR: [
            { keterangan: { contains: `Barang Keluar Ayam Hidup #${bk.id}` } },
            { keterangan: { contains: `BK Ayam #${bk.id}` } },
          ],
          jenis_transaksi: { in: ['AYAM_HIDUP', 'CAMPURAN'] },
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
        perusahaan_id: bk.perusahaan_id.toString(),
        perusahaan: {
          id: bk.perusahaan.id.toString(),
          nama_perusahaan: bk.perusahaan.nama_perusahaan,
        },
        tanggal: bk.tanggal.toISOString().split('T')[0],
        nama_customer: bk.nama_customer,
        jumlah_ekor: bk.jumlah_ekor,
        total_kg: parseFloat(bk.total_kg.toString()),
        jenis_daging: bk.jenis_daging,
        harga_per_kg: parseFloat(bk.harga_per_kg.toString()),
        is_bubut: bk.is_bubut,
        harga_bubut: parseFloat(bk.harga_bubut.toString()),
        total_penjualan: parseFloat(bk.total_penjualan.toString()),
        pengeluaran: parseFloat(bk.pengeluaran.toString()),
        keterangan: bk.keterangan || null,
        total_bersih: parseFloat(bk.total_bersih.toString()),
        // Piutang info from linked penjualan
        nomor_nota: linkedPenjualan?.nomor_nota || null,
        jumlah_bayar: linkedPenjualan ? parseFloat(linkedPenjualan.jumlah_bayar.toString()) : 0,
        sisa_piutang: linkedPenjualan ? parseFloat(linkedPenjualan.sisa_piutang.toString()) : parseFloat(bk.total_penjualan.toString()),
        status_piutang: linkedPenjualan?.status || 'hutang',
        created_at: bk.created_at.toISOString(),
        updated_at: bk.updated_at.toISOString(),
      };
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching barang keluar ayam hidup:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Tambah barang keluar ayam hidup + auto penjualan
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const {
      perusahaan_id,
      tanggal,
      nama_customer,
      customer_id,
      jumlah_ekor,
      total_kg,
      jenis_daging,
      harga_per_kg,
      pengeluaran,
      is_bubut,
      harga_bubut,
      keterangan,
      jumlah_bayar,
      metode_pembayaran,
      total_penjualan_custom,
    } = body;

    const bayarVal = parseFloat(jumlah_bayar) || 0;
    const metodeVal = metode_pembayaran || null;

    // Validasi input wajib
    if (!perusahaan_id) {
      return NextResponse.json({ success: false, error: 'Perusahaan wajib dipilih' }, { status: 400 });
    }
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!customer_id) {
      return NextResponse.json({ success: false, error: 'Customer wajib dipilih' }, { status: 400 });
    }
    if (!jumlah_ekor || jumlah_ekor <= 0) {
      return NextResponse.json({ success: false, error: 'Jumlah ekor harus lebih dari 0' }, { status: 400 });
    }
    if (!total_kg || total_kg <= 0) {
      return NextResponse.json({ success: false, error: 'Total kg harus lebih dari 0' }, { status: 400 });
    }
    if (!harga_per_kg || harga_per_kg <= 0) {
      return NextResponse.json({ success: false, error: 'Harga per kg harus lebih dari 0' }, { status: 400 });
    }
    if (!jenis_daging || !['JUMBO', 'BESAR', 'KECIL'].includes(jenis_daging)) {
      return NextResponse.json({ success: false, error: 'Jenis daging wajib dipilih (JUMBO/BESAR/KECIL)' }, { status: 400 });
    }

    // Validasi perusahaan exists
    const perusahaan = await prisma.perusahaan.findUnique({
      where: { id: BigInt(perusahaan_id) }
    });

    if (!perusahaan) {
      return NextResponse.json({ success: false, error: 'Perusahaan tidak ditemukan' }, { status: 404 });
    }

    // Validasi customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: BigInt(customer_id) }
    });

    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    // Validasi stok tersedia (tidak boleh minus)
    const stokTersedia = await getStokPerusahaan(BigInt(perusahaan_id));
    if (jumlah_ekor > stokTersedia) {
      return NextResponse.json({ 
        success: false, 
        error: `Stok tidak mencukupi. Stok tersedia: ${stokTersedia} ekor, diminta: ${jumlah_ekor} ekor` 
      }, { status: 400 });
    }

    // Hitung nilai otomatis
    const biayaBubutPost = is_bubut ? (parseFloat(harga_bubut) || 0) * parseInt(jumlah_ekor) : 0;
    const baseTotal = (harga_per_kg * total_kg) + biayaBubutPost;
    const biayaBis = (total_penjualan_custom && parseFloat(total_penjualan_custom) > 0)
      ? parseFloat(total_penjualan_custom)
      : 0;
    const total_penjualan = baseTotal + biayaBis;
    const pengeluaranVal = pengeluaran || 0;
    const total_bersih = total_penjualan - pengeluaranVal;

    // Gunakan nama customer dari database
    const namaCustomer = nama_customer?.trim() || customer.nama;

    // Transaction: create barang keluar + auto-finalized penjualan
    const result = await prisma.$transaction(async (tx) => {
      const barangKeluar = await tx.barangKeluarAyamHidup.create({
        data: {
          perusahaan_id: BigInt(perusahaan_id),
          tanggal: new Date(tanggal),
          nama_customer: namaCustomer,
          jumlah_ekor: parseInt(jumlah_ekor),
          total_kg: new Decimal(total_kg),
          jenis_daging: jenis_daging,
          harga_per_kg: new Decimal(harga_per_kg),
          is_bubut: is_bubut || false,
          harga_bubut: new Decimal(is_bubut ? (parseFloat(harga_bubut) || 0) : 0),
          total_penjualan: new Decimal(total_penjualan.toFixed(2)),
          pengeluaran: new Decimal(pengeluaranVal),
          keterangan: keterangan || null,
          total_bersih: new Decimal(total_bersih.toFixed(2)),
        },
        include: {
          perusahaan: {
            select: {
              nama_perusahaan: true,
            }
          }
        }
      });

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
        // Add new detail item
        await tx.penjualanDetail.create({
          data: {
            penjualan_id: existingPenjualan.id,
            tipe: 'ayam_hidup',
            jenis_daging: `Ayam Hidup ${jenis_daging}`,
            ekor: parseInt(jumlah_ekor),
            berat: new Decimal(total_kg),
            harga: new Decimal(harga_per_kg),
            subtotal: new Decimal(total_penjualan.toFixed(2)),
          },
        });

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
        const newJenis = existingJenis === 'AYAM_HIDUP' ? 'AYAM_HIDUP' : 'CAMPURAN';

        // Append BK reference to keterangan
        const existingKet = existingPenjualan.keterangan || '';
        const newKet = existingKet ? `${existingKet}; BK Ayam #${barangKeluar.id}` : `BK Ayam #${barangKeluar.id}`;

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
              keterangan: `Pembayaran ${existingPenjualan.nomor_nota} (BK Ayam #${barangKeluar.id})`,
            },
          });
        }

        penjualanId = existingPenjualan.id;
        nomorNota = existingPenjualan.nomor_nota || '';
        finalStatus = status;
      } else {
        // ── CREATE new penjualan ──
        nomorNota = await generateNomorNota(new Date(tanggal), tx);

        const grandTotal = total_penjualan - pengeluaranVal;
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
            jenis_transaksi: 'AYAM_HIDUP',
            total_penjualan: new Decimal(total_penjualan.toFixed(2)),
            pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
            grand_total: new Decimal(grandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(jumlahBayarFinal.toFixed(2)),
            sisa_piutang: new Decimal(sisaPiutang.toFixed(2)),
            status,
            status_cetak: true,
            metode_pembayaran: metode,
            keterangan: `BK Ayam #${barangKeluar.id}`,
            detail: {
              create: [{
                tipe: 'ayam_hidup',
                jenis_daging: `Ayam Hidup ${jenis_daging}`,
                ekor: parseInt(jumlah_ekor),
                berat: new Decimal(total_kg),
                harga: new Decimal(harga_per_kg),
                subtotal: new Decimal(total_penjualan.toFixed(2)),
              }],
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

      return { barangKeluar, penjualanId, nomorNota, status: finalStatus };
    });

    return NextResponse.json({
      success: true,
      message: 'Barang keluar ayam hidup berhasil ditambahkan',
      data: {
        id: result.barangKeluar.id.toString(),
        perusahaan_id: result.barangKeluar.perusahaan_id.toString(),
        perusahaan_nama: result.barangKeluar.perusahaan.nama_perusahaan,
        tanggal: result.barangKeluar.tanggal.toISOString().split('T')[0],
        nama_customer: result.barangKeluar.nama_customer,
        jumlah_ekor: result.barangKeluar.jumlah_ekor,
        total_penjualan: parseFloat(result.barangKeluar.total_penjualan.toString()),
        penjualan_id: result.penjualanId.toString(),
        nomor_nota: result.nomorNota,
        status: result.status,
        created_at: result.barangKeluar.created_at.toISOString(),
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating barang keluar ayam hidup:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Update barang keluar ayam hidup
export async function PUT(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const {
      id,
      perusahaan_id,
      tanggal,
      nama_customer,
      customer_id,
      jumlah_ekor,
      total_kg,
      jenis_daging,
      harga_per_kg,
      pengeluaran,
      is_bubut,
      harga_bubut,
      keterangan,
      total_penjualan_custom,
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID barang keluar wajib diisi' }, { status: 400 });
    }

    // Cek exists
    const existing = await prisma.barangKeluarAyamHidup.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Barang keluar tidak ditemukan' }, { status: 404 });
    }

    // Validasi input wajib
    if (!perusahaan_id) {
      return NextResponse.json({ success: false, error: 'Perusahaan wajib dipilih' }, { status: 400 });
    }
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!customer_id) {
      return NextResponse.json({ success: false, error: 'Customer wajib dipilih' }, { status: 400 });
    }
    if (!jumlah_ekor || jumlah_ekor <= 0) {
      return NextResponse.json({ success: false, error: 'Jumlah ekor harus lebih dari 0' }, { status: 400 });
    }
    if (!total_kg || total_kg <= 0) {
      return NextResponse.json({ success: false, error: 'Total kg harus lebih dari 0' }, { status: 400 });
    }
    if (!harga_per_kg || harga_per_kg <= 0) {
      return NextResponse.json({ success: false, error: 'Harga per kg harus lebih dari 0' }, { status: 400 });
    }
    if (!jenis_daging || !['JUMBO', 'BESAR', 'KECIL'].includes(jenis_daging)) {
      return NextResponse.json({ success: false, error: 'Jenis daging wajib dipilih (JUMBO/BESAR/KECIL)' }, { status: 400 });
    }

    // Validasi customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: BigInt(customer_id) }
    });

    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    // Validasi stok (tambahkan kembali yang lama, kurangi yang baru)
    const stokTersedia = await getStokPerusahaan(BigInt(perusahaan_id));
    const stokSetelahRestore = stokTersedia + existing.jumlah_ekor;
    
    if (jumlah_ekor > stokSetelahRestore) {
      return NextResponse.json({ 
        success: false, 
        error: `Stok tidak mencukupi. Stok tersedia: ${stokSetelahRestore} ekor, diminta: ${jumlah_ekor} ekor` 
      }, { status: 400 });
    }

    // Hitung nilai otomatis
    const biayaBubut = is_bubut ? (parseFloat(harga_bubut) || 0) * parseInt(jumlah_ekor) : 0;
    const baseTotalPut = (harga_per_kg * total_kg) + biayaBubut;
    const biayaBisPut = (total_penjualan_custom && parseFloat(total_penjualan_custom) > 0)
      ? parseFloat(total_penjualan_custom)
      : 0;
    const total_penjualan = baseTotalPut + biayaBisPut;
    const pengeluaranVal = pengeluaran || 0;
    const total_bersih = total_penjualan - pengeluaranVal;
    const namaCustomer = nama_customer?.trim() || customer.nama;

    // Transaction: update barang keluar + find and update linked penjualan detail
    const updated = await prisma.$transaction(async (tx) => {
      const bk = await tx.barangKeluarAyamHidup.update({
        where: { id: BigInt(id) },
        data: {
          perusahaan_id: BigInt(perusahaan_id),
          tanggal: new Date(tanggal),
          nama_customer: namaCustomer,
          jumlah_ekor: parseInt(jumlah_ekor),
          total_kg: new Decimal(total_kg),
          jenis_daging: jenis_daging,
          harga_per_kg: new Decimal(harga_per_kg),
          is_bubut: is_bubut || false,
          harga_bubut: new Decimal(is_bubut ? (parseFloat(harga_bubut) || 0) : 0),
          total_penjualan: new Decimal(total_penjualan.toFixed(2)),
          pengeluaran: new Decimal(pengeluaranVal),
          keterangan: keterangan || null,
          total_bersih: new Decimal(total_bersih.toFixed(2)),
        }
      });

      // Find linked penjualan via keterangan
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          OR: [
            { keterangan: { contains: `Barang Keluar Ayam Hidup #${id}` } },
            { keterangan: { contains: `BK Ayam #${id}` } },
          ],
        },
        include: { detail: true },
      });

      if (linkedPenjualan) {
        // Recalculate penjualan totals from all linked BK records
        await recalcPenjualanTotals(tx, linkedPenjualan.id);
      }

      return bk;
    });

    return NextResponse.json({
      success: true,
      message: 'Barang keluar ayam hidup berhasil diupdate',
      data: {
        id: updated.id.toString(),
        total_bersih: parseFloat(updated.total_bersih.toString()),
        updated_at: updated.updated_at.toISOString(),
      }
    });
  } catch (error) {
    console.error('Error updating barang keluar ayam hidup:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Hapus barang keluar ayam hidup
export async function DELETE(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID barang keluar wajib diisi' }, { status: 400 });
    }

    const existing = await prisma.barangKeluarAyamHidup.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Barang keluar tidak ditemukan' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Find linked penjualan record (old or new system)
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          OR: [
            { keterangan: { contains: `Barang Keluar Ayam Hidup #${id}` } },
            { keterangan: { contains: `BK Ayam #${id}` } },
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
            .filter(p => !p.includes(`BK Ayam #${id}`) && !p.includes(`Barang Keluar Ayam Hidup #${id}`));
          await tx.penjualan.update({
            where: { id: linkedPenjualan.id },
            data: { keterangan: keteranganParts.join('; ') || null },
          });
          await recalcPenjualanTotals(tx, linkedPenjualan.id);
        }
      }

      await tx.barangKeluarAyamHidup.delete({
        where: { id: BigInt(id) }
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Barang keluar ayam hidup berhasil dihapus'
    });
  } catch (error) {
    console.error('Error deleting barang keluar ayam hidup:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
