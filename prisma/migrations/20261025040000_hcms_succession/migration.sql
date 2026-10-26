-- HCMS pilar perencanaan suksesi: jabatan kritis + kandidat pengganti.
-- Cakupan diturunkan dari kesiapan kandidat (ready_now = aman).

-- AlterTable
ALTER TABLE `positions` ADD COLUMN `is_critical` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `succession_candidates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `candidate_employee_id` INTEGER NOT NULL,
    `readiness` VARCHAR(191) NOT NULL DEFAULT 'ready_future',
    `rank` INTEGER NOT NULL DEFAULT 1,
    `notes` TEXT NULL,
    `assessed_by` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `succession_candidates_pair_key`(`position_id`, `candidate_employee_id`),
    INDEX `succession_candidates_candidate_id_fkey`(`candidate_employee_id`),
    INDEX `idx_succession_candidates_readiness`(`readiness`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `succession_candidates` ADD CONSTRAINT `succession_candidates_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `succession_candidates` ADD CONSTRAINT `succession_candidates_candidate_employee_id_fkey` FOREIGN KEY (`candidate_employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
