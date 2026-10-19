-- AUD-R5: idempotency key finansial persisten. Satu intent/submit = satu
-- baris (UNIQUE key) → retry key sama tak bisa gandakan jurnal/saldo.
-- Tabel BARU (tanpa DROP/ALTER destruktif) — aman untuk instalasi lama.
CREATE TABLE IF NOT EXISTS `financial_idempotency_keys` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(191) NOT NULL,
  `result_ref_type` VARCHAR(191) NULL,
  `result_ref_id` INT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `financial_idempotency_keys_key_key`(`key`),
  INDEX `idx_fin_idem_scope`(`scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
