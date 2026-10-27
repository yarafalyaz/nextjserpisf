-- Pohon organisasi karyawan untuk otorisasi struktural (scope "tim"):
-- atasan langsung/tidak langsung melihat data HR bawahannya.
-- Nullable tanpa backfill: karyawan tanpa atasan terdaftar mempertahankan
-- perilaku scope lama (self/departemen).

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `manager_id` INT NULL;

-- CreateIndex
CREATE INDEX `employees_manager_id_fkey` ON `employees`(`manager_id`);

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_manager_id_fkey`
  FOREIGN KEY (`manager_id`) REFERENCES `employees`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
