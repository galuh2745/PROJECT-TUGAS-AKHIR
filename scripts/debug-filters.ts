import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check what absensi data exists
  const absensi = await prisma.absensi.findMany({ 
    select: { id: true, tanggal: true, status: true, karyawan_id: true },
    orderBy: { tanggal: 'desc' },
    take: 20 
  });
  console.log('=== All Absensi data (top 20) ===');
  absensi.forEach(a => console.log('id:', a.id.toString(), 'tanggal:', a.tanggal, 'status:', a.status, 'karyawan_id:', a.karyawan_id.toString()));
  
  // Check Jan 2026 specifically
  const jan = new Date(Date.UTC(2026, 0, 1));
  const janEnd = new Date(Date.UTC(2026, 1, 0, 23, 59, 59, 999));
  console.log('\n=== Jan 2026 range ===');
  console.log('From:', jan.toISOString(), 'To:', janEnd.toISOString());
  
  const janData = await prisma.absensi.findMany({
    where: { tanggal: { gte: jan, lte: janEnd } },
    select: { id: true, tanggal: true, status: true }
  });
  console.log('Jan 2026 count:', janData.length);
  janData.forEach(a => console.log('  ', a.tanggal));
  
  // Check Feb 2026
  const feb = new Date(Date.UTC(2026, 1, 1));
  const febEnd = new Date(Date.UTC(2026, 2, 0, 23, 59, 59, 999));
  console.log('\n=== Feb 2026 range ===');
  console.log('From:', feb.toISOString(), 'To:', febEnd.toISOString());
  
  const febData = await prisma.absensi.findMany({
    where: { tanggal: { gte: feb, lte: febEnd } },
    select: { id: true, tanggal: true, status: true }
  });
  console.log('Feb 2026 count:', febData.length);
  febData.forEach(a => console.log('  ', a.tanggal));
  
  // Today specifically
  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const todayDate = new Date(todayStr + 'T00:00:00.000Z');
  console.log('\n=== Today ===');
  console.log('todayStr:', todayStr, 'todayDate:', todayDate.toISOString());
  
  const todayData = await prisma.absensi.findMany({
    where: { tanggal: todayDate },
    select: { id: true, tanggal: true, status: true, karyawan_id: true }
  });
  console.log('Today count:', todayData.length);
  todayData.forEach(a => console.log('  karyawan_id:', a.karyawan_id.toString(), 'tanggal:', a.tanggal, 'status:', a.status));

  // Check izin_cuti
  const izinCuti = await prisma.izinCuti.findMany({
    select: { id: true, tanggal_mulai: true, tanggal_selesai: true, jenis: true, status: true, karyawan_id: true },
    orderBy: { tanggal_mulai: 'desc' },
    take: 20
  });
  console.log('\n=== Izin/Cuti data ===');
  izinCuti.forEach(a => console.log('id:', a.id.toString(), 'mulai:', a.tanggal_mulai, 'selesai:', a.tanggal_selesai, 'jenis:', a.jenis, 'status:', a.status));

  // Check lembur
  const lembur = await prisma.lembur.findMany({
    select: { id: true, tanggal: true, karyawan_id: true },
    orderBy: { tanggal: 'desc' },
    take: 20
  });
  console.log('\n=== Lembur data ===');
  lembur.forEach(a => console.log('id:', a.id.toString(), 'tanggal:', a.tanggal, 'karyawan_id:', a.karyawan_id.toString()));

  await prisma.$disconnect();
}

main();
