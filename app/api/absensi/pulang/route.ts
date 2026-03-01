import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

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
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const karyawan = await prisma.karyawan.findUnique({
      where: { user_id: BigInt(userId) },
      include: { jenis_karyawan: true },
    });

    if (!karyawan || karyawan.status !== 'AKTIF') {
      return NextResponse.json({ success: false, error: 'Karyawan tidak aktif' }, { status: 403 });
    }

    const isShiftMalam = karyawan.jenis_karyawan.is_shift_malam;

    // Gunakan tanggal lokal (konsisten dengan absensi masuk)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const today = new Date(todayStr + 'T00:00:00.000Z');

    let absensi = await prisma.absensi.findFirst({
      where: {
        karyawan_id: karyawan.id,
        tanggal: today,
      },
    });

    // Shift malam: jika tidak ada absensi hari ini, cek kemarin (cross-midnight)
    if (!absensi && isShiftMalam) {
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      
      absensi = await prisma.absensi.findFirst({
        where: {
          karyawan_id: karyawan.id,
          tanggal: yesterday,
          jam_pulang: null, // hanya yang belum checkout
        },
      });

      if (absensi) {
        console.log(`Shift malam cross-midnight: karyawan ${karyawan.nama} absen pulang untuk tanggal ${yesterday.toISOString().split('T')[0]}`);
      }
    }

    if (!absensi) {
      return NextResponse.json({ success: false, error: 'Belum melakukan check-in hari ini' }, { status: 400 });
    }

    if (absensi.jam_pulang) {
      return NextResponse.json({ success: false, error: 'Sudah melakukan check-out' }, { status: 400 });
    }

    const currentTime = new Date();

    await prisma.absensi.update({
      where: { id: absensi.id },
      data: { jam_pulang: currentTime },
    });

    return NextResponse.json({ success: true, message: 'Berhasil absen pulang!' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}