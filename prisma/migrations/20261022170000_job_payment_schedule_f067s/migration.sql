-- F-2026-10-22-067-S inti: jadwal termin per Quotation (putusan BOT 1
-- Q-TM67-1/3/5 + vonis BOT 4 F-2026-10-22-072-V). Dua tabel aditif
-- baru; tanpa backfill (quotation lama tanpa jadwal = perilaku kartu
-- existing persis, BR-TM67-09). Jadwal tidak menerbitkan dokumen
-- uang apa pun; dueDate baris bukan input aging.

-- CreateTable
CREATE TABLE `job_payment_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quotation_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'aktif',
    `amendment_reason` TEXT NULL,
    `amended_by` INTEGER NULL,
    `amended_at` DATETIME(3) NULL,
    `cancel_reason` TEXT NULL,
    `cancelled_by` INTEGER NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `job_payment_schedules_quotation_id_status_idx`(`quotation_id`, `status`),
    INDEX `job_payment_schedules_created_by_idx`(`created_by`),
    INDEX `job_payment_schedules_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_payment_schedule_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `schedule_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `cumulative_percent` DECIMAL(5, 2) NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `milestone_label` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `job_payment_schedule_terms_schedule_id_sort_order_idx`(`schedule_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_payment_schedules` ADD CONSTRAINT `job_payment_schedules_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_payment_schedule_terms` ADD CONSTRAINT `job_payment_schedule_terms_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `job_payment_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
