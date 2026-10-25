-- F-2026-10-25-017-S (spec Business PR #821) + vonis F-2026-10-25-018-V
-- (PR #822): klaim reimbursement karyawan di atas Expense existing.
-- Aditif saja: penanda klaim + kolom setting akun liabilitas nullable
-- TANPA default tebak (kosong = approve klaim ditolak fail-closed,
-- vonis 018-V Putusan 3). employee_id existing kini berelasi Employee
-- (FK baru dicipta Prisma; baris lama employee_id NULL tetap sah).
-- Tanpa tabel/model baru, tanpa dokumen bayar kedua, tanpa backfill.

ALTER TABLE `expenses` ADD COLUMN `is_reimbursement_claim` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `system_settings` ADD COLUMN `reimbursement_liability_account_id` INTEGER NULL;
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
