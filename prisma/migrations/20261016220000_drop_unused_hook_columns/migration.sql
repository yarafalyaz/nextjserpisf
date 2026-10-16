-- Buang 10 kolom hook yang terbukti: 0 rujukan kode, 0 baris, dan 0 nilai non-NULL
-- (lihat docs/AUDIT-SCHEMA.md **3**). `UnitOfMeasure.conversionFactor` TIDAK dibuang
-- karena berisi 6 nilai.

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'work_schedules' AND column_name = 'late_tolerance_minutes');
SET @s := IF(@t = 1, 'ALTER TABLE `work_schedules` DROP COLUMN `late_tolerance_minutes`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'taxes' AND column_name = 'display_order');
SET @s := IF(@t = 1, 'ALTER TABLE `taxes` DROP COLUMN `display_order`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'approval_workflows' AND column_name = 'is_parallel');
SET @s := IF(@t = 1, 'ALTER TABLE `approval_workflows` DROP COLUMN `is_parallel`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'approval_workflow_steps' AND column_name = 'auto_approve_after_timeout');
SET @s := IF(@t = 1, 'ALTER TABLE `approval_workflow_steps` DROP COLUMN `auto_approve_after_timeout`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'approval_workflow_steps' AND column_name = 'timeout_hours');
SET @s := IF(@t = 1, 'ALTER TABLE `approval_workflow_steps` DROP COLUMN `timeout_hours`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'holidays' AND column_name = 'is_national_holiday');
SET @s := IF(@t = 1, 'ALTER TABLE `holidays` DROP COLUMN `is_national_holiday`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'department_holidays' AND column_name = 'is_recurring');
SET @s := IF(@t = 1, 'ALTER TABLE `department_holidays` DROP COLUMN `is_recurring`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'overtime_requests' AND column_name = 'approved_by_supervisor');
SET @s := IF(@t = 1, 'ALTER TABLE `overtime_requests` DROP COLUMN `approved_by_supervisor`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'purchase_requests' AND column_name = 'requester_id');
SET @s := IF(@t = 1, 'ALTER TABLE `purchase_requests` DROP COLUMN `requester_id`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @t := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
  AND table_name = 'bank_statement_lines' AND column_name = 'value_date');
SET @s := IF(@t = 1, 'ALTER TABLE `bank_statement_lines` DROP COLUMN `value_date`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

