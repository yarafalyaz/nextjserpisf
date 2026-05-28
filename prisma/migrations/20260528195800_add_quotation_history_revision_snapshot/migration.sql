ALTER TABLE `quotation_histories`
  ADD COLUMN `revision_number` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `status_at_snapshot` VARCHAR(191) NOT NULL DEFAULT 'sent',
  ADD COLUMN `data_snapshot` JSON NULL,
  ADD COLUMN `change_reason` TEXT NULL;
