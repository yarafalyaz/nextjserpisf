-- F-2026-10-25-010-S (putusan Lead Q-AC-1/2/3 2026-10-26): pengajuan koreksi
-- absensi karyawan (self -> persetujuan -> rekod induk). Aditif saja: 1 tabel
-- baru attendance_corrections. Tanpa backfill, tanpa ubah tabel existing.
-- Snapshot* = nilai Attendance berjalan saat pengajuan dibuat (NULL =
-- rekod belum ada) untuk deteksi konflik EC-1 saat persetujuan.

-- CreateTable
CREATE TABLE `attendance_corrections` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `employee_id` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `proposed_status` VARCHAR(191) NOT NULL,
    `proposed_check_in` DATETIME(3) NULL,
    `proposed_check_out` DATETIME(3) NULL,
    `proposed_notes` VARCHAR(191) NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `snapshot_attendance_id` INTEGER NULL,
    `snapshot_updated_at` DATETIME(3) NULL,
    `snapshot_status` VARCHAR(191) NULL,
    `snapshot_check_in` DATETIME(3) NULL,
    `snapshot_check_out` DATETIME(3) NULL,
    `snapshot_notes` VARCHAR(191) NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attendance_corrections_slug_key`(`slug`),
    INDEX `attendance_corrections_employee_id_fkey`(`employee_id`),
    INDEX `idx_attendance_corrections_status`(`status`),
    INDEX `idx_attendance_corrections_date`(`date`),
    INDEX `attendance_corrections_approved_by_idx`(`approved_by`),
    INDEX `attendance_corrections_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendance_corrections` ADD CONSTRAINT `attendance_corrections_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_corrections` ADD CONSTRAINT `attendance_corrections_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
