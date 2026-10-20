-- F-2026-10-20-39(a): garis keturunan baris pengeluaran material.
-- Kolom aditif nullable saja — MI manual tanpa WO dan baris lama tetap sah,
-- tanpa backfill (pasangan lama->baru TIDAK dikarang dari itemId).
ALTER TABLE `material_issue_items`
  ADD COLUMN `work_order_item_id` INTEGER NULL,
  ADD COLUMN `batch_numbers` JSON NULL,
  ADD INDEX `material_issue_items_work_order_item_id_idx` (`work_order_item_id`),
  ADD CONSTRAINT `material_issue_items_work_order_item_id_fkey`
    FOREIGN KEY (`work_order_item_id`) REFERENCES `work_order_items` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
