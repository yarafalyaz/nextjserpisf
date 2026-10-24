-- F-2026-10-22-063-S (induk F-2026-10-21-023): snapshot PERINGATAN fitment
-- per baris Quotation/WO. Kolom aditif nullable, tanpa backfill: baris lama
-- tetap null (= belum dievaluasi); snapshot terisi saat baris disimpan ulang.
-- fitment_result: compatible | incompatible | unknown (String pola repo).

-- AlterTable
ALTER TABLE `quotation_items` ADD COLUMN `fitment_result` VARCHAR(191) NULL,
    ADD COLUMN `fitment_rule_id` INTEGER NULL,
    ADD COLUMN `fitment_evaluated_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `work_order_items` ADD COLUMN `fitment_result` VARCHAR(191) NULL,
    ADD COLUMN `fitment_rule_id` INTEGER NULL,
    ADD COLUMN `fitment_evaluated_at` DATETIME(3) NULL;
