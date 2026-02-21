import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tables = [
    { name: 'user', fn: () => prisma.user.count() },
    { name: 'karyawan', fn: () => prisma.karyawan.count() },
    { name: 'jenis_karyawan', fn: () => prisma.jenisKaryawan.count() },
    { name: 'absensi', fn: () => prisma.absensi.count() },
    { name: 'lembur', fn: () => prisma.lembur.count() },
    { name: 'izin_cuti', fn: () => prisma.izinCuti.count() },
    { name: 'perusahaan', fn: () => prisma.perusahaan.count() },
    { name: 'jenis_daging', fn: () => prisma.jenisDaging.count() },
    { name: 'customer', fn: () => prisma.customer.count() },
    { name: 'penjualan', fn: () => prisma.penjualan.count() },
    { name: 'piutang', fn: () => prisma.piutang.count() },
    { name: 'barang_masuk', fn: () => prisma.barangMasuk.count() },
    { name: 'barang_keluar_ayam_hidup', fn: () => prisma.barangKeluarAyamHidup.count() },
    { name: 'barang_keluar_daging', fn: () => prisma.barangKeluarDaging.count() },
    { name: 'ayam_mati', fn: () => prisma.ayamMati.count() },
  ];

  console.log('=== Database Record Counts ===');
  for (const t of tables) {
    try {
      const count = await t.fn();
      console.log(`${t.name}: ${count}`);
    } catch (e: any) {
      console.log(`${t.name}: ERROR - ${e.message}`);
    }
  }

  // Show karyawan data
  const karyawan = await prisma.karyawan.findMany({
    select: { id: true, nama: true, user_id: true },
    take: 5
  });
  console.log('\n=== Karyawan sample ===');
  karyawan.forEach(k => console.log('id:', k.id.toString(), 'nama:', k.nama, 'user_id:', k.user_id.toString()));

  // Show penjualan dates
  const penjualan = await prisma.penjualan.findMany({
    select: { id: true, tanggal: true },
    orderBy: { tanggal: 'desc' },
    take: 5
  });
  console.log('\n=== Penjualan sample ===');
  penjualan.forEach(p => console.log('id:', p.id.toString(), 'tanggal:', p.tanggal));

  // Show barang masuk dates
  const bm = await prisma.barangMasuk.findMany({
    select: { id: true, tanggal: true },
    orderBy: { tanggal: 'desc' },
    take: 5
  });
  console.log('\n=== Barang Masuk sample ===');
  bm.forEach(b => console.log('id:', b.id.toString(), 'tanggal:', b.tanggal));

  await prisma.$disconnect();
}

main();
