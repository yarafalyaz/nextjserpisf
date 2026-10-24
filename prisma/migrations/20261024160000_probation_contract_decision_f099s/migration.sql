-- F-2026-10-24-099-S inti (putusan Q-PROB-1/2/3/6 t_a52e310b): evaluasi masa
-- percobaan PKWTT + pengajuan keputusan kontrak PKWT.
-- Aditif saja: 1 kolom nullable di employees + 2 tabel baru. Tanpa backfill
-- (probation_end_date NULL = tidak dalam percobaan; mulai percobaan =
-- joinDate sumber tunggal Q-PROB-1, tanpa kolom mulai kedua).
-- Kosakata tertutup divalidasi aksi (src/actions/probation.actions.ts):
-- skor {perlu_perhatian,cukup,baik}, rekomendasi
-- {lanjut,perhatian_khusus,tidak_lulus_diusulkan}, tanpa nominal (BR-PROB-11).

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `probation_end_date` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `probation_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `employee_id` INTEGER NOT NULL,
    `milestone` VARCHAR(191) NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `reviewer_employee_id` INTEGER NOT NULL,
    `technical_score` VARCHAR(191) NULL,
    `discipline_score` VARCHAR(191) NULL,
    `attendance_score` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `recommendation` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `final_decision` VARCHAR(191) NULL,
    `decided_by` INTEGER NULL,
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `probation_reviews_slug_key`(`slug`),
    INDEX `probation_reviews_employee_id_fkey`(`employee_id`),
    INDEX `probation_reviews_reviewer_employee_id_fkey`(`reviewer_employee_id`),
    INDEX `idx_probation_reviews_status`(`status`),
    INDEX `idx_probation_reviews_due_date`(`due_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_decision_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `employee_id` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `proposed_contract_end_date` DATETIME(3) NULL,
    `reason` TEXT NOT NULL,
    `requested_by` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `decided_by` INTEGER NULL,
    `decided_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `applied_at` DATETIME(3) NULL,
    `applied_by` INTEGER NULL,
    `applied_from_start_date` DATETIME(3) NULL,
    `applied_end_date` DATETIME(3) NULL,
    `final_review_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contract_decision_requests_slug_key`(`slug`),
    INDEX `contract_decision_requests_employee_id_fkey`(`employee_id`),
    INDEX `idx_contract_decision_requests_status`(`status`),
    INDEX `idx_contract_decision_requests_requested_by`(`requested_by`),
    INDEX `contract_decision_requests_final_review_id_fkey`(`final_review_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `probation_reviews` ADD CONSTRAINT `probation_reviews_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `probation_reviews` ADD CONSTRAINT `probation_reviews_reviewer_employee_id_fkey` FOREIGN KEY (`reviewer_employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_decision_requests` ADD CONSTRAINT `contract_decision_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_decision_requests` ADD CONSTRAINT `contract_decision_requests_final_review_id_fkey` FOREIGN KEY (`final_review_id`) REFERENCES `probation_reviews`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
