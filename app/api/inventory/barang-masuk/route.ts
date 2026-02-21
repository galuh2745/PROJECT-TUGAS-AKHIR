import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { Decimal } from '@prisma/client/runtime/library';

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

// GET: Ambil semua barang masuk
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
      whereClause.tanggal_masuk = {};
      if (tanggal_dari) {
        whereClause.tanggal_masuk.gte = new Date(`${tanggal_dari}T00:00:00.000Z`);
      }
      if (tanggal_sampai) {
        whereClause.tanggal_masuk.lte = new Date(`${tanggal_sampai}T23:59:59.999Z`);
      }
    }

    if (search) {
      whereClause.OR = [
        { nama_kandang: { contains: search } },
        { nama_supir: { contains: search } },
        { no_mobil: { contains: search } }
      ];
    }

    const barangMasuk = await prisma.barangMasuk.findMany({
      where: whereClause,
      include: {
        perusahaan: {
          select: {
            id: true,
            nama_perusahaan: true,
          }
        }
      },
      orderBy: { tanggal_masuk: 'desc' }
    });

    const formattedData = barangMasuk.map(bm => ({
      id: bm.id.toString(),
      perusahaan_id: bm.perusahaan_id.toString(),
      perusahaan: {
        id: bm.perusahaan.id.toString(),
        nama_perusahaan: bm.perusahaan.nama_perusahaan,
      },
      tanggal_masuk: bm.tanggal_masuk.toISOString().split('T')[0],
      jumlah_ekor: bm.jumlah_ekor,
      total_kg: parseFloat(bm.total_kg.toString()),
      bw: parseFloat(bm.bw.toString()),
      harga_per_kg: parseFloat(bm.harga_per_kg.toString()),
      total_harga: parseFloat(bm.total_harga.toString()),
      tanggal_pembayaran: bm.tanggal_pembayaran?.toISOString().split('T')[0] || null,
      jumlah_transfer: parseFloat(bm.jumlah_transfer.toString()),
      saldo_kita: parseFloat(bm.saldo_kita.toString()),
      nama_kandang: bm.nama_kandang,
      alamat_kandang: bm.alamat_kandang,
      no_mobil: bm.no_mobil,
      nama_supir: bm.nama_supir,
      created_at: bm.created_at.toISOString(),
      updated_at: bm.updated_at.toISOString(),
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching barang masuk:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Tambah barang masuk baru
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const body = await req.json();
    const {
      perusahaan_id,
      tanggal_masuk,
      jumlah_ekor,
      total_kg,
      harga_per_kg,
      tanggal_pembayaran,
      jumlah_transfer,
      nama_kandang,
      alamat_kandang,
      no_mobil,
      nama_supir,
    } = body;

    // Validasi input wajib
    if (!perusahaan_id) {
      return NextResponse.json({ success: false, error: 'Perusahaan wajib dipilih' }, { status: 400 });
    }
    if (!tanggal_masuk) {
      return NextResponse.json({ success: false, error: 'Tanggal masuk wajib diisi' }, { status: 400 });
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
    if (!nama_kandang || nama_kandang.trim() === '') {
      return NextResponse.json({ success: false, error: 'Nama kandang wajib diisi' }, { status: 400 });
    }

    // Validasi perusahaan exists
    const perusahaan = await prisma.perusahaan.findUnique({
      where: { id: BigInt(perusahaan_id) }
    });

    if (!perusahaan) {
      return NextResponse.json({ success: false, error: 'Perusahaan tidak ditemukan' }, { status: 404 });
    }

    // Hitung nilai otomatis
    const bw = total_kg / jumlah_ekor; // Berat rata-rata
    const total_harga = harga_per_kg * total_kg;
    const saldo_kita = total_harga - (jumlah_transfer || 0);

    const barangMasuk = await prisma.barangMasuk.create({
      data: {
        perusahaan_id: BigInt(perusahaan_id),
        tanggal_masuk: new Date(tanggal_masuk),
        jumlah_ekor: parseInt(jumlah_ekor),
        total_kg: new Decimal(total_kg),
        bw: new Decimal(bw.toFixed(3)),
        harga_per_kg: new Decimal(harga_per_kg),
        total_harga: new Decimal(total_harga.toFixed(2)),
        tanggal_pembayaran: tanggal_pembayaran ? new Date(tanggal_pembayaran) : null,
        jumlah_transfer: new Decimal(jumlah_transfer || 0),
        saldo_kita: new Decimal(saldo_kita.toFixed(2)),
        nama_kandang: nama_kandang.trim(),
        alamat_kandang: alamat_kandang?.trim() || null,
        no_mobil: no_mobil?.trim() || null,
        nama_supir: nama_supir?.trim() || null,
      },
      include: {
        perusahaan: {
          select: {
            nama_perusahaan: true,
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Barang masuk berhasil ditambahkan',
      data: {
        id: barangMasuk.id.toString(),
        perusahaan_id: barangMasuk.perusahaan_id.toString(),
        perusahaan_nama: barangMasuk.perusahaan.nama_perusahaan,
        tanggal_masuk: barangMasuk.tanggal_masuk.toISOString().split('T')[0],
        jumlah_ekor: barangMasuk.jumlah_ekor,
        total_kg: parseFloat(barangMasuk.total_kg.toString()),
        bw: parseFloat(barangMasuk.bw.toString()),
        total_harga: parseFloat(barangMasuk.total_harga.toString()),
        saldo_kita: parseFloat(barangMasuk.saldo_kita.toString()),
        created_at: barangMasuk.created_at.toISOString(),
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating barang masuk:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Update barang masuk
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
      tanggal_masuk,
      jumlah_ekor,
      total_kg,
      harga_per_kg,
      tanggal_pembayaran,
      jumlah_transfer,
      nama_kandang,
      alamat_kandang,
      no_mobil,
      nama_supir,
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID barang masuk wajib diisi' }, { status: 400 });
    }

    // Cek exists
    const existing = await prisma.barangMasuk.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Barang masuk tidak ditemukan' }, { status: 404 });
    }

    // Validasi input wajib
    if (!perusahaan_id) {
      return NextResponse.json({ success: false, error: 'Perusahaan wajib dipilih' }, { status: 400 });
    }
    if (!tanggal_masuk) {
      return NextResponse.json({ success: false, error: 'Tanggal masuk wajib diisi' }, { status: 400 });
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
    if (!nama_kandang || nama_kandang.trim() === '') {
      return NextResponse.json({ success: false, error: 'Nama kandang wajib diisi' }, { status: 400 });
    }

    // Hitung nilai otomatis
    const bw = total_kg / jumlah_ekor;
    const total_harga = harga_per_kg * total_kg;
    const saldo_kita = total_harga - (jumlah_transfer || 0);

    const updated = await prisma.barangMasuk.update({
      where: { id: BigInt(id) },
      data: {
        perusahaan_id: BigInt(perusahaan_id),
        tanggal_masuk: new Date(tanggal_masuk),
        jumlah_ekor: parseInt(jumlah_ekor),
        total_kg: new Decimal(total_kg),
        bw: new Decimal(bw.toFixed(3)),
        harga_per_kg: new Decimal(harga_per_kg),
        total_harga: new Decimal(total_harga.toFixed(2)),
        tanggal_pembayaran: tanggal_pembayaran ? new Date(tanggal_pembayaran) : null,
        jumlah_transfer: new Decimal(jumlah_transfer || 0),
        saldo_kita: new Decimal(saldo_kita.toFixed(2)),
        nama_kandang: nama_kandang.trim(),
        alamat_kandang: alamat_kandang?.trim() || null,
        no_mobil: no_mobil?.trim() || null,
        nama_supir: nama_supir?.trim() || null,
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Barang masuk berhasil diupdate',
      data: {
        id: updated.id.toString(),
        updated_at: updated.updated_at.toISOString(),
      }
    });
  } catch (error) {
    console.error('Error updating barang masuk:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Hapus barang masuk
export async function DELETE(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID barang masuk wajib diisi' }, { status: 400 });
    }

    const existing = await prisma.barangMasuk.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Barang masuk tidak ditemukan' }, { status: 404 });
    }

    await prisma.barangMasuk.delete({
      where: { id: BigInt(id) }
    });

    return NextResponse.json({
      success: true,
      message: 'Barang masuk berhasil dihapus'
    });
  } catch (error) {
    console.error('Error deleting barang masuk:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
