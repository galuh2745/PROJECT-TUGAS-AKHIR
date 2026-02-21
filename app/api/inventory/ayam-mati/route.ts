import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { StatusClaim } from '@prisma/client';

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

// Helper untuk menentukan status claim berdasarkan jumlah ekor
function getStatusClaim(jumlah_ekor: number): StatusClaim {
  return jumlah_ekor >= 10 ? 'BISA_CLAIM' : 'TIDAK_BISA';
}

// GET: Ambil semua ayam mati
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
    const status_claim = searchParams.get('status_claim');

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

    if (status_claim && (status_claim === 'BISA_CLAIM' || status_claim === 'TIDAK_BISA')) {
      whereClause.status_claim = status_claim;
    }

    const ayamMati = await prisma.ayamMati.findMany({
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

    const formattedData = ayamMati.map(am => ({
      id: am.id.toString(),
      perusahaan_id: am.perusahaan_id.toString(),
      perusahaan: {
        id: am.perusahaan.id.toString(),
        nama_perusahaan: am.perusahaan.nama_perusahaan,
      },
      tanggal: am.tanggal.toISOString().split('T')[0],
      jumlah_ekor: am.jumlah_ekor,
      keterangan: am.keterangan,
      status_claim: am.status_claim,
      created_at: am.created_at.toISOString(),
      updated_at: am.updated_at.toISOString(),
    }));

    return NextResponse.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching ayam mati:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Tambah ayam mati baru
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
      jumlah_ekor,
      keterangan,
    } = body;

    // Validasi input wajib
    if (!perusahaan_id) {
      return NextResponse.json({ success: false, error: 'Perusahaan wajib dipilih' }, { status: 400 });
    }
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!jumlah_ekor || jumlah_ekor <= 0) {
      return NextResponse.json({ success: false, error: 'Jumlah ekor harus lebih dari 0' }, { status: 400 });
    }

    // Validasi perusahaan exists
    const perusahaan = await prisma.perusahaan.findUnique({
      where: { id: BigInt(perusahaan_id) }
    });

    if (!perusahaan) {
      return NextResponse.json({ success: false, error: 'Perusahaan tidak ditemukan' }, { status: 404 });
    }

    // Tentukan status claim otomatis
    const status_claim = getStatusClaim(parseInt(jumlah_ekor));

    const ayamMati = await prisma.ayamMati.create({
      data: {
        perusahaan_id: BigInt(perusahaan_id),
        tanggal: new Date(tanggal),
        jumlah_ekor: parseInt(jumlah_ekor),
        keterangan: keterangan?.trim() || null,
        status_claim: status_claim,
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
      message: 'Ayam mati berhasil dicatat',
      data: {
        id: ayamMati.id.toString(),
        perusahaan_id: ayamMati.perusahaan_id.toString(),
        perusahaan_nama: ayamMati.perusahaan.nama_perusahaan,
        tanggal: ayamMati.tanggal.toISOString().split('T')[0],
        jumlah_ekor: ayamMati.jumlah_ekor,
        status_claim: ayamMati.status_claim,
        keterangan: ayamMati.keterangan,
        created_at: ayamMati.created_at.toISOString(),
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating ayam mati:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Update ayam mati
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
      jumlah_ekor,
      keterangan,
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID ayam mati wajib diisi' }, { status: 400 });
    }

    // Cek exists
    const existing = await prisma.ayamMati.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Data ayam mati tidak ditemukan' }, { status: 404 });
    }

    // Validasi input wajib
    if (!perusahaan_id) {
      return NextResponse.json({ success: false, error: 'Perusahaan wajib dipilih' }, { status: 400 });
    }
    if (!tanggal) {
      return NextResponse.json({ success: false, error: 'Tanggal wajib diisi' }, { status: 400 });
    }
    if (!jumlah_ekor || jumlah_ekor <= 0) {
      return NextResponse.json({ success: false, error: 'Jumlah ekor harus lebih dari 0' }, { status: 400 });
    }

    // Tentukan status claim otomatis
    const status_claim = getStatusClaim(parseInt(jumlah_ekor));

    const updated = await prisma.ayamMati.update({
      where: { id: BigInt(id) },
      data: {
        perusahaan_id: BigInt(perusahaan_id),
        tanggal: new Date(tanggal),
        jumlah_ekor: parseInt(jumlah_ekor),
        keterangan: keterangan?.trim() || null,
        status_claim: status_claim,
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Data ayam mati berhasil diupdate',
      data: {
        id: updated.id.toString(),
        status_claim: updated.status_claim,
        updated_at: updated.updated_at.toISOString(),
      }
    });
  } catch (error) {
    console.error('Error updating ayam mati:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Hapus ayam mati
export async function DELETE(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID ayam mati wajib diisi' }, { status: 400 });
    }

    const existing = await prisma.ayamMati.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Data ayam mati tidak ditemukan' }, { status: 404 });
    }

    await prisma.ayamMati.delete({
      where: { id: BigInt(id) }
    });

    return NextResponse.json({
      success: true,
      message: 'Data ayam mati berhasil dihapus'
    });
  } catch (error) {
    console.error('Error deleting ayam mati:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
