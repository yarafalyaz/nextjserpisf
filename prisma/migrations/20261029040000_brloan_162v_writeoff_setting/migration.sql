-- F-2026-10-29-162-V (c): setting akun beban write-off piutang karyawan
-- (default diarahkan 720007 saat install/seed). Aditif saja, nullable.
ALTER TABLE `system_settings` ADD COLUMN `employee_loan_write_off_expense_account_id` INTEGER NULL;
