import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

// POST: Karyawan mengajukan lembur
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { userId, role } = payload as { userId: number; role: string };

    if (role !== 'USER') {
      return NextResponse.json({ success: false, error: 'Forbidden - hanya karyawan yang bisa mengajukan lembur' }, { status: 403 });
    }

    const karyawan = await prisma.karyawan.findUnique({
      where: { user_id: BigInt(userId) },
      include: { jenis_karyawan: true },
    });

    if (!karyawan || karyawan.status !== 'AKTIF') {
      return NextResponse.json({ success: false, error: 'Karyawan tidak aktif' }, { status: 403 });
    }

    const { tanggal, jam_mulai, jam_selesai, keterangan } = await req.json();

    // Validasi input
    if (!tanggal || !jam_mulai || !jam_selesai || !keterangan) {
      return NextResponse.json({ success: false, error: 'Semua field harus diisi' }, { status: 400 });
    }

    // Cek apakah sudah ada absensi masuk & pulang di hari tersebut
    const tanggalLembur = new Date(tanggal);
    tanggalLembur.setUTCHours(0, 0, 0, 0);

    const absensi = await prisma.absensi.findFirst({
      where: {
        karyawan_id: karyawan.id,
        tanggal: tanggalLembur,
      },
    });

    if (!absensi) {
      return NextResponse.json({ success: false, error: 'Belum melakukan absensi di tanggal tersebut' }, { status: 400 });
    }

    if (!absensi.jam_masuk || !absensi.jam_pulang) {
      return NextResponse.json({ success: false, error: 'Harus melakukan absensi masuk dan pulang terlebih dahulu' }, { status: 400 });
    }

    // Parse jam untuk validasi
    const jamMulaiLembur = new Date(`1970-01-01T${jam_mulai}`);
    const jamSelesaiLembur = new Date(`1970-01-01T${jam_selesai}`);
    const jamPulangNormal = new Date(`1970-01-01T${karyawan.jenis_karyawan.jam_pulang.toISOString().split('T')[1]}`);

    // Validasi jam
    if (jamSelesaiLembur <= jamMulaiLembur) {
      return NextResponse.json({ success: false, error: 'Jam selesai harus lebih besar dari jam mulai' }, { status: 400 });
    }

    if (jamMulaiLembur < jamPulangNormal) {
      return NextResponse.json({ 
        success: false, 
        error: `Lembur hanya bisa dilakukan setelah jam pulang normal (${karyawan.jenis_karyawan.jam_pulang.toISOString().split('T')[1].slice(0, 5)})` 
      }, { status: 400 });
    }

    // Hitung total jam lembur (dalam desimal)
    const diffMs = jamSelesaiLembur.getTime() - jamMulaiLembur.getTime();
    const totalJam = diffMs / (1000 * 60 * 60); // Convert ms to hours

    // Simpan data lembur
    const lembur = await prisma.lembur.create({
      data: {
        karyawan_id: karyawan.id,
        tanggal: tanggalLembur,
        jam_mulai: jamMulaiLembur,
        jam_selesai: jamSelesaiLembur,
        total_jam: totalJam,
        keterangan,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Lembur berhasil dicatat',
      data: {
        id: lembur.id.toString(),
        tanggal: lembur.tanggal,
        jam_mulai: lembur.jam_mulai,
        jam_selesai: lembur.jam_selesai,
        total_jam: Number(lembur.total_jam),
        keterangan: lembur.keterangan,
      }
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// GET: Riwayat lembur (karyawan lihat milik sendiri, admin lihat semua)
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    const { userId, role } = payload as { userId: number; role: string };

    // Get query parameters untuk filter
    const { searchParams } = new URL(req.url);
    const karyawanIdFilter = searchParams.get('karyawan_id');
    const tanggalMulai = searchParams.get('tanggal_mulai');
    const tanggalSelesai = searchParams.get('tanggal_selesai');

    let lemburList;
    let whereClause: any = {};

    if (role === 'ADMIN' || role === 'OWNER') {
      // Admin bisa melihat semua lembur dengan filter
      if (karyawanIdFilter) {
        whereClause.karyawan_id = BigInt(karyawanIdFilter);
      }
      if (tanggalMulai) {
        whereClause.tanggal = { ...whereClause.tanggal, gte: new Date(tanggalMulai) };
      }
      if (tanggalSelesai) {
        whereClause.tanggal = { ...whereClause.tanggal, lte: new Date(tanggalSelesai) };
      }

      lemburList = await prisma.lembur.findMany({
        where: whereClause,
        include: {
          karyawan: {
            select: {
              id: true,
              nama: true,
              nip: true,
            },
          },
        },
        orderBy: {
          tanggal: 'desc',
        },
      });
    } else {
      // Karyawan hanya melihat lembur milik sendiri
      const karyawan = await prisma.karyawan.findUnique({
        where: { user_id: BigInt(userId) },
      });

      if (!karyawan) {
        return NextResponse.json({ success: false, error: 'Data karyawan tidak ditemukan' }, { status: 404 });
      }

      whereClause.karyawan_id = karyawan.id;
      if (tanggalMulai) {
        whereClause.tanggal = { ...whereClause.tanggal, gte: new Date(tanggalMulai) };
      }
      if (tanggalSelesai) {
        whereClause.tanggal = { ...whereClause.tanggal, lte: new Date(tanggalSelesai) };
      }

      lemburList = await prisma.lembur.findMany({
        where: whereClause,
        include: {
          karyawan: {
            select: {
              id: true,
              nama: true,
              nip: true,
            },
          },
        },
        orderBy: {
          tanggal: 'desc',
        },
      });
    }

    // Hitung total jam lembur
    const totalJamLembur = lemburList.reduce((total, item) => {
      return total + Number(item.total_jam);
    }, 0);

    // Format data untuk response
    const formattedData = lemburList.map((item) => ({
      id: item.id.toString(),
      karyawan_id: item.karyawan_id.toString(),
      karyawan: {
        id: item.karyawan.id.toString(),
        nama: item.karyawan.nama,
        nip: item.karyawan.nip,
      },
      tanggal: item.tanggal,
      jam_mulai: item.jam_mulai,
      jam_selesai: item.jam_selesai,
      total_jam: Number(item.total_jam),
      keterangan: item.keterangan,
      created_at: item.created_at,
    }));

    return NextResponse.json({ 
      success: true, 
      data: formattedData,
      summary: {
        total_records: formattedData.length,
        total_jam_lembur: Number(totalJamLembur.toFixed(2)),
      }
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
