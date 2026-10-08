-- Store the destination rack + rack row per received line so goods-receipt
-- stock lands in the exact bin the operator picked (mirrors StockMove.rackId /
-- rack_row_id, which the verify hook now populates).

ALTER TABLE `goods_receipt_items`
  ADD COLUMN `rack_id` INTEGER NULL,
  ADD COLUMN `rack_row_id` INTEGER NULL;

CREATE INDEX `goods_receipt_items_rack_id_idx` ON `goods_receipt_items`(`rack_id`);
CREATE INDEX `goods_receipt_items_rack_row_id_idx` ON `goods_receipt_items`(`rack_row_id`);
