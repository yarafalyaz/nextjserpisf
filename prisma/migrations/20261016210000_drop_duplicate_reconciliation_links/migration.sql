-- Kolom penaut rekonsiliasi yang duplikat: pencocokan bank SEBENARNYA dicatat di
-- `bank_reconciliation_items.journal_entry_id` (ditulis `matchReconciliationLine`).
-- Empat kolom di bawah tak pernah ditulis aplikasi mana pun dan kosong (0 baris),
-- tetapi sempat menyesatkan analisis (terlihat seperti "jejak audit yang hilang").
-- Dijaga idempoten karena tabel/kolom dev dibuat lewat `prisma db push`.
SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `bank_statement_lines` DROP COLUMN `matched_journal_id`, DROP COLUMN `matched_payment_id`',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'bank_statement_lines' AND column_name = 'matched_journal_id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `bank_reconciliation_items` DROP COLUMN `related_journal_id`, DROP COLUMN `related_payment_id`',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'bank_reconciliation_items' AND column_name = 'related_journal_id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
