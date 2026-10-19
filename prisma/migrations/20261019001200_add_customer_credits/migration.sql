-- AUD-FIN-02: tabel kredit pelanggan terstruktur. Tabel BARU (tanpa DROP/
-- ALTER destruktif) — aman untuk instalasi lama: tak ada baris = tak ada
-- perilaku berubah. Saldo = received - allocated - refunded (di kode).
CREATE TABLE IF NOT EXISTS `customer_credits` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `document_no` VARCHAR(191) NOT NULL,
  `customer_id` INT NOT NULL,
  `source_type` VARCHAR(191) NOT NULL,
  `source_id` INT NOT NULL,
  `received_amount` DECIMAL(15, 2) NOT NULL,
  `allocated_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `refunded_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `notes` TEXT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_credits_document_no_key`(`document_no`),
  INDEX `idx_customer_credits_cust_status`(`customer_id`, `status`),
  INDEX `idx_customer_credits_source`(`source_type`, `source_id`),
  CONSTRAINT `customer_credits_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
