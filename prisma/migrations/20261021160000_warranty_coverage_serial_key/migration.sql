-- F-021-HARDEN-UNIQUE: jangkar unik DB untuk WarrantyCoverage.
-- MySQL tidak menganggap NULL unik, jadi unique langsung pada
-- (work_order_id, item_id, serial_number) tidak menahan coverage ganda
-- tanpa serial. Kolom serial_key diisi service = serial_number ?? ""
-- saat create; baris lama ter-backfill dari serial_number yang ada.
-- Kolom baru punya DEFAULT '' sehingga penambahan kolom aman untuk
-- baris lama; unique dibuat SESUDAH backfill supaya tidak gagal di
-- data berjalan yang serial_number-nya terisi.

-- AlterTable
ALTER TABLE `warranty_coverages` ADD COLUMN `serial_key` VARCHAR(191) NOT NULL DEFAULT '';

-- Backfill baris lama dari serial yang tercatat
UPDATE `warranty_coverages` SET `serial_key` = `serial_number` WHERE `serial_number` IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `warranty_coverages_wo_item_serial_key_key` ON `warranty_coverages`(`work_order_id`, `item_id`, `serial_key`);
