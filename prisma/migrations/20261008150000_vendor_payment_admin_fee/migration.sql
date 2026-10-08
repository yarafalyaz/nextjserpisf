-- Biaya admin bank pada pembayaran vendor (VendorPayment.adminFee).
-- Beban nyata saat transfer ke supplier; dicatat terpisah dari jumlah tagihan
-- yang dialokasikan ke bill, dan diposting ke akun Beban Admin Bank.
ALTER TABLE `vendor_payments` ADD COLUMN `admin_fee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
