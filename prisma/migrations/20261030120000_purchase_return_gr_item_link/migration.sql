-- STOK-16: tautan eksplisit baris retur beli ke baris penerimaan asal
-- (nullable, legacy NULL = fallback receipt terbaru per item).
ALTER TABLE `purchase_return_items` ADD COLUMN `goods_receipt_item_id` INTEGER NULL;
CREATE INDEX `purchase_return_items_goods_receipt_item_id_idx` ON `purchase_return_items`(`goods_receipt_item_id`);
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_goods_receipt_item_id_fkey` FOREIGN KEY (`goods_receipt_item_id`) REFERENCES `goods_receipt_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
