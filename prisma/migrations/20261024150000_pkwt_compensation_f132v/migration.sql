-- F-2026-10-24-132-V: inti kompensasi akhir kontrak PKWT PP 35/2021.
-- Aditif saja: kolom nullable baru + tabel baru, tanpa backfill.
-- Baris lama: mapping kompensasi NULL = belum dipetakan (fail-closed);
-- peristiwa/akrual kosong sampai fitur dipakai.

ALTER TABLE `system_settings`
  ADD COLUMN `pkwt_compensation_expense_account_id` INTEGER NULL,
  ADD COLUMN `pkwt_compensation_payable_account_id` INTEGER NULL;

ALTER TABLE `payroll_component_lines`
  ADD COLUMN `pkwt_event_id` INTEGER NULL,
  ADD COLUMN `pkwt_settled_via_accrual` BOOLEAN NULL,
  ADD UNIQUE INDEX `payroll_component_lines_pkwt_event_id_key` (`pkwt_event_id`),
  ADD INDEX `payroll_component_lines_pkwt_event_id_idx` (`pkwt_event_id`);

CREATE TABLE `pkwt_compensation_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `segment_start` DATETIME(3) NOT NULL,
  `segment_end` DATETIME(3) NOT NULL,
  `service_months` DECIMAL(10, 4) NOT NULL,
  `base_salary_snapshot` DECIMAL(15, 2) NOT NULL,
  `fixed_allowance_snapshot` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `basis_monthly` DECIMAL(15, 2) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `is_legacy` BOOLEAN NOT NULL DEFAULT false,
  `agreement_document_ref` VARCHAR(191) NULL,
  `corrects_event_id` INTEGER NULL,
  `approved_by` INTEGER NULL,
  `approved_at` DATETIME(3) NULL,
  `paid_payroll_id` INTEGER NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `pkwt_compensation_events_employee_id_idx` (`employee_id`),
  INDEX `pkwt_compensation_events_status_idx` (`status`),
  INDEX `pkwt_compensation_events_segment_start_segment_end_idx` (`segment_start`, `segment_end`),
  INDEX `pkwt_compensation_events_corrects_event_id_idx` (`corrects_event_id`),
  INDEX `pkwt_compensation_events_created_at_idx` (`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `pkwt_compensation_accruals` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `event_id` INTEGER NULL,
  `segment_start` DATETIME(3) NOT NULL,
  `period` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `basis_monthly` DECIMAL(15, 2) NOT NULL,
  `journal_id` INTEGER NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uq_pkwt_accrual_emp_segment_period` (`employee_id`, `segment_start`, `period`),
  INDEX `pkwt_compensation_accruals_employee_id_idx` (`employee_id`),
  INDEX `pkwt_compensation_accruals_event_id_idx` (`event_id`),
  INDEX `pkwt_compensation_accruals_period_idx` (`period`),
  INDEX `pkwt_compensation_accruals_created_at_idx` (`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pkwt_compensation_events`
  ADD CONSTRAINT `pkwt_compensation_events_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `pkwt_compensation_events_corrects_event_id_fkey` FOREIGN KEY (`corrects_event_id`) REFERENCES `pkwt_compensation_events` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `pkwt_compensation_accruals`
  ADD CONSTRAINT `pkwt_compensation_accruals_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `pkwt_compensation_accruals_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `pkwt_compensation_events` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payroll_component_lines`
  ADD CONSTRAINT `payroll_component_lines_pkwt_event_id_fkey` FOREIGN KEY (`pkwt_event_id`) REFERENCES `pkwt_compensation_events` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
