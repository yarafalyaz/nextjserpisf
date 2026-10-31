-- Peristiwa perubahan aset TERJURNAL ke-2 dst untuk aset yang sama selalu
-- gagal: jurnal peristiwa memakai referenceId = assetId (satu aset banyak
-- peristiwa), tetapi generated key unik F-127-V mengikat COMPOSITE
-- (reference_type, reference_id) — jurnal pertama mengklaim selamanya
-- selama aktif. F-127-V Putusan 2 sendiri melarang dua jurnal aktif untuk
-- DOKUMEN yang sama; peristiwa adalah dokumen berurutan, bukan replay.
--
-- Kunci aktif kini menyertakan nomor jurnal (`journal_number`, @unique
-- per baris) supaya tidak pernah bertabrakan antar-jurnal BERBEDA, dan
-- tetap NULL untuk jurnal REVERSED/terhapus — properti yang dipakai
-- posting ulang sesudah reversal (YearEndClosing) dan anti-replay
-- dokumen. Pre-check gagal-berisik: bila sudah ada dua jurnal aktif
-- berpasangan (type,id) sama di luar pasca-ekspresi, deploy berhenti
-- tanpa mengubah apa pun (pelanggaran dihitung SEBELUM ALTER, dan
-- pernyataan provokatif meledakkan EXECUTE saja).

SET @refkey_dup := (
  SELECT COUNT(*) FROM (
    SELECT 1 FROM `journals`
    WHERE `deleted_at` IS NULL AND `status` <> 'REVERSED'
      AND `reference_type` IS NOT NULL AND `reference_id` IS NOT NULL
    GROUP BY `reference_type`, `reference_id`, `journal_number` HAVING COUNT(*) > 1
  ) dup
);
SET @refkey_sql := IF(
  @refkey_dup > 0,
  'SELECT 1 FROM `journal_active_reference_key_expression_DUPLICATE_MIGRATION_MUST_STOP`',
  'SELECT 1'
);
PREPARE refkey_stmt FROM @refkey_sql;
EXECUTE refkey_stmt;
DEALLOCATE PREPARE refkey_stmt;

ALTER TABLE `journals`
  MODIFY COLUMN `active_reference_key` VARCHAR(191) GENERATED ALWAYS AS (
    CASE
      WHEN `status` <> 'REVERSED' AND `deleted_at` IS NULL
        AND `reference_type` IS NOT NULL AND `reference_id` IS NOT NULL
      THEN CONCAT(`reference_type`, '#', `reference_id`, '#', `journal_number`)
      ELSE NULL
    END
  ) STORED;
