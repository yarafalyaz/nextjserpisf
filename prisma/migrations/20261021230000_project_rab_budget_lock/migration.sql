-- F-2026-10-21-030 (RAB proyek): snapshot kontrak + kunci anggaran + revisi.
-- Migrasi aditif murni: semua kolom baru nullable atau ber-default, tanpa
-- backfill. ProjectItem selama ini yatim (tanpa konsumen di src), jadi
-- kolom tahap/kategori baru tidak mengubah baris berjalan.
-- Project.contractQuotationId -> Quotation ON DELETE SET NULL: snapshot
-- contractAmount TIDAK ikut hilang bila quotation sumber dihapus (BR-06).
-- ProjectItem.projectStageId -> ProjectStage ON DELETE RESTRICT: tahap
-- yang dirujuk baris RAB tidak bisa dihapus meninggalkan baris yatim
-- (BR-07); deleteProject tetap lolos karena items ikut cascade dari
-- Project lebih dulu (dibuktikan tes deleteProject proyek ber-RAB).

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `budget_locked_at` DATETIME(3) NULL,
    ADD COLUMN `budget_locked_by` INTEGER NULL,
    ADD COLUMN `budget_revision_no` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `contract_amount` DECIMAL(15, 2) NULL,
    ADD COLUMN `contract_quotation_id` INTEGER NULL,
    ADD COLUMN `contract_set_at` DATETIME(3) NULL,
    ADD COLUMN `contract_set_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `project_items` ADD COLUMN `category` VARCHAR(191) NULL,
    ADD COLUMN `project_stage_id` INTEGER NULL,
    ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `project_logs` ADD COLUMN `details` JSON NULL;

-- CreateIndex
CREATE INDEX `projects_contract_quotation_id_fkey` ON `projects`(`contract_quotation_id`);

-- CreateIndex
CREATE INDEX `projects_contract_set_by_idx` ON `projects`(`contract_set_by`);

-- CreateIndex
CREATE INDEX `projects_budget_locked_by_idx` ON `projects`(`budget_locked_by`);

-- CreateIndex
CREATE INDEX `project_items_project_stage_id_fkey` ON `project_items`(`project_stage_id`);

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_contract_quotation_id_fkey` FOREIGN KEY (`contract_quotation_id`) REFERENCES `quotations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_project_stage_id_fkey` FOREIGN KEY (`project_stage_id`) REFERENCES `project_stages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
