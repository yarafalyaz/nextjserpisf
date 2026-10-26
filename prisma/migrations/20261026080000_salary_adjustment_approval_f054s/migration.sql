-- F-2026-10-26-054-S Jalur A (putusan Lead Q-SA-1/2/3, vonis Accountant
-- V-SA-1..6): gerbang persetujuan penyesuaian gaji. Aditif murni: kolom
-- keputusan nullable + default status lahir berubah scheduled -> menunggu.
-- Baris existing tidak diubah (yang sudah scheduled tetap terjadwal sah;
-- hanya baris BARU yang lahir menunggu persetujuan). applyDue tetap hanya
-- mengambil status scheduled — mesin pajak/payroll tidak disentuh.

-- AlterTable
ALTER TABLE `salary_adjustments` ADD COLUMN `approved_by` INTEGER NULL,
    ADD COLUMN `rejected_by` INTEGER NULL,
    ADD COLUMN `rejection_reason` TEXT NULL,
    ADD COLUMN `decided_at` DATETIME(3) NULL,
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'menunggu';
