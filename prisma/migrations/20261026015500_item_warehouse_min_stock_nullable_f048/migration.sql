-- F-2026-10-26 perbaikan snapshot PR #936 (BR-ROP-01/AC-ROP-B3): min_stock
-- nullable. NULL = belum diatur staf = warisi Item.minStock global; nilai
-- (termasuk 0) = override eksplisit per gudang. Tanpa backfill: nilai
-- existing tetap override staf (tidak boleh berubah diam-diam).
ALTER TABLE `item_warehouse_settings` MODIFY COLUMN `min_stock` DECIMAL(15, 2) NULL;
