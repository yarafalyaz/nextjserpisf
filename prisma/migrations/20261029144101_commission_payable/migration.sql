-- Tahap 3 komisi (vonis R-komisi-vonispayable): subledger CommissionPayable
-- + 2 mapping SystemSetting (fail-closed, nullable tanpa default).
-- Disalin dari DDL hasil `prisma db push` (kebenaran Prisma) agar verify drift 0.

CREATE TABLE `commission_payables` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sales_invoice_id` int NOT NULL,
  `sales_employee_id` int NOT NULL,
  `accrued_amount` decimal(15,2) NOT NULL,
  `reversal_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `accrual_journal_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_commission_payable_invoice_employee` (`sales_invoice_id`,`sales_employee_id`),
  KEY `idx_commission_payable_employee` (`sales_employee_id`),
  KEY `commission_payables_accrual_journal_id_fkey` (`accrual_journal_id`),
  CONSTRAINT `commission_payables_accrual_journal_id_fkey` FOREIGN KEY (`accrual_journal_id`) REFERENCES `journals` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commission_payables_sales_employee_id_fkey` FOREIGN KEY (`sales_employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commission_payables_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `system_settings`
  ADD COLUMN `commission_expense_account_id` int NULL,
  ADD COLUMN `commission_payable_account_id` int NULL;
