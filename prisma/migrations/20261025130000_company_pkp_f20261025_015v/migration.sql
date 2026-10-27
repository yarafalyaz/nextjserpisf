-- F-2026-10-25-015-V: gerbang PKP perusahaan untuk FP UM (vonis PR #802).
-- Status PKP perusahaan = nilai kini + tanggal mulai kewajiban di
-- system_settings; snapshot status yang dipakai gerbang dibekukan di
-- down_payments. Kolom nullable aditif; status default 'unknown'
-- (belum ditetapkan, TIDAK diturunkan dari company_tax_id) supaya
-- install existing tidak ditebak statusnya.

ALTER TABLE `system_settings` ADD COLUMN `company_pkp_status` VARCHAR(16) NOT NULL DEFAULT 'unknown';
ALTER TABLE `system_settings` ADD COLUMN `company_pkp_effective_from` DATETIME(3) NULL;
ALTER TABLE `system_settings` ADD COLUMN `company_pkp_source` VARCHAR(191) NULL;

ALTER TABLE `down_payments` ADD COLUMN `company_pkp_status_snapshot` VARCHAR(16) NULL;
ALTER TABLE `down_payments` ADD COLUMN `company_pkp_effective_from_snapshot` DATETIME(3) NULL;
