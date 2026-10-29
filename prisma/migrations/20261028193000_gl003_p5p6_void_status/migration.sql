-- GL-BR-003 GL003-P5/P6 (vonis t_16159d89 V-P5/P6-1, V-P5/P6-6): void berstatus
-- aditif saja. BankTransfer + PettyCash dapat kolom status/voidAt/voidReason
-- + deletedAt (PettyCash) supaya baris void dipertahankan sebagai audit trail
-- dan terbaca read-model; jurnal lawan dibuat helper reversal, bukan hapus fisik.
-- Baris lama otomatis 'posted' (bukan void).

-- AlterTable
ALTER TABLE `bank_transfers` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    ADD COLUMN `void_at` DATETIME(3) NULL,
    ADD COLUMN `void_reason` TEXT NULL;

-- AlterTable
ALTER TABLE `petty_cash` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    ADD COLUMN `void_at` DATETIME(3) NULL,
    ADD COLUMN `void_reason` TEXT NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `bank_transfers_status_idx` ON `bank_transfers`(`status`);

-- CreateIndex
CREATE INDEX `petty_cash_status_idx` ON `petty_cash`(`status`);

-- CreateIndex
CREATE INDEX `petty_cash_deleted_at_idx` ON `petty_cash`(`deleted_at`);
