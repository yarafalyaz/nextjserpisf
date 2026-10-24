-- F-2026-10-23-127-V Putusan 2 (vonis BOT 4, PR #654): unik jurnal hanya
-- mengikat jurnal AKTIF. Jurnal REVERSED / soft-deleted berhenti memegang
-- (reference_type, reference_id) supaya posting ulang sesudah reversal sah
-- (YearEndClosing F-121-V Putusan 3, E121-8). Anti-dobel POSTED tetap fisik.
--
-- Generated STORED: CASE mengikat SEMUA status kecuali REVERSED
-- (DRAFT ikut terblokir — Putusan 1, koreksi atas draf POSTED-saja).
-- Panjang diukur, bukan ditebak: reference_type terpanjang di kode
-- `ProductionOrderCostVariance` = 27 char; reference_id Int maks 10 digit
-- -> 27 + 1 + 10 = 38, jauh di bawah 191.
--
-- Catatan penerapan: `prisma migrate deploy` mem-parse/menjalankan file
-- ini lewat koneksi MySQL standar (bukan klien mysql CLI), jadi
-- `DELIMITER`/stored-procedure TIDAK dipakai — Prisma membelah pernyataan
-- di `;`. Pre-check gagal-berisik (E127-6) memakai dynamic SQL PREPARE:
-- bila >1 baris aktif se-reference ada, pernyataan yang disiapkan merujuk
-- tabel provokatif yang sengaja tidak ada; PREPARE sendiri lolos, EXECUTE
-- meledak 1146 dan deploy berhenti TANPA mengubah satu baris pun. Tanpa
-- pelanggar, EXECUTE menjalankan `SELECT 1`. Operator perbaiki data lalu
-- jalankan ulang; daftar pelanggar: query di body PR.
SET @f127v_dup := (
  SELECT COUNT(*) FROM (
    SELECT 1 FROM `journals`
    WHERE `deleted_at` IS NULL AND `status` <> 'REVERSED'
      AND `reference_type` IS NOT NULL AND `reference_id` IS NOT NULL
    GROUP BY `reference_type`, `reference_id` HAVING COUNT(*) > 1
  ) dup
);
SET @f127v_sql := IF(
  @f127v_dup > 0,
  'SELECT 1 FROM `f127v_DUPLICATE_ACTIVE_JOURNAL_REFERENCE_MIGRATION_MUST_STOP`',
  'SELECT 1'
);
PREPARE f127v_stmt FROM @f127v_sql;
EXECUTE f127v_stmt;
DEALLOCATE PREPARE f127v_stmt;

ALTER TABLE `journals` DROP INDEX `journals_reference_unique`;

ALTER TABLE `journals` ADD COLUMN `active_reference_key` VARCHAR(191) GENERATED ALWAYS AS (
  CASE
    WHEN `status` <> 'REVERSED' AND `deleted_at` IS NULL
      AND `reference_type` IS NOT NULL AND `reference_id` IS NOT NULL
    THEN CONCAT(`reference_type`, '#', `reference_id`)
    ELSE NULL
  END
) STORED;

CREATE UNIQUE INDEX `journals_active_reference_unique` ON `journals`(`active_reference_key`);
