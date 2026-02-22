-- Add new columns to penjualan table
ALTER TABLE `penjualan` ADD COLUMN IF NOT EXISTS `nomor_nota` VARCHAR(50) NULL;
ALTER TABLE `penjualan` ADD COLUMN IF NOT EXISTS `pengeluaran` DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE `penjualan` ADD COLUMN IF NOT EXISTS `grand_total` DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE `penjualan` ADD COLUMN IF NOT EXISTS `status` VARCHAR(20) NOT NULL DEFAULT 'hutang';
ALTER TABLE `penjualan` ADD COLUMN IF NOT EXISTS `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Update existing rows
UPDATE `penjualan` SET 
  `grand_total` = `total_penjualan` - `pengeluaran`,
  `nomor_nota` = CONCAT('NOTA-', DATE_FORMAT(`tanggal`, '%Y%m%d'), '-', LPAD(id, 4, '0')),
  `status` = CASE 
    WHEN `sisa_piutang` <= 0 THEN 'lunas'
    WHEN `jumlah_bayar` > 0 THEN 'sebagian'
    ELSE 'hutang'
  END
WHERE `nomor_nota` IS NULL OR `grand_total` = 0;

-- Make nomor_nota NOT NULL and UNIQUE
ALTER TABLE `penjualan` MODIFY COLUMN `nomor_nota` VARCHAR(50) NOT NULL;

-- Add penjualan_id to pembayaran_piutang
ALTER TABLE `pembayaran_piutang` ADD COLUMN IF NOT EXISTS `penjualan_id` BIGINT NULL;

-- Create penjualan_detail table
CREATE TABLE IF NOT EXISTS `penjualan_detail` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `penjualan_id` BIGINT NOT NULL,
  `jenis_daging` VARCHAR(100) NULL,
  `ekor` INT NULL,
  `berat` DECIMAL(10,2) NOT NULL,
  `harga` DECIMAL(15,2) NOT NULL,
  `subtotal` DECIMAL(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `penjualan_detail_penjualan_id_idx` (`penjualan_id`),
  CONSTRAINT `penjualan_detail_penjualan_id_fkey` FOREIGN KEY (`penjualan_id`) REFERENCES `penjualan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
