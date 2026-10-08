-- Biaya admin bank pada penerimaan barang (GoodsReceipt.adminFee):
-- dicatat terpisah dari ongkir/biaya lain, tetap masuk HPP, tapi diberi
-- baris jurnal sendiri (Debit Beban Admin Bank) agar pecahannya terlihat.
ALTER TABLE `goods_receipts` ADD COLUMN `admin_fee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;

-- Akun beban admin bank untuk pemetaan akun pembelian.
ALTER TABLE `system_settings` ADD COLUMN `purchase_admin_fee_account_id` INTEGER NULL;
