import { prisma } from '../lib/prisma';

type StatusSeed = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'CUTI';

function dateUTC(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function timeUTC(hour: number, minute = 0) {
  return new Date(Date.UTC(2000, 0, 1, hour, minute, 0, 0));
}

function isSunday(date: Date) {
  return date.getUTCDay() === 0;
}

function pickStatus(index: number): StatusSeed {
  if (index % 9 === 0) return 'CUTI';
  if (index % 7 === 0) return 'IZIN';
  if (index % 4 === 0) return 'TERLAMBAT';
  return 'HADIR';
}

function buildMonthPlan(year: number, month: number, dayList: number[]) {
  const rows: { tanggal: Date; status: StatusSeed }[] = [];
  let index = 1;
  for (const day of dayList) {
    const tanggal = dateUTC(year, month, day);
    if (isSunday(tanggal)) continue;
    rows.push({ tanggal, status: pickStatus(index) });
    index++;
  }
  return rows;
}

async function main() {
  console.log('🌱 Seed absensi filter test dimulai...');

  const activeKaryawan = await prisma.karyawan.findMany({
    where: { status: 'AKTIF' },
    select: { id: true, nama: true, nip: true },
    orderBy: { id: 'asc' },
    take: 3,
  });

  if (activeKaryawan.length < 3) {
    throw new Error('Butuh minimal 3 karyawan AKTIF untuk seed test.');
  }

  const months = [
    { year: 2025, month: 12, days: [2, 4, 6, 9, 11, 13, 16, 18] },
    { year: 2026, month: 1, days: [3, 7, 10, 14, 17, 21, 24, 28] },
    { year: 2026, month: 2, days: [1, 5, 8, 12, 15, 19, 22, 26] },
  ];

  const monthRows = months.flatMap((m) => buildMonthPlan(m.year, m.month, m.days));

  let insertedTotal = 0;
  let skippedTotal = 0;

  for (const [karyawanIndex, karyawan] of activeKaryawan.entries()) {
    console.log(`\n👤 ${karyawan.nama} (${karyawan.nip})`);

    // Variasi antar karyawan: karyawan 2 skip sebagian Januari, karyawan 3 hanya sedikit data
    const rowsForKaryawan = monthRows.filter((_, idx) => {
      if (karyawanIndex === 1) {
        // kurangi kepadatan Januari
        const janBlockStart = 8;
        const janBlockEnd = 15;
        if (idx >= janBlockStart && idx <= janBlockEnd && idx % 2 === 0) return false;
      }
      if (karyawanIndex === 2) {
        // paling sedikit data agar kelihatan beda saat filter bulan
        return idx % 3 === 0;
      }
      return true;
    });

    for (const row of rowsForKaryawan) {
      const exists = await prisma.absensi.findFirst({
        where: {
          karyawan_id: karyawan.id,
          tanggal: row.tanggal,
        },
        select: { id: true },
      });

      if (exists) {
        skippedTotal++;
        continue;
      }

      const jamMasuk = row.status === 'TERLAMBAT' ? timeUTC(8, 45) : timeUTC(8, 0);
      const jamPulang = row.status === 'CUTI' || row.status === 'IZIN' ? null : timeUTC(17, 0);

      await prisma.absensi.create({
        data: {
          karyawan_id: karyawan.id,
          tanggal: row.tanggal,
          jam_masuk: jamMasuk,
          jam_pulang: jamPulang,
          status: row.status,
          latitude: -5.1132,
          longitude: 105.3067,
          foto_masuk: null,
          foto_pulang: null,
        },
      });

      insertedTotal++;
    }

    console.log(`  ✅ ${rowsForKaryawan.length} kandidat tanggal diproses`);
  }

  console.log('\n📊 Ringkasan seed absensi filter test');
  console.log(`  - Inserted: ${insertedTotal}`);
  console.log(`  - Skipped (sudah ada): ${skippedTotal}`);
  console.log('  - Periode data: Des 2025, Jan 2026, Feb 2026');
  console.log('✅ Selesai. Silakan uji filter bulan/tahun di halaman Riwayat Absensi Admin.');
}

main()
  .catch((err) => {
    console.error('❌ Gagal seed absensi filter test:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
