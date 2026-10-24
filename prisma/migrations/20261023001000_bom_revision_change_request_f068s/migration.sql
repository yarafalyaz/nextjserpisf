-- F-2026-10-22-068-S: pengajuan ganti revisi BOM pada order berjalan
-- (perubahan terkendali). Tabel usulan murni; penjaga (belum ter-issue =
-- langsung diterapkan BR-BOM68-02; sudah ter-issue = usulan wajib diputus
-- SoD BR-BOM68-05; tolak wajib alasan; pin diganti di transaksi
-- persetujuan yang sama BR-BOM68-06) hidup di aksi
-- bom-revision-change.actions, bukan skema. Tidak ada sentuhan
-- StockMove/MaterialIssue/ProductionCost/jurnal dari tabel ini (vonis
-- F-074-V, BR-BOM68-09).

CREATE TABLE `bom_revision_change_requests` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `work_order_id` INTEGER NULL,
  `production_order_id` INTEGER NULL,
  `from_revision_id` INTEGER NOT NULL,
  `to_revision_id` INTEGER NOT NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'menunggu',
  `requested_by` INTEGER NULL,
  `decided_by` INTEGER NULL,
  `decided_at` DATETIME(3) NULL,
  `decision_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `bom_revision_change_requests_work_order_id_status_idx`(`work_order_id`, `status`),
  INDEX `bom_revision_change_requests_production_order_id_status_idx`(`production_order_id`, `status`),
  INDEX `bom_revision_change_requests_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bom_revision_change_requests` ADD CONSTRAINT `bom_revision_change_requests_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bom_revision_change_requests` ADD CONSTRAINT `bom_revision_change_requests_production_order_id_fkey` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bom_revision_change_requests` ADD CONSTRAINT `bom_revision_change_requests_from_revision_id_fkey` FOREIGN KEY (`from_revision_id`) REFERENCES `bom_revisions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `bom_revision_change_requests` ADD CONSTRAINT `bom_revision_change_requests_to_revision_id_fkey` FOREIGN KEY (`to_revision_id`) REFERENCES `bom_revisions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
