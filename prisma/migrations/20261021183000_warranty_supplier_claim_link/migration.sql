-- F-2026-10-21-022: tautan klaim supplier part cacat di WarrantyClaim.
-- Tautan dokumen SAJA (vendor + retur pembelian + status recovery teks);
-- TANPA jurnal recovery/piutang klaim supplier (vonis accounting tahap 3).
-- Migrasi aditif: semua kolom baru nullable atau ber-default, tanpa backfill.

-- AlterTable
ALTER TABLE `warranty_claims` ADD COLUMN `supplier_claim_vendor_id` INTEGER NULL,
    ADD COLUMN `purchase_return_id` INTEGER NULL,
    ADD COLUMN `supplier_claim_status` VARCHAR(191) NOT NULL DEFAULT 'none',
    ADD COLUMN `supplier_claim_ref_no` VARCHAR(191) NULL,
    ADD COLUMN `supplier_claim_notes` TEXT NULL,
    ADD COLUMN `supplier_claim_by` INTEGER NULL,
    ADD COLUMN `supplier_claim_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `warranty_claims_supplier_claim_vendor_id_idx` ON `warranty_claims`(`supplier_claim_vendor_id`);

-- CreateIndex
CREATE INDEX `warranty_claims_purchase_return_id_idx` ON `warranty_claims`(`purchase_return_id`);

-- AddForeignKey
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_supplier_claim_vendor_id_fkey` FOREIGN KEY (`supplier_claim_vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_purchase_return_id_fkey` FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_returns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
