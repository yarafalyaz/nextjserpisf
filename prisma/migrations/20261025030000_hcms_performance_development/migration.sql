-- HCMS pilar penilaian kinerja + kompetensi/pelatihan.
-- Penilai bawaan mengikuti pohon organisasi (employees.manager_id);
-- kebutuhan pelatihan diturunkan dari selisih level syarat jabatan
-- vs level aktual karyawan.

-- CreateTable
CREATE TABLE `performance_cycles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `performance_cycles_slug_key`(`slug`),
    INDEX `idx_performance_cycles_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `performance_goals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cycle_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `target` TEXT NULL,
    `weight` INTEGER NOT NULL DEFAULT 1,
    `achievement` TEXT NULL,
    `score` DECIMAL(5, 2) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `performance_goals_cycle_id_fkey`(`cycle_id`),
    INDEX `performance_goals_employee_id_fkey`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `performance_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `cycle_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `reviewer_employee_id` INTEGER NULL,
    `self_score` DECIMAL(5, 2) NULL,
    `manager_score` DECIMAL(5, 2) NULL,
    `final_score` DECIMAL(5, 2) NULL,
    `strengths` TEXT NULL,
    `improvements` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `performance_reviews_slug_key`(`slug`),
    UNIQUE INDEX `performance_reviews_cycle_employee_key`(`cycle_id`, `employee_id`),
    INDEX `performance_reviews_employee_id_fkey`(`employee_id`),
    INDEX `performance_reviews_reviewer_id_fkey`(`reviewer_employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competencies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `competencies_slug_key`(`slug`),
    UNIQUE INDEX `competencies_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `position_competencies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `position_id` INTEGER NOT NULL,
    `competency_id` INTEGER NOT NULL,
    `required_level` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `position_competencies_pair_key`(`position_id`, `competency_id`),
    INDEX `position_competencies_competency_id_fkey`(`competency_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_competencies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `competency_id` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `assessed_by` INTEGER NULL,
    `assessed_at` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employee_competencies_pair_key`(`employee_id`, `competency_id`),
    INDEX `employee_competencies_competency_id_fkey`(`competency_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trainings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NULL,
    `location` VARCHAR(191) NULL,
    `cost` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `trainings_slug_key`(`slug`),
    INDEX `idx_trainings_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `training_participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `training_id` INTEGER NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'registered',
    `score` DECIMAL(5, 2) NULL,
    `certificate_ref` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `training_participants_pair_key`(`training_id`, `employee_id`),
    INDEX `training_participants_employee_id_fkey`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `performance_goals` ADD CONSTRAINT `performance_goals_cycle_id_fkey` FOREIGN KEY (`cycle_id`) REFERENCES `performance_cycles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `performance_goals` ADD CONSTRAINT `performance_goals_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `performance_reviews` ADD CONSTRAINT `performance_reviews_cycle_id_fkey` FOREIGN KEY (`cycle_id`) REFERENCES `performance_cycles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `performance_reviews` ADD CONSTRAINT `performance_reviews_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `performance_reviews` ADD CONSTRAINT `performance_reviews_reviewer_id_fkey` FOREIGN KEY (`reviewer_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `position_competencies` ADD CONSTRAINT `position_competencies_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `position_competencies` ADD CONSTRAINT `position_competencies_competency_id_fkey` FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `employee_competencies` ADD CONSTRAINT `employee_competencies_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `employee_competencies` ADD CONSTRAINT `employee_competencies_competency_id_fkey` FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `training_participants` ADD CONSTRAINT `training_participants_training_id_fkey` FOREIGN KEY (`training_id`) REFERENCES `trainings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `training_participants` ADD CONSTRAINT `training_participants_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
