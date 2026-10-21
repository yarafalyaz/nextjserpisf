-- F-2026-10-21-009-V (vonis BOT 4): tutup job WO/ProductionOrder.
-- Status 'closed' BARU terpisah dari 'completed'; transisi sah hanya
-- completed -> closed, reopen closed -> completed. Kolom aditif nullable,
-- tanpa backfill status (job completed lama tetap completed sampai
-- operator menutup eksplisit). Tanpa jurnal/akun/permission baru.

-- AlterTable
ALTER TABLE `production_orders` ADD COLUMN `closed_at` DATETIME(3) NULL,
    ADD COLUMN `closed_by` INTEGER NULL,
    ADD COLUMN `closed_reason` TEXT NULL,
    ADD COLUMN `reopened_at` DATETIME(3) NULL,
    ADD COLUMN `reopened_by` INTEGER NULL,
    ADD COLUMN `reopen_reason` TEXT NULL;

-- AlterTable
ALTER TABLE `work_orders` ADD COLUMN `closed_at` DATETIME(3) NULL,
    ADD COLUMN `closed_by` INTEGER NULL,
    ADD COLUMN `closed_reason` TEXT NULL,
    ADD COLUMN `reopened_at` DATETIME(3) NULL,
    ADD COLUMN `reopened_by` INTEGER NULL,
    ADD COLUMN `reopen_reason` TEXT NULL;
