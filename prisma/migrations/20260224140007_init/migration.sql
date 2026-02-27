/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `barang_keluar_ayam_hidup` ADD COLUMN `harga_bubut` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `is_bubut` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `keterangan` TEXT NULL;

-- AlterTable
ALTER TABLE `karyawan` ADD COLUMN `foto_profil` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `customers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(255) NOT NULL,
    `no_hp` VARCHAR(50) NULL,
    `alamat` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `penjualan` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `nomor_nota` VARCHAR(50) NOT NULL,
    `customer_id` BIGINT NOT NULL,
    `tanggal` DATE NOT NULL,
    `jenis_transaksi` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    `total_penjualan` DECIMAL(15, 2) NOT NULL,
    `pengeluaran` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(15, 2) NOT NULL,
    `jumlah_bayar` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `sisa_piutang` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'hutang',
    `metode_pembayaran` VARCHAR(20) NOT NULL,
    `keterangan` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `penjualan_nomor_nota_key`(`nomor_nota`),
    INDEX `penjualan_customer_id_idx`(`customer_id`),
    INDEX `penjualan_tanggal_idx`(`tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `penjualan_detail` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `penjualan_id` BIGINT NOT NULL,
    `jenis_daging` VARCHAR(100) NULL,
    `ekor` INTEGER NULL,
    `berat` DECIMAL(10, 2) NOT NULL,
    `harga` DECIMAL(15, 2) NOT NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL,

    INDEX `penjualan_detail_penjualan_id_idx`(`penjualan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pembayaran_piutang` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT NOT NULL,
    `penjualan_id` BIGINT NULL,
    `tanggal` DATE NOT NULL,
    `jumlah_bayar` DECIMAL(15, 2) NOT NULL,
    `metode` VARCHAR(20) NOT NULL,
    `keterangan` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pembayaran_piutang_customer_id_idx`(`customer_id`),
    INDEX `pembayaran_piutang_penjualan_id_idx`(`penjualan_id`),
    INDEX `pembayaran_piutang_tanggal_idx`(`tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);

-- AddForeignKey
ALTER TABLE `penjualan` ADD CONSTRAINT `penjualan_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `penjualan_detail` ADD CONSTRAINT `penjualan_detail_penjualan_id_fkey` FOREIGN KEY (`penjualan_id`) REFERENCES `penjualan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pembayaran_piutang` ADD CONSTRAINT `pembayaran_piutang_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pembayaran_piutang` ADD CONSTRAINT `pembayaran_piutang_penjualan_id_fkey` FOREIGN KEY (`penjualan_id`) REFERENCES `penjualan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
