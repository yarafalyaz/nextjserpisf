-- F-2026-10-24-135-V (vonis BOT Accountant PR #742, Putusan 2/4):
-- penjualan besi tua scrap lewat SalesInvoice existing.
-- Aditif saja: penanda item + setting akun nullable TANPA default tebak
-- (kosong = posting faktur besi tua ditolak fail-closed; kandidat seed
-- 710003 tidak di-hardcode di migrasi/kode).

ALTER TABLE `items` ADD COLUMN `is_scrap_sale_item` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `system_settings` ADD COLUMN `scrap_sale_income_account_id` INTEGER NULL;
