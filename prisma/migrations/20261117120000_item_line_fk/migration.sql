-- Item line-label FK: 14 model baris dokumen memakai itemId bare Int sehingga
-- tidak ada FK sama sekali. deleteItem (src/actions/master.actions.ts) hard-delete
-- dulu dan hanya soft-delete bila kena P2003 — tanpa FK, item yang masih
-- direferensikan baris-baris ini terhapus keras dan barisnya jadi yatim.
-- Pola VendorBillItem (migrasi 20261029180100_vendor_bill_item_fk): itemId ->
-- items Restrict, jadi deleteItem jatuh ke P2003 lalu soft-delete.
--
-- 3 dari 14 kolom nullable (QuotationItem, SalesOrderItem, ProjectItem):
-- NULL tetap sah, FK tidak menolaknya; pre-check di bawah menyaring NULL.
-- Sisa 11 kolom NOT NULL.
--
-- RISIKO DATA EXISTING: migrasi GAGAL bila ada baris yatim. Jalankan SEMUA
-- query pre-check ini di produksi DULU; setiap hasil wajib 0.
--   SELECT COUNT(*) FROM quotation_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE i.item_id IS NOT NULL AND t.id IS NULL;
--   SELECT COUNT(*) FROM sales_order_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE i.item_id IS NOT NULL AND t.id IS NULL;
--   SELECT COUNT(*) FROM sales_return_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM purchase_request_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM purchase_order_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM purchase_return_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM stock_adjustment_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM product_materials i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM bom_revision_materials i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM production_order_materials i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM production_genealogy_materials i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM work_order_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE t.id IS NULL;
--   SELECT COUNT(*) FROM project_items i LEFT JOIN items t ON t.id = i.item_id
--     WHERE i.item_id IS NOT NULL AND t.id IS NULL;
--   SELECT COUNT(*) FROM job_change_order_items i LEFT JOIN items t ON t.id = i.itemId
--     WHERE t.id IS NULL;
--
-- Catatan WorkOrderItem/JobChangeOrderItem: komentar lama menyebut konvensi
-- "baris jasa itemId = 0". Item id 0 tidak pernah ada di tabel items, jadi
-- prod WAJIB membuktikan kedua query terakhir 0. Dev 2026-11-17: 0 baris
-- work_order_items/job_change_order_items ber-itemId 0, 0 yatim di 14 tabel,
-- 0 baris items ber-id 0.
--
-- Bila pre-check mengembalikan > 0: jangan deploy migrasi ini. Perbaiki dulu
-- barisnya (tautkan ulang ke item sah, atau NULL-kan untuk 3 kolom nullable),
-- sebab ADD CONSTRAINT menolak baris yatim.

-- AddForeignKey
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_order_items` ADD CONSTRAINT `sales_order_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_return_items` ADD CONSTRAINT `sales_return_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_adjustment_items` ADD CONSTRAINT `stock_adjustment_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_materials` ADD CONSTRAINT `product_materials_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bom_revision_materials` ADD CONSTRAINT `bom_revision_materials_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_order_materials` ADD CONSTRAINT `production_order_materials_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_genealogy_materials` ADD CONSTRAINT `production_genealogy_materials_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_order_items` ADD CONSTRAINT `work_order_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_change_order_items` ADD CONSTRAINT `job_change_order_items_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
