-- Tahap 3 komisi bayar: baris slip menaut subledger (1-1, idempoten).
ALTER TABLE `payroll_component_lines`
  ADD COLUMN `commission_payable_id` int DEFAULT NULL,
  ADD COLUMN `commission_invoice_id` int DEFAULT NULL,
  ADD UNIQUE KEY `payroll_component_lines_commission_payable_id_key` (`commission_payable_id`),
  ADD CONSTRAINT `payroll_component_lines_commission_payable_id_fkey` FOREIGN KEY (`commission_payable_id`) REFERENCES `commission_payables` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
