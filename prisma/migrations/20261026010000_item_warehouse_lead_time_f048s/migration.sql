-- F-2026-10-25-048-S titik pesan-ulang per (barang, gudang).
-- Putusan Lead 2026-10-26 00:40 WIB: Q-ROP-2 penampung tunggal
-- ItemWarehouseSetting.leadTimeDays (VendorItemPrice ditunda sadar);
-- Q-ROP-3 tulis reuse edit_items. Aditif saja: kolom nullable,
-- NULL = belum diisi = tidak dinilai (BR-ROP-03). Tanpa backfill,
-- tanpa kolom reorderPoint tersimpan (turunan builder baca-saja).
ALTER TABLE `item_warehouse_settings` ADD COLUMN `lead_time_days` INTEGER NULL;
