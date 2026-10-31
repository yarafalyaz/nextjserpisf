-- Lanjutan R8-JB-03: kredit vendor dari kelebihan relief retur beli.
-- Tabel BARU (tanpa DROP/ALTER destruktif) — aman untuk instalasi lama:
-- tak ada baris = tak ada perilaku berubah. Saldo = received - allocated
-- (di kode). Cermin customer_credits (AUD-FIN-02) tanpa refunded_amount:
-- kredit ini bukan kas, hanya offset tagihan vendor berikutnya.
CREATE TABLE IF NOT EXISTS `vendor_credits` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `document_no` VARCHAR(191) NOT NULL,
  `vendor_id` INT NOT NULL,
  `source_type` VARCHAR(191) NOT NULL,
  `source_id` INT NOT NULL,
  `received_amount` DECIMAL(15, 2) NOT NULL,
  `allocated_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `notes` TEXT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `vendor_credits_document_no_key`(`document_no`),
  INDEX `idx_vendor_credits_vendor_status`(`vendor_id`, `status`),
  INDEX `idx_vendor_credits_source`(`source_type`, `source_id`),
  CONSTRAINT `vendor_credits_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
