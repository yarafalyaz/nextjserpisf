-- Tabel dasar yang HILANG dari rantai migrasi.
--
-- Temuan (dibuktikan di DB scratch): `20261011100000_add_slug_columns` menulis
-- `ALTER TABLE customer_categories ADD COLUMN slug ...` tanpa penjaga, tetapi
-- TIDAK ADA migrasi yang membuat tabel itu — jadi `migrate deploy` pada DB bersih
-- selalu gagal di migrasi ke-35 dari 49. Tabel-tabel itu selama ini hanya lahir
-- dari `prisma db push` (yang dipakai dev maupun CI), sehingga tidak ada yang sadar.
--
-- Migrasi ini murni ADITIF dan ditaruh sebelum `20261011100000` supaya ALTER tanpa
-- penjaga di sana menemukan tabelnya. Kolom `slug` sengaja TIDAK dibuat di sini —
-- migrasi slug itulah yang menambahkannya (kalau dibuat di sini, ALTER-nya gagal
-- karena kolom duplikat).
--
-- Idempoten: tiap tabel dijaga information_schema.

-- 1) modules -------------------------------------------------------------------
-- Wajib lebih dulu: `module_actions` punya FK ke sini.
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'modules');
SET @s := IF(@c = 0,
  'CREATE TABLE `modules` (
    `id` int NOT NULL AUTO_INCREMENT,
    `key` varchar(191) NOT NULL,
    `name` varchar(191) NOT NULL,
    `parent_key` varchar(191) DEFAULT NULL,
    `route` varchar(191) DEFAULT NULL,
    `icon` varchar(191) DEFAULT NULL,
    `order` int NOT NULL DEFAULT ''0'',
    `is_active` tinyint(1) NOT NULL DEFAULT ''1'',
    `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `modules_key_key` (`key`),
    KEY `modules_parent_key_idx` (`parent_key`),
    KEY `modules_order_idx` (`order`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) customer_categories -------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'customer_categories');
SET @s := IF(@c = 0,
  'CREATE TABLE `customer_categories` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(191) NOT NULL,
    `down_payment_percent` decimal(5,2) NOT NULL DEFAULT ''0.00'',
    `is_active` tinyint(1) NOT NULL DEFAULT ''1'',
    `deleted_at` datetime(3) DEFAULT NULL,
    `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `customer_categories_name_key` (`name`),
    KEY `idx_cust_cat_active_deleted` (`is_active`,`deleted_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- 2) expense_categories --------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'expense_categories');
SET @s := IF(@c = 0,
  'CREATE TABLE `expense_categories` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(191) NOT NULL,
    `label` varchar(191) NOT NULL,
    `sort_order` int NOT NULL DEFAULT ''0'',
    `is_active` tinyint(1) NOT NULL DEFAULT ''1'',
    `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `expense_categories_name_key` (`name`),
    KEY `expense_categories_sort_order_idx` (`sort_order`),
    KEY `expense_categories_is_active_idx` (`is_active`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- 3) payment_methods -----------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'payment_methods');
SET @s := IF(@c = 0,
  'CREATE TABLE `payment_methods` (
    `id` int NOT NULL AUTO_INCREMENT,
    `code` varchar(191) NOT NULL,
    `name` varchar(191) NOT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT ''1'',
    `created_by` int DEFAULT NULL,
    `updated_by` int DEFAULT NULL,
    `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `payment_methods_code_key` (`code`),
    KEY `payment_methods_created_at_idx` (`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- 4) shipping_methods ----------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'shipping_methods');
SET @s := IF(@c = 0,
  'CREATE TABLE `shipping_methods` (
    `id` int NOT NULL AUTO_INCREMENT,
    `code` varchar(191) NOT NULL,
    `name` varchar(191) NOT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT ''1'',
    `created_by` int DEFAULT NULL,
    `updated_by` int DEFAULT NULL,
    `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `shipping_methods_code_key` (`code`),
    KEY `shipping_methods_is_active_idx` (`is_active`),
    KEY `shipping_methods_created_at_idx` (`created_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- 5) module_actions ------------------------------------------------------------
-- Matriks izin (permission matrix) menyentuhnya di `20261012120000`, dan semua
-- pernyataannya dijaga — namun `CREATE UNIQUE INDEX`-nya TIDAK bisa jalan bila
-- tabelnya tidak ada, jadi tabel ini juga harus dibuat lebih dulu. Bentuk akhir
-- (termasuk `resource`) dipakai di sini; pernyataan berpenjaga di migrasi itu
-- otomatis menjadi no-op.
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'module_actions');
SET @s := IF(@c = 0,
  'CREATE TABLE `module_actions` (
    `id` int NOT NULL AUTO_INCREMENT,
    `module_id` int NOT NULL,
    `key` varchar(191) NOT NULL,
    `permission_key` varchar(191) NOT NULL,
    `label` varchar(191) NOT NULL,
    `order` int NOT NULL DEFAULT ''0'',
    `resource` varchar(191) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `module_actions_module_id_permission_key_key` (`module_id`,`permission_key`),
    KEY `module_actions_module_id_idx` (`module_id`),
    CONSTRAINT `module_actions_module_id_fkey` FOREIGN KEY (`module_id`)
      REFERENCES `modules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- 8) withholding_tax_types -----------------------------------------------------
-- Dirujuk lewat FOREIGN KEY oleh `20261015120000_sales_payment_withholding`.
-- Tidak disentuh `add_slug_columns`, jadi dibuat dengan bentuk akhir (termasuk slug).
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'withholding_tax_types');
SET @s := IF(@c = 0,
  'CREATE TABLE `withholding_tax_types` (
    `slug` varchar(191) DEFAULT NULL,
    `id` int NOT NULL AUTO_INCREMENT,
    `code` varchar(191) NOT NULL,
    `name` varchar(191) NOT NULL,
    `rate` decimal(5,2) NOT NULL DEFAULT ''0.00'',
    `liability_account_id` int DEFAULT NULL,
    `receivable_account_id` int DEFAULT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT ''1'',
    `deleted_at` datetime(3) DEFAULT NULL,
    `created_by` int DEFAULT NULL,
    `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `withholding_tax_types_code_key` (`code`),
    UNIQUE KEY `withholding_tax_types_slug_key` (`slug`),
    KEY `withholding_tax_types_is_active_deleted_at_idx` (`is_active`,`deleted_at`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- 9) allocation_rules ---------------------------------------------------------
-- Tabel ini HANYA dibuat agar `add_slug_columns` (yang menuliskan
-- `ALTER TABLE allocation_rules ADD COLUMN slug ...` tanpa penjaga) tidak gagal.
-- Model `AllocationRule` sudah DIHAPUS dari schema.prisma (0 rujukan), jadi tabel
-- sementara ini WAJIB dibuang lagi setelahnya oleh migrasi
-- `20261011110000_drop_allocation_rules`. Bentuknya sengaja minimal — isinya tidak
-- pernah dipakai aplikasi.
SET @c := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'allocation_rules');
SET @s := IF(@c = 0,
  'CREATE TABLE `allocation_rules` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(191) NOT NULL,
    `is_active` tinyint(1) NOT NULL DEFAULT ''1'',
    `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` datetime(3) NOT NULL,
    PRIMARY KEY (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
