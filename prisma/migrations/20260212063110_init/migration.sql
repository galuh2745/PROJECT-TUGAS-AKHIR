/*
  Warnings:

  - You are about to drop the `barang_keluar` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `barang_keluar` DROP FOREIGN KEY `barang_keluar_perusahaan_id_fkey`;

-- DropIndex
DROP INDEX `users_email_key` ON `users`;

-- AlterTable
ALTER TABLE `users` MODIFY `email` VARCHAR(255) NULL;

-- DropTable
DROP TABLE `barang_keluar`;

-- CreateTable
CREATE TABLE `barang_keluar_ayam_hidup` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `perusahaan_id` BIGINT NOT NULL,
    `tanggal` DATE NOT NULL,
    `nama_customer` VARCHAR(255) NOT NULL,
    `jumlah_ekor` INTEGER NOT NULL,
    `total_kg` DECIMAL(10, 2) NOT NULL,
    `jenis_daging` VARCHAR(10) NOT NULL DEFAULT 'BESAR',
    `harga_per_kg` DECIMAL(12, 2) NOT NULL,
    `total_penjualan` DECIMAL(15, 2) NOT NULL,
    `pengeluaran` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total_bersih` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `barang_keluar_ayam_hidup_perusahaan_id_idx`(`perusahaan_id`),
    INDEX `barang_keluar_ayam_hidup_tanggal_idx`(`tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jenis_daging` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `nama_jenis` VARCHAR(100) NOT NULL,
    `aktif` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `barang_keluar_daging` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `perusahaan_id` BIGINT NULL,
    `tanggal` DATE NOT NULL,
    `nama_customer` VARCHAR(255) NOT NULL,
    `total_penjualan` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `pengeluaran` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `saldo` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `keterangan` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `barang_keluar_daging_perusahaan_id_idx`(`perusahaan_id`),
    INDEX `barang_keluar_daging_tanggal_idx`(`tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `barang_keluar_daging_detail` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `barang_keluar_daging_id` BIGINT NOT NULL,
    `jenis_daging_id` BIGINT NOT NULL,
    `berat_kg` DECIMAL(10, 2) NOT NULL,
    `harga_per_kg` DECIMAL(15, 2) NOT NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `barang_keluar_daging_detail_barang_keluar_daging_id_idx`(`barang_keluar_daging_id`),
    INDEX `barang_keluar_daging_detail_jenis_daging_id_idx`(`jenis_daging_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `barang_keluar_ayam_hidup` ADD CONSTRAINT `barang_keluar_ayam_hidup_perusahaan_id_fkey` FOREIGN KEY (`perusahaan_id`) REFERENCES `perusahaan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barang_keluar_daging` ADD CONSTRAINT `barang_keluar_daging_perusahaan_id_fkey` FOREIGN KEY (`perusahaan_id`) REFERENCES `perusahaan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barang_keluar_daging_detail` ADD CONSTRAINT `barang_keluar_daging_detail_barang_keluar_daging_id_fkey` FOREIGN KEY (`barang_keluar_daging_id`) REFERENCES `barang_keluar_daging`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barang_keluar_daging_detail` ADD CONSTRAINT `barang_keluar_daging_detail_jenis_daging_id_fkey` FOREIGN KEY (`jenis_daging_id`) REFERENCES `jenis_daging`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
