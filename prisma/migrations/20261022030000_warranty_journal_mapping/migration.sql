-- F-2026-10-21-021 tahap 3 rute provisi MATI (vonis BOT 4 + PUTUSAN G1 Lead):
-- 3 kolom mapping jurnal garansi di system_settings (nullable, tanpa default
-- tebak — posting garansi fail-closed bila kosong) + 3 akun CoA garansi untuk
-- instalasi berjalan. Akun hanya disisipkan bila kode belum ada dan akun induk
-- (5101/2102/1105) tersedia; instalasi baru mendapatkannya dari
-- CHART_OF_ACCOUNTS (src/lib/setup/base-data.ts).

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `warranty_expense_account_id` INTEGER NULL;
ALTER TABLE `system_settings` ADD COLUMN `warranty_provision_account_id` INTEGER NULL;
ALTER TABLE `system_settings` ADD COLUMN `supplier_claim_receivable_account_id` INTEGER NULL;

-- Akun garansi instalasi berjalan (idempoten per kode unik accounts.code).
INSERT INTO `accounts` (`code`, `name`, `type`, `report_group`, `parent_id`, `is_active`, `created_at`, `updated_at`)
SELECT '510104', 'Beban Garansi', 'EXPENSE', 'COGS', p.`id`, true, NOW(), NOW()
FROM `accounts` p
WHERE p.`code` = '5101'
  AND NOT EXISTS (SELECT 1 FROM `accounts` a WHERE a.`code` = '510104')
LIMIT 1;

INSERT INTO `accounts` (`code`, `name`, `type`, `report_group`, `parent_id`, `is_active`, `created_at`, `updated_at`)
SELECT '210205', 'Provisi Garansi', 'LIABILITY', 'OCLY', p.`id`, true, NOW(), NOW()
FROM `accounts` p
WHERE p.`code` = '2102'
  AND NOT EXISTS (SELECT 1 FROM `accounts` a WHERE a.`code` = '210205')
LIMIT 1;

INSERT INTO `accounts` (`code`, `name`, `type`, `report_group`, `parent_id`, `is_active`, `created_at`, `updated_at`)
SELECT '110508', 'Piutang Klaim Supplier — Garansi', 'ASSET', 'OCAS', p.`id`, true, NOW(), NOW()
FROM `accounts` p
WHERE p.`code` = '1105'
  AND NOT EXISTS (SELECT 1 FROM `accounts` a WHERE a.`code` = '110508')
LIMIT 1;
