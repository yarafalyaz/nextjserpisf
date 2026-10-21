-- F-2026-10-21-019: tautan Timesheet ke WorkOrder (konteks proyek XOR perintah kerja).
-- Aditif: project_id menjadi nullable + work_order_id nullable baru; baris lama
-- (project_id terisi, work_order_id NULL) tetap sah, tanpa backfill.
-- Validasi XOR (tepat satu konteks) ditegakkan di service, bukan constraint DB.

-- AlterTable
ALTER TABLE `timesheets` MODIFY `project_id` INTEGER NULL,
    ADD COLUMN `work_order_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `timesheets_work_order_id_fkey` ON `timesheets`(`work_order_id`);

-- AddForeignKey
ALTER TABLE `timesheets` ADD CONSTRAINT `timesheets_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
