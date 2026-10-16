-- RBAC: satu registri izin (lihat docs/RBAC_AUDIT.md).
--
-- 1) `role_module_access` dihapus. Tabel ini tidak pernah dibaca jalur penegakan
--    (session dibangun dari `_RolePermissions`) dan tidak pernah di-seed, sehingga
--    checklist Modul×Aksi di UI tidak berpengaruh apa pun — hanya menyesatkan.
-- 2) `module_actions`: identitas baris pindah dari (module_id, key) ke
--    (module_id, permission_key). `key` adalah VERBA aksi yang berulang di dalam satu
--    modul, jadi unique lama membuat seed hanya menyisakan SATU baris per modul
--    view-only (mis. `master` kehilangan 18 dari 19 barisnya; `module_actions` nyata
--    hanya ~17 baris padahal katalognya 301 permission).
--    Setelah ini katalog berisi satu baris per permission, di-upsert
--    `src/lib/setup/modules.ts` dari `src/lib/auth/modules.ts`.
--
-- Ditulis idempoten (MySQL tidak punya `DROP INDEX IF EXISTS`) karena tabel ini
-- dibuat lewat `prisma db push`, bukan migrasi, sehingga namanya bisa berbeda.

DROP TABLE IF EXISTS `role_module_access`;

SET @drop_idx := (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_actions'
    AND INDEX_NAME = 'module_actions_module_id_key_key'
  LIMIT 1
);
SET @sql_drop := IF(
  @drop_idx IS NULL,
  'SELECT 1',
  'ALTER TABLE `module_actions` DROP INDEX `module_actions_module_id_key_key`'
);
PREPARE stmt_drop FROM @sql_drop;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;

SET @new_idx := (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_actions'
    AND INDEX_NAME = 'module_actions_module_id_permission_key_key'
  LIMIT 1
);
SET @sql_create := IF(
  @new_idx IS NULL,
  'CREATE UNIQUE INDEX `module_actions_module_id_permission_key_key` ON `module_actions`(`module_id`, `permission_key`)',
  'SELECT 1'
);
PREPARE stmt_create FROM @sql_create;
EXECUTE stmt_create;
DEALLOCATE PREPARE stmt_create;

-- 3) Kolom `resource`: identitas baris matriks (entitas), mis. permission
--    `view_sales_invoices` → key="view", resource="sales_invoices". Dibuat eksplisit
--    supaya UI matriks tidak perlu menebak dari nama permission.
SET @has_resource := (
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'module_actions'
    AND COLUMN_NAME = 'resource'
  LIMIT 1
);
SET @sql_resource := IF(
  @has_resource IS NULL,
  'ALTER TABLE `module_actions` ADD COLUMN `resource` VARCHAR(191) NOT NULL DEFAULT ''''',
  'SELECT 1'
);
PREPARE stmt_resource FROM @sql_resource;
EXECUTE stmt_resource;
DEALLOCATE PREPARE stmt_resource;

-- Baris lama hasil collapse sudah tidak mewakili katalog; isi ulang dengan
-- `npm run db:seed` (katalog lengkap + prune baris usang).
