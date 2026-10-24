-- F-2026-10-22-069-S: relasi substitusi part satu arah di master barang.
-- Tabel master murni; penjaga (asal != pengganti, item stok aktif, satuan
-- dasar sama, pasangan aktif ganda ditolak, nonaktif tanpa hapus) hidup di
-- aksi item-substitute.actions, bukan skema. Penerapan ke WO hanya lewat
-- reviseWorkOrderItems existing — tabel ini tidak pernah menulis stok,
-- StockMove, ProductionCost, atau jurnal (BR-SUB69-04/06, vonis
-- F-2026-10-22-075-V Q-SUB69-5).

CREATE TABLE `item_substitutes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `item_id` INTEGER NOT NULL,
  `substitute_item_id` INTEGER NOT NULL,
  `notes` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `item_substitutes_pair_key`(`item_id`, `substitute_item_id`),
  INDEX `item_substitutes_item_id_is_active_idx`(`item_id`, `is_active`),
  INDEX `item_substitutes_substitute_item_id_idx`(`substitute_item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `item_substitutes` ADD CONSTRAINT `item_substitutes_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `item_substitutes` ADD CONSTRAINT `item_substitutes_substitute_item_id_fkey` FOREIGN KEY (`substitute_item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
