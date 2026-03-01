import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

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

// GET: Ambil semua jenis karyawan
export async function GET() {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const jenisKaryawan = await prisma.jenisKaryawan.findMany({
      include: {
        _count: {
          select: { karyawan: true }
        }
      },
      orderBy: { nama_jenis: 'asc' }
    });

    // Format data untuk response
    const formattedData = jenisKaryawan.map(jk => ({
      id: jk.id.toString(),
      nama_jenis: jk.nama_jenis,
      jam_masuk: jk.jam_masuk.toISOString(),
      jam_pulang: jk.jam_pulang.toISOString(),
      toleransi_terlambat: jk.toleransi_terlambat,
      is_shift_malam: jk.is_shift_malam,
      skip_jam_kerja: jk.skip_jam_kerja,
      jumlah_karyawan: jk._count.karyawan,
      created_at: jk.created_at.toISOString(),
      updated_at: jk.updated_at.toISOString(),
    }));

    return NextResponse.json({ 
      success: true, 
      data: formattedData 
    });
  } catch (error) {
    console.error('Error fetching jenis karyawan:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Tambah jenis karyawan baru
export async function POST(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { nama_jenis, jam_masuk, jam_pulang, toleransi_terlambat, is_shift_malam, skip_jam_kerja } = await req.json();

    // Validasi input - jam masuk/pulang tidak wajib jika skip_jam_kerja = true
    if (!nama_jenis) {
      return NextResponse.json({ 
        success: false, 
        error: 'Nama jenis harus diisi' 
      }, { status: 400 });
    }

    if (!skip_jam_kerja && (!jam_masuk || !jam_pulang)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Jam masuk dan jam pulang harus diisi (kecuali untuk jenis driver/helper)' 
      }, { status: 400 });
    }

    // Cek apakah nama jenis sudah ada
    const existing = await prisma.jenisKaryawan.findFirst({
      where: { nama_jenis: nama_jenis.trim() }
    });

    if (existing) {
      return NextResponse.json({ 
        success: false, 
        error: 'Jenis karyawan dengan nama tersebut sudah ada' 
      }, { status: 400 });
    }

    // Parse waktu (default 00:00 jika skip_jam_kerja)
    let jamMasukDate = new Date('2000-01-01T00:00:00');
    let jamPulangDate = new Date('2000-01-01T00:00:00');
    
    if (!skip_jam_kerja && jam_masuk && jam_pulang) {
      const [jamMasukHour, jamMasukMin] = jam_masuk.split(':').map(Number);
      const [jamPulangHour, jamPulangMin] = jam_pulang.split(':').map(Number);
      
      jamMasukDate = new Date();
      jamMasukDate.setHours(jamMasukHour, jamMasukMin, 0, 0);
      
      jamPulangDate = new Date();
      jamPulangDate.setHours(jamPulangHour, jamPulangMin, 0, 0);
    }

    const jenisKaryawan = await prisma.jenisKaryawan.create({
      data: {
        nama_jenis: nama_jenis.trim(),
        jam_masuk: jamMasukDate,
        jam_pulang: jamPulangDate,
        toleransi_terlambat: toleransi_terlambat || 15,
        is_shift_malam: is_shift_malam || false,
        skip_jam_kerja: skip_jam_kerja || false,
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Jenis karyawan berhasil ditambahkan',
      data: {
        id: jenisKaryawan.id.toString(),
        nama_jenis: jenisKaryawan.nama_jenis,
      }
    });
  } catch (error) {
    console.error('Error creating jenis karyawan:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Update jenis karyawan
export async function PUT(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { id, nama_jenis, jam_masuk, jam_pulang, toleransi_terlambat, is_shift_malam, skip_jam_kerja } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID harus diisi' }, { status: 400 });
    }

    // Cek apakah jenis karyawan ada
    const existing = await prisma.jenisKaryawan.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Jenis karyawan tidak ditemukan' }, { status: 404 });
    }

    // Cek duplikat nama (kecuali dirinya sendiri)
    if (nama_jenis) {
      const duplicate = await prisma.jenisKaryawan.findFirst({
        where: { 
          nama_jenis: nama_jenis.trim(),
          NOT: { id: BigInt(id) }
        }
      });

      if (duplicate) {
        return NextResponse.json({ 
          success: false, 
          error: 'Jenis karyawan dengan nama tersebut sudah ada' 
        }, { status: 400 });
      }
    }

    // Siapkan data update
    const updateData: any = {};
    
    if (nama_jenis) updateData.nama_jenis = nama_jenis.trim();
    if (toleransi_terlambat !== undefined) updateData.toleransi_terlambat = toleransi_terlambat;
    if (is_shift_malam !== undefined) updateData.is_shift_malam = is_shift_malam;
    if (skip_jam_kerja !== undefined) updateData.skip_jam_kerja = skip_jam_kerja;
    
    if (jam_masuk) {
      const [h, m] = jam_masuk.split(':').map(Number);
      const date = new Date();
      date.setHours(h, m, 0, 0);
      updateData.jam_masuk = date;
    }
    
    if (jam_pulang) {
      const [h, m] = jam_pulang.split(':').map(Number);
      const date = new Date();
      date.setHours(h, m, 0, 0);
      updateData.jam_pulang = date;
    }

    const updated = await prisma.jenisKaryawan.update({
      where: { id: BigInt(id) },
      data: updateData
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Jenis karyawan berhasil diperbarui',
      data: {
        id: updated.id.toString(),
        nama_jenis: updated.nama_jenis,
      }
    });
  } catch (error) {
    console.error('Error updating jenis karyawan:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Hapus jenis karyawan
export async function DELETE(req: Request) {
  try {
    const validation = await validateAdmin();
    if ('error' in validation) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID harus diisi' }, { status: 400 });
    }

    // Cek apakah jenis karyawan ada
    const existing = await prisma.jenisKaryawan.findUnique({
      where: { id: BigInt(id) },
      include: { _count: { select: { karyawan: true } } }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Jenis karyawan tidak ditemukan' }, { status: 404 });
    }

    // Cek apakah masih digunakan oleh karyawan
    if (existing._count.karyawan > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `Tidak dapat menghapus. Jenis karyawan ini masih digunakan oleh ${existing._count.karyawan} karyawan` 
      }, { status: 400 });
    }

    await prisma.jenisKaryawan.delete({
      where: { id: BigInt(id) }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Jenis karyawan berhasil dihapus' 
    });
  } catch (error) {
    console.error('Error deleting jenis karyawan:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
