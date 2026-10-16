-- Buang kolom terakhir dari kelompok hook: nilainya 6 baris, TETAPI semuanya 1.000000
-- (default tanpa informasi; tiap UoM ber-`base_unit_id` NULL = basis bagi dirinya).
-- Konsisten dengan 10 kolom sebelumnya: 0 rujukan kode, 0 informasi (lihat docs/AUDIT-SCHEMA.md).
SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'unit_of_measures' AND column_name = 'conversion_factor');
SET @s := IF(@t = 1, 'ALTER TABLE `unit_of_measures` DROP COLUMN `conversion_factor`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
