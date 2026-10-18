-- P1-5: sesi opname bertahap. Opname lama single-pass (hitung -> satu draft
-- adjustment) tanpa snapshot/recount/freeze. Sesi mencatat snapshot sistem
-- per baris, hitungan 1+2 (recount), final, dan approval independen sebelum
-- posting variance menjadi adjustment yang dapat diaudit.
CREATE TABLE `stocktake_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `document_no` VARCHAR(64) NOT NULL,
  `slug` VARCHAR(128) NULL,
  `warehouse_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `snapshot_at` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `counted_by` INT NULL,
  `approved_by` INT NULL,
  `approved_at` DATETIME(3) NULL,
  `adjustment_id` INT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stocktake_sessions_document_no_unique` (`document_no`),
  UNIQUE KEY `stocktake_sessions_slug_unique` (`slug`),
  INDEX `stocktake_sessions_warehouse_id_idx` (`warehouse_id`),
  INDEX `stocktake_sessions_status_idx` (`status`),
  CONSTRAINT `stocktake_sessions_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `stocktake_lines` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` INT NOT NULL,
  `item_id` INT NOT NULL,
  `system_qty` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `count1` DECIMAL(15, 2) NULL,
  `count2` DECIMAL(15, 2) NULL,
  `final_count` DECIMAL(15, 2) NULL,
  `variance` DECIMAL(15, 2) NULL,
  `note` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `stocktake_lines_session_id_idx` (`session_id`),
  INDEX `stocktake_lines_item_id_idx` (`item_id`),
  CONSTRAINT `stocktake_lines_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `stocktake_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `stocktake_lines_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
