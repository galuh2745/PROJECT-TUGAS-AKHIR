import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/me
 * Mendapatkan informasi user yang sedang login berdasarkan token
 */
export async function GET(request: NextRequest) {
  try {
    // Ambil token dari cookie
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          message: 'Token tidak ditemukan',
        },
        { status: 401 }
      );
    }

    // Verifikasi token
    const decoded = await verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        {
          success: false,
          message: 'Token tidak valid atau sudah expired',
        },
        { status: 401 }
      );
    }

    // Ambil data user dari database beserta data karyawan
    const user = await prisma.user.findUnique({
      where: { id: BigInt(decoded.userId) },
      select: {
        id: true,
        name: true,
        role: true,
        created_at: true,
        karyawan: {
          select: {
            id: true,
            nip: true,
            nama: true,
            no_hp: true,
            alamat: true,
            foto_profil: true,
            status: true,
            jenis_karyawan: {
              select: {
                id: true,
                nama_jenis: true,
                jam_masuk: true,
                jam_pulang: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User tidak ditemukan',
        },
        { status: 404 }
      );
    }

    // Helper function untuk format waktu (menggunakan local time bukan UTC)
    const formatTime = (date: Date): string => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id.toString(),
          name: user.name,
          role: user.role,
          created_at: user.created_at,
          karyawan: user.karyawan ? {
            id: user.karyawan.id.toString(),
            nip: user.karyawan.nip,
            nama: user.karyawan.nama,
            no_hp: user.karyawan.no_hp,
            alamat: user.karyawan.alamat,
            foto_profil: user.karyawan.foto_profil,
            status: user.karyawan.status,
            jenis_karyawan: user.karyawan.jenis_karyawan ? {
              id: user.karyawan.jenis_karyawan.id.toString(),
              nama_jenis: user.karyawan.jenis_karyawan.nama_jenis,
              jam_masuk: formatTime(user.karyawan.jenis_karyawan.jam_masuk),
              jam_pulang: formatTime(user.karyawan.jenis_karyawan.jam_pulang),
            } : null,
          } : null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get user error:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Terjadi kesalahan saat mengambil data user',
      },
      { status: 500 }
    );
  }
}
