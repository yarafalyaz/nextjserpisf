-- F-2026-10-22-085-S inti: status kepegawaian & siklus hidup karyawan.
-- Kolom aditif nullable di employees; tanpa backfill (baris lama NULL =
-- "belum diatur", BR-EMP-03). Kosakata divalidasi service:
-- employment_status PKWTT|PKWT|DAILY|INTERN (Q-EMP-1),
-- end_reason contract_completed|resigned|terminated|retired|deceased|other (Q-EMP-2).

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `employment_status` VARCHAR(191) NULL,
    ADD COLUMN `contract_start_date` DATETIME(3) NULL,
    ADD COLUMN `contract_end_date` DATETIME(3) NULL,
    ADD COLUMN `employment_ended_at` DATETIME(3) NULL,
    ADD COLUMN `end_reason` VARCHAR(191) NULL;
