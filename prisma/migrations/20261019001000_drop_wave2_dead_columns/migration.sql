-- Gelombang-2 kolom mati (docs/AUDIT-SCHEMA.md §3): 0 rujukan kode produk —
-- form /pengaturan/workflow tak mengekspos canSkip, skema validasi
-- workflowStepSchema tak punya field itu, engine approveStep tak membacanya;
-- aksi rekonsiliasi tak pernah menulis clearedDate maupun matchedType
-- (matchReconciliationLine/unmatch menulis matched boolean di item, bukan
-- cleared_date / matched_type; jenis kecocokan derivable dari item.type +
-- journalEntryId). cleared tetap (matematika outstanding completeReconciliation).
-- Idempoten karena dev dibuat via `prisma db push` (pola migrasi 2026101621/22).
SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `approval_workflow_steps` DROP COLUMN `can_skip`',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'approval_workflow_steps' AND column_name = 'can_skip');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `bank_reconciliation_items` DROP COLUMN `cleared_date`',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'bank_reconciliation_items' AND column_name = 'cleared_date');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `bank_statement_lines` DROP COLUMN `matched_type`',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'bank_statement_lines' AND column_name = 'matched_type');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
