-- Lot/serial hasil hitung opname per baris sesi, diteruskan ke
-- StockAdjustmentItem saat posting (aditif, nullable — baris lama NULL).
ALTER TABLE `stocktake_lines` ADD COLUMN `batch_numbers` JSON NULL;
ALTER TABLE `stocktake_lines` ADD COLUMN `serial_numbers` JSON NULL;
