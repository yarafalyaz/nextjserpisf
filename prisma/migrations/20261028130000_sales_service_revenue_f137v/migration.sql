-- F-2026-10-28-137-V V1 (SAL-BR-013): akun pendapatan jasa.
-- Aditif saja: kolom nullable TANPA default tebak (kosong = posting faktur
-- berjasa ditolak fail-closed; automap instalasi menebak 400002).

ALTER TABLE `system_settings` ADD COLUMN `sales_service_revenue_account_id` INTEGER NULL;
