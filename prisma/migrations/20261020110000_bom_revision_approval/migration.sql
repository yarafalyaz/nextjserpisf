-- Approval formula produksi sebelum release (Accurate ACC-15901):
-- draft -> pending_approval -> approved -> released. Kolom aditif nullable —
-- revisi lama released/superseded tetap sah, tanpa backfill status.
ALTER TABLE `bom_revisions`
  ADD COLUMN `submitted_at` DATETIME(3) NULL,
  ADD COLUMN `submitted_by` INTEGER NULL,
  ADD COLUMN `approved_at` DATETIME(3) NULL,
  ADD COLUMN `approved_by` INTEGER NULL,
  ADD COLUMN `rejected_at` DATETIME(3) NULL,
  ADD COLUMN `rejected_by` INTEGER NULL,
  ADD COLUMN `rejection_reason` TEXT NULL;
