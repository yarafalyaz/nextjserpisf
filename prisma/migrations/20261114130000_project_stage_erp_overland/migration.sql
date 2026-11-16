-- AlterTable
ALTER TABLE `project_stages`
    ADD COLUMN `weight_pct` DECIMAL(5, 2) NULL,
    ADD COLUMN `planned_start_date` DATETIME(3) NULL,
    ADD COLUMN `planned_end_date` DATETIME(3) NULL;
