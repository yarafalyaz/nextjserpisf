-- F-2026-10-24-096-S Opsi A (vonis Backend §3): kolom foto aditif di
-- transaction_attachments. Semua nullable tanpa default tebak: baris lama
-- dibaca kategori `other`/belum terverifikasi/belum terbit (fail-closed
-- BR-PHOTO-02/09). Tanpa tabel/FK baru — tahap ditunjuk referenceType+
-- referenceId polimorfik existing.
ALTER TABLE `transaction_attachments` ADD COLUMN `photo_category` VARCHAR(191) NULL;
ALTER TABLE `transaction_attachments` ADD COLUMN `verified_by` INTEGER NULL;
ALTER TABLE `transaction_attachments` ADD COLUMN `verified_at` DATETIME(3) NULL;
ALTER TABLE `transaction_attachments` ADD COLUMN `published_by` INTEGER NULL;
ALTER TABLE `transaction_attachments` ADD COLUMN `published_at` DATETIME(3) NULL;
