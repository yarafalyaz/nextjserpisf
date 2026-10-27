-- HCMS pilar rekrutmen: lowongan, pelamar, riwayat tahapan seleksi.
-- Baris Employee lahir dari penerimaan pelamar (hired) — satu sumber data
-- karyawan untuk seluruh modul SDM, tanpa sinkronisasi antar-sistem.

-- CreateTable
CREATE TABLE `job_vacancies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `department_id` INTEGER NULL,
    `position_id` INTEGER NULL,
    `description` TEXT NULL,
    `requirements` TEXT NULL,
    `location` VARCHAR(191) NULL,
    `employment_type` VARCHAR(191) NULL,
    `quota` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `opened_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_vacancies_slug_key`(`slug`),
    UNIQUE INDEX `job_vacancies_code_key`(`code`),
    INDEX `job_vacancies_department_id_fkey`(`department_id`),
    INDEX `job_vacancies_position_id_fkey`(`position_id`),
    INDEX `idx_job_vacancies_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_applicants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `vacancy_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `cv_reference` VARCHAR(191) NULL,
    `stage` VARCHAR(191) NOT NULL DEFAULT 'applied',
    `notes` TEXT NULL,
    `hired_employee_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_applicants_slug_key`(`slug`),
    INDEX `job_applicants_vacancy_id_fkey`(`vacancy_id`),
    INDEX `idx_job_applicants_stage`(`stage`),
    INDEX `job_applicants_hired_employee_id_fkey`(`hired_employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `applicant_stage_histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicant_id` INTEGER NOT NULL,
    `from_stage` VARCHAR(191) NULL,
    `to_stage` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `changed_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `applicant_stage_histories_applicant_id_fkey`(`applicant_id`),
    INDEX `idx_applicant_stage_histories_created`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_vacancies` ADD CONSTRAINT `job_vacancies_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_vacancies` ADD CONSTRAINT `job_vacancies_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applicants` ADD CONSTRAINT `job_applicants_vacancy_id_fkey` FOREIGN KEY (`vacancy_id`) REFERENCES `job_vacancies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applicants` ADD CONSTRAINT `job_applicants_hired_employee_id_fkey` FOREIGN KEY (`hired_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applicant_stage_histories` ADD CONSTRAINT `applicant_stage_histories_applicant_id_fkey` FOREIGN KEY (`applicant_id`) REFERENCES `job_applicants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
