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
          keterangan: { contains: `Barang Keluar Ayam Hidup #${bk.id}` },
          jenis_transaksi: 'AYAM_HIDUP',
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
        total_bersih: parseFloat(bk.total_bersih.toString()),
        // Piutang info from linked penjualan
        nomor_nota: linkedPenjualan?.nomor_nota || null,
        jumlah_bayar: linkedPenjualan ? parseFloat(linkedPenjualan.jumlah_bayar.toString()) : parseFloat(bk.total_penjualan.toString()),
        sisa_piutang: linkedPenjualan ? parseFloat(linkedPenjualan.sisa_piutang.toString()) : 0,
        status_piutang: linkedPenjualan?.status || 'lunas',
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

// POST: Tambah barang keluar ayam hidup + auto penjualan (piutang)
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
      jumlah_bayar,
      metode_pembayaran,
      is_bubut,
      harga_bubut,
    } = body;

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
    const total_penjualan = (harga_per_kg * total_kg) + biayaBubutPost;
    const pengeluaranVal = pengeluaran || 0;
    const total_bersih = total_penjualan - pengeluaranVal;
    const grandTotal = total_penjualan - pengeluaranVal;
    const bayar = jumlah_bayar !== undefined && jumlah_bayar !== null ? parseFloat(jumlah_bayar) : 0;
    const sisa_piutang = Math.max(0, grandTotal - bayar);
    const statusVal = computeStatus(grandTotal, bayar);
    const metodePembayaran = metode_pembayaran || 'CASH';

    // Gunakan nama customer dari database
    const namaCustomer = nama_customer?.trim() || customer.nama;

    // Validasi jumlah bayar
    if (bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh negatif' }, { status: 400 });
    }
    if (bayar > grandTotal) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi grand total' }, { status: 400 });
    }

    // Transaction: create barang keluar + penjualan record
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

      // Generate nomor nota
      const nomorNota = await generateNomorNota(new Date(tanggal), tx);

      // Create Penjualan record with full piutang fields
      const penjualan = await tx.penjualan.create({
        data: {
          nomor_nota: nomorNota,
          customer_id: BigInt(customer_id),
          tanggal: new Date(tanggal),
          jenis_transaksi: 'AYAM_HIDUP',
          total_penjualan: new Decimal(total_penjualan.toFixed(2)),
          pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
          grand_total: new Decimal(grandTotal.toFixed(2)),
          jumlah_bayar: new Decimal(bayar.toFixed(2)),
          sisa_piutang: new Decimal(sisa_piutang.toFixed(2)),
          status: statusVal,
          metode_pembayaran: metodePembayaran,
          keterangan: `Barang Keluar Ayam Hidup #${barangKeluar.id} - ${namaCustomer}`,
          detail: {
            create: [{
              jenis_daging: jenis_daging,
              ekor: parseInt(jumlah_ekor),
              berat: new Decimal(total_kg),
              harga: new Decimal(harga_per_kg),
              subtotal: new Decimal(total_penjualan.toFixed(2)),
            }],
          },
        },
      });

      return { barangKeluar, penjualan };
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
        pengeluaran: pengeluaranVal,
        grand_total: grandTotal,
        jumlah_bayar: bayar,
        sisa_piutang: sisa_piutang,
        status: statusVal,
        nomor_nota: result.penjualan.nomor_nota,
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
      jumlah_bayar,
      metode_pembayaran,
      is_bubut,
      harga_bubut,
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
    const total_penjualan = (harga_per_kg * total_kg) + biayaBubut;
    const pengeluaranVal = pengeluaran || 0;
    const total_bersih = total_penjualan - pengeluaranVal;
    const grandTotal = total_penjualan - pengeluaranVal;
    const bayar = jumlah_bayar !== undefined && jumlah_bayar !== null ? parseFloat(jumlah_bayar) : 0;
    const sisa_piutang = Math.max(0, grandTotal - bayar);
    const statusVal = computeStatus(grandTotal, bayar);
    const metodePembayaran = metode_pembayaran || 'CASH';
    const namaCustomer = nama_customer?.trim() || customer.nama;

    // Validasi jumlah bayar
    if (bayar < 0) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh negatif' }, { status: 400 });
    }
    if (bayar > grandTotal) {
      return NextResponse.json({ success: false, error: 'Jumlah bayar tidak boleh melebihi grand total' }, { status: 400 });
    }

    // Transaction: update barang keluar + find and update/create penjualan
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
          total_bersih: new Decimal(total_bersih.toFixed(2)),
        }
      });
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          keterangan: { contains: `Barang Keluar Ayam Hidup #${id}` },
          jenis_transaksi: 'AYAM_HIDUP',
        }
      });

      if (linkedPenjualan) {
        // Delete existing detail, recreate
        await tx.penjualanDetail.deleteMany({
          where: { penjualan_id: linkedPenjualan.id },
        });

        await tx.penjualan.update({
          where: { id: linkedPenjualan.id },
          data: {
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            total_penjualan: new Decimal(total_penjualan.toFixed(2)),
            pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
            grand_total: new Decimal(grandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(bayar.toFixed(2)),
            sisa_piutang: new Decimal(sisa_piutang.toFixed(2)),
            status: statusVal,
            metode_pembayaran: metodePembayaran,
            keterangan: `Barang Keluar Ayam Hidup #${id} - ${namaCustomer}`,
            detail: {
              create: [{
                jenis_daging: jenis_daging,
                ekor: parseInt(jumlah_ekor),
                berat: new Decimal(total_kg),
                harga: new Decimal(harga_per_kg),
                subtotal: new Decimal(total_penjualan.toFixed(2)),
              }],
            },
          },
        });
      } else {
        // Create if not found (backward compat for old records)
        const nomorNota = await generateNomorNota(new Date(tanggal), tx);
        await tx.penjualan.create({
          data: {
            nomor_nota: nomorNota,
            customer_id: BigInt(customer_id),
            tanggal: new Date(tanggal),
            jenis_transaksi: 'AYAM_HIDUP',
            total_penjualan: new Decimal(total_penjualan.toFixed(2)),
            pengeluaran: new Decimal(pengeluaranVal.toFixed(2)),
            grand_total: new Decimal(grandTotal.toFixed(2)),
            jumlah_bayar: new Decimal(bayar.toFixed(2)),
            sisa_piutang: new Decimal(sisa_piutang.toFixed(2)),
            status: statusVal,
            metode_pembayaran: metodePembayaran,
            keterangan: `Barang Keluar Ayam Hidup #${id} - ${namaCustomer}`,
            detail: {
              create: [{
                jenis_daging: jenis_daging,
                ekor: parseInt(jumlah_ekor),
                berat: new Decimal(total_kg),
                harga: new Decimal(harga_per_kg),
                subtotal: new Decimal(total_penjualan.toFixed(2)),
              }],
            },
          },
        });
      }

      return bk;
    });

    return NextResponse.json({
      success: true,
      message: 'Barang keluar ayam hidup berhasil diupdate',
      data: {
        id: updated.id.toString(),
        grand_total: grandTotal,
        jumlah_bayar: bayar,
        sisa_piutang: sisa_piutang,
        status: statusVal,
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
      // Delete linked penjualan record (cascade deletes detail)
      const linkedPenjualan = await tx.penjualan.findFirst({
        where: {
          keterangan: { contains: `Barang Keluar Ayam Hidup #${id}` },
          jenis_transaksi: 'AYAM_HIDUP',
        }
      });
      if (linkedPenjualan) {
        await tx.penjualan.delete({ where: { id: linkedPenjualan.id } });
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
