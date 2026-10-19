-- AUD-FIN-01: akun kewajiban Uang Muka Penjualan (CoA 210102).
-- ADD COLUMN nullable saja: instalasi lama tetap jalan (null = hook tolak
-- posting DP sampai dimapping = fail-closed, bukan salah catat diam-diam).
ALTER TABLE `system_settings` ADD COLUMN IF NOT EXISTS `customer_down_payment_account_id` INTEGER NULL;
