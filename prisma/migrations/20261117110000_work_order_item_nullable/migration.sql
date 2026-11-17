-- Baris JASA pada perintah kerja tidak punya item stok. Kode lama menulis
-- sentinel `itemId = 0` (down-payment.hook: `item.itemId ?? 0`), sedangkan
-- `items` tidak pernah punya id 0. Migrasi FK `20261117120000_item_line_fk`
-- memasang FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT pada
-- tabel ini, sehingga seluruh baris jasa akan menggagalkan deploy (errno 1452).
--
-- Urutan aman: konversi sentinel ke NULL DULU, baru kolom jadi nullable,
-- baru FK dipasang migrasi berikutnya.
-- Audit 2026-11-17.

-- 1. Sentinel 0 bukan item sah: baris jasa menjadi NULL.
UPDATE `work_order_items` SET `item_id` = NULL WHERE `item_id` = 0;

-- 2. Kolom harus nullable supaya NULL sah.
ALTER TABLE `work_order_items` MODIFY `item_id` INTEGER NULL;

-- Catatan operator: setelah migrasi ini, `item_id` NULL = baris jasa.
-- Query verifikasi (harus 0 baris sebelum 20261117120000 dijalankan):
--   SELECT COUNT(*) FROM work_order_items i
--   LEFT JOIN items t ON t.id = i.item_id
--   WHERE i.item_id IS NOT NULL AND t.id IS NULL;
