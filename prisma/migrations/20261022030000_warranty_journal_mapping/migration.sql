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
SELECT seed.`code`, seed.`name`, seed.`type`, seed.`report_group`, p.`id`, true, NOW(), NOW()
FROM (
  SELECT '510104' AS `code`, 'Beban Garansi' AS `name`, 'EXPENSE' AS `type`, 'COGS' AS `report_group`, '5101' AS `parent_code`
  UNION ALL SELECT '210205', 'Provisi Garansi', 'LIABILITY', 'OCLY', '2102'
  UNION ALL SELECT '110508', 'Piutang Klaim Supplier — Garansi', 'ASSET', 'OCAS', '1105'
) seed
JOIN `accounts` p ON p.`code` = seed.`parent_code`
WHERE NOT EXISTS (SELECT 1 FROM `accounts` a WHERE a.`code` = seed.`code`);
