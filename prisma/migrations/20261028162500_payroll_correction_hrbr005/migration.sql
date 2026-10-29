-- HR-BR-005 (F-2026-10-28-133-S P2/BR-HRCR-02 + vonis F-2026-10-28-135-V §2a):
-- koreksi slip paid = dokumen koreksi tertaut, bukan edit/hapus.
-- Slip asal tetap paid, nilai tak ditimpa; tautan dua arah via kolom baru.
-- Aditif saja: kolom nullable + FK self + indeks. Tanpa backfill.

ALTER TABLE `payrolls` ADD COLUMN `corrects_payroll_id` INTEGER NULL;
ALTER TABLE `payrolls` ADD COLUMN `correction_reason` TEXT NULL;

ALTER TABLE `payrolls` ADD CONSTRAINT `payrolls_corrects_payroll_id_fkey` FOREIGN KEY (`corrects_payroll_id`) REFERENCES `payrolls`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `payrolls_corrects_payroll_id_idx` ON `payrolls`(`corrects_payroll_id`);
