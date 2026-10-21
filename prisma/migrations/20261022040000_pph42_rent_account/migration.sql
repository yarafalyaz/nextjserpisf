-- F-2026-10-22-038 + F-041 (vonis BOT 4, PR #394): akun liabilitas PPh 4(2)
-- final sewa tanah/bangunan untuk instalasi berjalan. 210206 KHUSUS potongan
-- sewa PP 34/2017 — 210205 tetap Provisi Garansi (F-021), dilarang reuse.
-- Idempoten per kode unik accounts.code; instalasi baru mendapatkannya dari
-- CHART_OF_ACCOUNTS (src/lib/setup/base-data.ts). Jenis PPH42-SEWA sendiri
-- di-seed aplikasi (seedWithholdingTaxTypes / prisma/seed.ts), bukan di sini,
-- supaya tautan akun terisi dari kode lewat jalur seed existing.

INSERT INTO `accounts` (`code`, `name`, `type`, `report_group`, `parent_id`, `is_active`, `created_at`, `updated_at`)
SELECT '210206', 'Utang PPh 4(2) Sewa Tanah/Bangunan', 'LIABILITY', 'OCLY', p.`id`, true, NOW(), NOW()
FROM `accounts` p
WHERE p.`code` = '2102'
  AND NOT EXISTS (SELECT 1 FROM `accounts` a WHERE a.`code` = '210206')
LIMIT 1;
