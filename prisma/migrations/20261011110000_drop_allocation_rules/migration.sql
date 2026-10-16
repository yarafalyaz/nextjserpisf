-- Buang `allocation_rules` yang cuma dipakai untuk melewati `add_slug_columns`.
--
-- Model `AllocationRule` sudah dihapus dari schema.prisma (0 rujukan), jadi setelah
-- `add_slug_columns` selesai menambahkan kolom slug ke tabel itu, tabelnya harus
-- hilang lagi supaya keadaan akhir DB sama dengan skema (tidak meninggalkan tabel
-- yatim). Lihat `20261011000000_missing_base_tables` butir 9.
--
-- Idempoten.

SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'allocation_rules');
SET @s := IF(@c = 1, 'DROP TABLE `allocation_rules`', 'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
