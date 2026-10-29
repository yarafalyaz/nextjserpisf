-- Round2 skema: VendorBillItem FK yatim -> relasi nyata.
-- itemId -> items Restrict (pola GoodsReceiptItem.item: item terpakai
-- tagihan tidak boleh terhapus). goodsReceiptItemId -> SetNull (pola
-- tautan dokumen opsional existing: baris tagihan tetap hidup sebagai
-- riwayat walau baris penerimaan dibuang).
-- accountId/costCenterId TETAP bare-int: pola master generik existing
-- (SalesPayment/VendorPayment/JournalEntry/Expense), bukan FK yatim baru.
--
-- RISIKO DATA EXISTING: migrasi GAGAL bila ada item_id /
-- goods_receipt_item_id yatim. Cek dulu:
--   SELECT COUNT(*) FROM vendor_bill_items v LEFT JOIN items i
--     ON i.id = v.item_id WHERE v.item_id IS NOT NULL AND i.id IS NULL;
--   SELECT COUNT(*) FROM vendor_bill_items v
--     LEFT JOIN goods_receipt_items g ON g.id = v.goods_receipt_item_id
--     WHERE v.goods_receipt_item_id IS NOT NULL AND g.id IS NULL;
-- Cek lokal 2026-10-29 (DB dev): 0 baris vendor_bill_items, 0 yatim.

-- AddForeignKey
ALTER TABLE `vendor_bill_items` ADD CONSTRAINT `vendor_bill_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_bill_items` ADD CONSTRAINT `vendor_bill_items_goods_receipt_item_id_fkey` FOREIGN KEY (`goods_receipt_item_id`) REFERENCES `goods_receipt_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
