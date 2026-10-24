-- F-2026-10-22-055 Tahap A (vonis BOT 4 F-055-V §1+§2): beku nama katalog resmi kode objek sewa + metadata bukti dokumen dasar pada bupot.
-- Idempoten: ADD COLUMN biasa (duplikat ditolak MySQL — kolom sekali buat).
ALTER TABLE `withholding_certificates` ADD COLUMN `object_name` VARCHAR(191) NULL;
ALTER TABLE `withholding_certificates` ADD COLUMN `rent_object_evidence` TEXT NULL;
