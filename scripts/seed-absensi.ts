import { PrismaClient, StatusAbsensi } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding absensi data...');

  // Get all karyawan
  const karyawanList = await prisma.karyawan.findMany({
    select: { id: true, nama: true, jenis_karyawan: { select: { jam_masuk: true, jam_pulang: true } } },
  });

  if (karyawanList.length === 0) {
    console.log('No karyawan found! Run the main seed first.');
    return;
  }

  console.log(`Found ${karyawanList.length} karyawan`);

  // Generate absensi for Feb 2026 (1st - 21st, today)
  const year = 2026;
  const month = 1; // 0-indexed = February

  const statuses: StatusAbsensi[] = ['HADIR', 'HADIR', 'HADIR', 'HADIR', 'HADIR', 'TERLAMBAT', 'IZIN'];

  let created = 0;

  for (const karyawan of karyawanList) {
    for (let day = 1; day <= 21; day++) {
      const date = new Date(Date.UTC(year, month, day));
      const dayOfWeek = date.getUTCDay(); // 0=Sunday

      // Skip Sundays
      if (dayOfWeek === 0) continue;

      // Random status 
      const randomIdx = Math.floor(Math.random() * statuses.length);
      const status = statuses[randomIdx];

      // Skip some days randomly (alpha - no record)
      if (Math.random() < 0.05) continue; // 5% chance of alpha (no record)

      const jamMasukHour = status === 'TERLAMBAT' ? 8 : 7;
      const jamMasukMinute = status === 'TERLAMBAT' ? Math.floor(Math.random() * 30) + 15 : Math.floor(Math.random() * 10);

      try {
        await prisma.absensi.create({
          data: {
            karyawan_id: karyawan.id,
            tanggal: date,
            jam_masuk: new Date(Date.UTC(1970, 0, 1, jamMasukHour, jamMasukMinute, 0)),
            jam_pulang: status === 'IZIN' ? null : new Date(Date.UTC(1970, 0, 1, 16, Math.floor(Math.random() * 30), 0)),
            status: status,
          },
        });
        created++;
      } catch (e: any) {
        // Skip duplicates
        if (!e.message.includes('Unique')) {
          console.error(`Error for karyawan ${karyawan.nama} day ${day}:`, e.message);
        }
      }
    }
  }

  console.log(`Created ${created} absensi records`);

  // Also create some lembur records
  let lemburCreated = 0;
  for (const karyawan of karyawanList.slice(0, 5)) {
    for (const day of [3, 10, 17]) {
      const date = new Date(Date.UTC(year, month, day));
      try {
        await prisma.lembur.create({
          data: {
            karyawan_id: karyawan.id,
            tanggal: date,
            jam_mulai: new Date(Date.UTC(1970, 0, 1, 17, 0, 0)),
            jam_selesai: new Date(Date.UTC(1970, 0, 1, 20, 0, 0)),
            total_jam: 3.0,
            keterangan: 'Lembur produksi',
          },
        });
        lemburCreated++;
      } catch (e: any) {
        // skip
      }
    }
  }
  console.log(`Created ${lemburCreated} lembur records`);

  // Create some izin/cuti records
  let izinCreated = 0;
  for (const karyawan of karyawanList.slice(0, 3)) {
    try {
      await prisma.izinCuti.create({
        data: {
          karyawan_id: karyawan.id,
          jenis: 'IZIN',
          tanggal_mulai: new Date(Date.UTC(year, month, 5)),
          tanggal_selesai: new Date(Date.UTC(year, month, 5)),
          alasan: 'Keperluan keluarga',
          status: 'DISETUJUI',
        },
      });
      izinCreated++;
    } catch (e: any) {
      // skip
    }
  }
  console.log(`Created ${izinCreated} izin/cuti records`);

  await prisma.$disconnect();
  console.log('Done!');
}

main();
