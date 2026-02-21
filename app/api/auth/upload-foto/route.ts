import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, message: 'Token tidak valid' }, { status: 401 });
    }

    // Get karyawan
    const user = await prisma.user.findUnique({
      where: { id: BigInt(decoded.userId) },
      select: { karyawan: { select: { id: true, nip: true, foto_profil: true } } },
    });

    if (!user?.karyawan) {
      return NextResponse.json({ success: false, message: 'Data karyawan tidak ditemukan' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('foto') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'File foto harus diupload' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, message: 'Format file harus JPG, PNG, atau WebP' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'Ukuran file maksimal 5MB' }, { status: 400 });
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create upload directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profil');
    await fs.mkdir(uploadDir, { recursive: true });

    // Delete old photo if exists
    if (user.karyawan.foto_profil) {
      const oldPath = path.join(process.cwd(), 'public', user.karyawan.foto_profil);
      try { await fs.unlink(oldPath); } catch {}
    }

    // Generate filename
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `profil_${user.karyawan.nip}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // Write file
    await fs.writeFile(filePath, buffer);

    // Save path to database
    const fotoPath = `/uploads/profil/${fileName}`;
    await prisma.karyawan.update({
      where: { id: user.karyawan.id },
      data: { foto_profil: fotoPath },
    });

    return NextResponse.json({
      success: true,
      message: 'Foto profil berhasil diupload',
      data: { foto_profil: fotoPath },
    });
  } catch (error) {
    console.error('Upload foto profil error:', error);
    return NextResponse.json({ success: false, message: 'Terjadi kesalahan saat upload' }, { status: 500 });
  }
}
