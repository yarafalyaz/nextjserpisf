-- F-2026-10-25-005-S DISC-B1 (spec §3, putusan Lead Q-DISC-1..4 2026-10-25):
-- rekod peringatan disiplin karyawan SP1/2/3 + SP pertama-dan-terakhir.
-- Aditif saja: 1 tabel baru. Tanpa backfill. Masa berlaku active|expired =
-- turunan issuedAt + 6 bulan kalender (src/lib/reports/disciplinary.ts),
-- bukan kolom. violationCategory = konstanta tervalidasi Q-DISC-1 di builder.
-- Rekod issued immutable: koreksi lewat rekod pembatal tertaut
-- (void_of_id unik + voided_at di rekod asal, BR-DISC-10).
-- Tanpa kolom nominal/gaji/status berhenti (BR-DISC-08/09).

-- CreateTable
CREATE TABLE `employee_disciplinary_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `employee_id` INTEGER NOT NULL,
    `level` VARCHAR(191) NOT NULL,
    `violation_category` VARCHAR(191) NOT NULL,
    `violation_date` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `regulation_reference` TEXT NULL,
    `workflow_status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `requested_by` INTEGER NOT NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `second_approved_by` INTEGER NULL,
    `second_approved_at` DATETIME(3) NULL,
    `issued_at` DATETIME(3) NULL,
    `document_no` VARCHAR(191) NULL,
    `rejection_reason` TEXT NULL,
    `acknowledgment_at` DATETIME(3) NULL,
    `acknowledgment_method` VARCHAR(191) NULL,
    `acknowledgment_refused` BOOLEAN NOT NULL DEFAULT false,
    `employee_response` TEXT NULL,
    `employee_response_at` DATETIME(3) NULL,
    `employee_response_late` BOOLEAN NOT NULL DEFAULT false,
    `void_of_id` INTEGER NULL,
    `voided_at` DATETIME(3) NULL,
    `voided_by` INTEGER NULL,
    `void_reason` TEXT NULL,
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employee_disciplinary_records_slug_key`(`slug`),
    UNIQUE INDEX `employee_disciplinary_records_document_no_key`(`document_no`),
    UNIQUE INDEX `employee_disciplinary_records_void_of_id_key`(`void_of_id`),
    INDEX `employee_disciplinary_records_employee_id_fkey`(`employee_id`),
    INDEX `idx_employee_disciplinary_records_status`(`workflow_status`),
    INDEX `idx_employee_disciplinary_records_requested_by`(`requested_by`),
    INDEX `idx_employee_disciplinary_records_violation_date`(`violation_date`),
    INDEX `employee_disciplinary_records_created_at_idx`(`created_at`),
    INDEX `employee_disciplinary_records_approved_by_idx`(`approved_by`),
    INDEX `employee_disciplinary_records_second_approved_by_idx`(`second_approved_by`),
    INDEX `employee_disciplinary_records_voided_by_idx`(`voided_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `employee_disciplinary_records` ADD CONSTRAINT `employee_disciplinary_records_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_disciplinary_records` ADD CONSTRAINT `employee_disciplinary_records_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_disciplinary_records` ADD CONSTRAINT `employee_disciplinary_records_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_disciplinary_records` ADD CONSTRAINT `employee_disciplinary_records_second_approved_by_fkey` FOREIGN KEY (`second_approved_by`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_disciplinary_records` ADD CONSTRAINT `employee_disciplinary_records_voided_by_fkey` FOREIGN KEY (`voided_by`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_disciplinary_records` ADD CONSTRAINT `employee_disciplinary_records_void_of_id_fkey` FOREIGN KEY (`void_of_id`) REFERENCES `employee_disciplinary_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
