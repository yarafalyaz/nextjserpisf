-- F-2026-10-22-070-S (induk F-2026-10-21-013): override stok minimum per
-- (barang, gudang). Tabel master murni; baris ada = minimum efektif pasangan
-- itu, baris tidak ada = warisi Item.minStock global (BR-MS-02). Aksi
-- item-warehouse-setting.actions menjaga izin edit_items (Q-MS-1), item stok
-- aktif, gudang aktif, dan minStock >= 0. Pengaturan tidak pernah menulis
-- StockMove, jurnal, atau reservasi (BR-MS-09).

CREATE TABLE `item_warehouse_settings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `item_id` INTEGER NOT NULL,
  `warehouse_id` INTEGER NOT NULL,
  `min_stock` DECIMAL(15, 2) NOT NULL,
  `created_by` INTEGER NULL,
  `updated_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `item_warehouse_settings_pair_key`(`item_id`, `warehouse_id`),
  INDEX `item_warehouse_settings_warehouse_id_idx`(`warehouse_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `item_warehouse_settings` ADD CONSTRAINT `item_warehouse_settings_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `item_warehouse_settings` ADD CONSTRAINT `item_warehouse_settings_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
