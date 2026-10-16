-- Transaksi favorit per pengguna (Accurate: "Transaksi Favorit").
--
-- Ditulis idempoten karena DB dev dibangun dengan `prisma db push`.

SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorite_transactions');
SET @sql := IF(@tbl > 0, 'SELECT 1', '
CREATE TABLE `favorite_transactions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `href` VARCHAR(191) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `favorite_transactions_user_id_href_key`(`user_id`, `href`),
  INDEX `favorite_transactions_user_id_idx`(`user_id`),
  INDEX `favorite_transactions_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorite_transactions'
    AND CONSTRAINT_NAME = 'favorite_transactions_user_id_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk > 0, 'SELECT 1',
  'ALTER TABLE `favorite_transactions` ADD CONSTRAINT `favorite_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
