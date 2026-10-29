-- Residual backend: EmployeeRoster.approvedBy jadi FK Employee + employee
-- onDelete Cascade -> Restrict. Disalin pola DDL existing
-- (20261026043000_attendance_correction_f010s: approved_by SET NULL,
-- employee_id RESTRICT; DROP+ADD constraint pola reconcile_schema_drift).
-- type/status tetap String (tanpa enum Prisma).

-- AddIndex
ALTER TABLE `employee_rosters` ADD INDEX `employee_rosters_approved_by_idx`(`approved_by`);

-- DropForeignKey + AddForeignKey (ubah delete rule employee_id)
ALTER TABLE `employee_rosters` DROP FOREIGN KEY `employee_rosters_employee_id_fkey`;
ALTER TABLE `employee_rosters` ADD CONSTRAINT `employee_rosters_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_rosters` ADD CONSTRAINT `employee_rosters_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
