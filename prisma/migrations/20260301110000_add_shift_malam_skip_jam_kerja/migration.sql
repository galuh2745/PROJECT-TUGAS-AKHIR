-- AlterTable
ALTER TABLE `jenis_karyawan` ADD COLUMN `is_shift_malam` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `jenis_karyawan` ADD COLUMN `skip_jam_kerja` BOOLEAN NOT NULL DEFAULT false;
