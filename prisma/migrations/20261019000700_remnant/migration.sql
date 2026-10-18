-- P1-5: remnant/offcut/scrap. Sisa potong (sheet/bar/plate/tube) selama ini
-- tak tercatat: usable tak bisa dipilih untuk issue berikut, scrap menyatu
-- dengan stok. Remnant usable mengurangi stok? TIDAK — remnant adalah
-- identitas sisa dari material yang SUDAH keluar (issue/produksi); qty-nya
-- informasi (bukan stok gudang ganda). Konsumsi remnant = catat pemakaian
-- (status consumed) tanpa movement stok; scrap = catat alasan+biaya.
CREATE TABLE `remnants` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `document_no` VARCHAR(64) NOT NULL,
  `item_id` INT NOT NULL,
  `warehouse_id` INT NOT NULL,
  `qty` DECIMAL(15, 2) NOT NULL,
  `uom` VARCHAR(32) NULL,
  `dimensions` VARCHAR(255) NULL,
  `source_type` VARCHAR(32) NULL,
  `source_id` INT NULL,
  `unit_cost` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'usable',
  `scrap_reason` VARCHAR(500) NULL,
  `consumed_by` VARCHAR(128) NULL,
  `consumed_at` DATETIME(3) NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `remnants_document_no_unique` (`document_no`),
  INDEX `remnants_item_id_idx` (`item_id`),
  INDEX `remnants_warehouse_id_idx` (`warehouse_id`),
  INDEX `remnants_status_idx` (`status`),
  CONSTRAINT `remnants_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `remnants_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
