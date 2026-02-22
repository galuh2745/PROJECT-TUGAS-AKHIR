-- Add unique index on nomor_nota if not exists
CREATE UNIQUE INDEX `penjualan_nomor_nota_key` ON `penjualan`(`nomor_nota`);

-- Add index and FK on pembayaran_piutang.penjualan_id
CREATE INDEX `pembayaran_piutang_penjualan_id_idx` ON `pembayaran_piutang`(`penjualan_id`);
ALTER TABLE `pembayaran_piutang` ADD CONSTRAINT `pembayaran_piutang_penjualan_id_fkey` FOREIGN KEY (`penjualan_id`) REFERENCES `penjualan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
