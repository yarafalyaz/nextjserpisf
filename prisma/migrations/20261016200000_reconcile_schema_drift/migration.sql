-- Rekonsiliasi drift skema: menyelaraskan hasil rantai migrasi dengan schema.prisma.
--
-- Dihasilkan Prisma sendiri (bukan tulisan tangan):
--   prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- dijalankan pada DB kosong yang baru selesai 'migrate deploy'. Isinya:
--   - DROP FOREIGN KEY yang tidak dideklarasikan schema (sisa migrasi lama),
--   - CREATE TABLE untuk tabel yang belum pernah dibuat migrasi mana pun,
--   - ADD FOREIGN KEY + RENAME INDEX agar nama objek sama dengan schema.
--
-- PERINGATAN: pernyataan ADD CONSTRAINT bisa GAGAL bila dijalankan pada DB berisi
-- data yang melanggar batasan itu. Sudah diverifikasi pada DB KOSONG saja.
-- Tanpa penjaga idempotensi: migrasi hanya berjalan sekali (dev memakai db push).

-- DropForeignKey
ALTER TABLE `asset_transfers` DROP FOREIGN KEY `asset_transfers_asset_id_fkey`;

-- DropForeignKey
ALTER TABLE `crm_pipeline_stages` DROP FOREIGN KEY `crm_pipeline_stages_pipeline_id_fkey`;

-- DropForeignKey
ALTER TABLE `exchange_rates` DROP FOREIGN KEY `exchange_rates_from_currency_id_fkey`;

-- DropForeignKey
ALTER TABLE `exchange_rates` DROP FOREIGN KEY `exchange_rates_to_currency_id_fkey`;

-- DropForeignKey
ALTER TABLE `price_list_items` DROP FOREIGN KEY `price_list_items_item_id_fkey`;

-- DropForeignKey
ALTER TABLE `price_list_items` DROP FOREIGN KEY `price_list_items_price_list_id_fkey`;

-- DropForeignKey
ALTER TABLE `skf_values` DROP FOREIGN KEY `skf_values_cost_center_id_fkey`;

-- DropForeignKey
ALTER TABLE `skf_values` DROP FOREIGN KEY `skf_values_profit_center_id_fkey`;

-- DropForeignKey
ALTER TABLE `skf_values` DROP FOREIGN KEY `skf_values_statistical_key_figure_id_fkey`;

-- DropForeignKey
ALTER TABLE `vehicle_fitment_rules` DROP FOREIGN KEY `vehicle_fitment_rules_brand_fkey`;

-- DropForeignKey
ALTER TABLE `vehicle_fitment_rules` DROP FOREIGN KEY `vehicle_fitment_rules_model_fkey`;

-- DropForeignKey
ALTER TABLE `vehicle_fitment_rules` DROP FOREIGN KEY `vehicle_fitment_rules_variant_fkey`;

-- DropIndex
DROP INDEX `production_costs_is_applied_overhead_idx` ON `production_costs`;

-- AlterTable
ALTER TABLE `accounts` ADD COLUMN `report_group` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `activity_logs` ADD COLUMN `ip_address` VARCHAR(191) NULL,
    ADD COLUMN `new_values` JSON NULL,
    ADD COLUMN `old_values` JSON NULL,
    MODIFY `model_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `assets` ADD COLUMN `depreciation_method` VARCHAR(191) NOT NULL DEFAULT 'straight_line';

-- AlterTable
ALTER TABLE `attendances` ADD COLUMN `late_minutes` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `banks` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `brands` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `cost_centers` ADD COLUMN `parent_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `customer_vehicles` ADD COLUMN `slug` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `customers` DROP COLUMN `npwp`,
    ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `credit_limit` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `customer_category_id` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `departments` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `employee_loans` ADD COLUMN `approved_by` INTEGER NULL,
    ADD COLUMN `created_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `expenses` DROP COLUMN `category`,
    ADD COLUMN `category_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `goods_receipt_items` ADD COLUMN `batch_number` VARCHAR(191) NULL,
    ADD COLUMN `expiry_date` DATETIME(3) NULL,
    ADD COLUMN `serial_numbers` JSON NULL,
    ADD COLUMN `uom` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `inventory_layers` ADD COLUMN `batch_number` VARCHAR(191) NULL,
    ADD COLUMN `warehouse_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `item_categories` ADD COLUMN `costing_method` VARCHAR(191) NOT NULL DEFAULT 'average',
    ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `items` ADD COLUMN `track_batch` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `track_serial` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `material_issues` ADD COLUMN `cost_center_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `payment_terms` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `payrolls` ADD COLUMN `absent_days` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `absent_deduction` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `bpjs_employment_employee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `bpjs_health_employee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `cost_center_id` INTEGER NULL,
    ADD COLUMN `gross_salary` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `pph21` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `present_days` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `working_days` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `positions` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `production_costs` MODIFY `driver_type` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `project_stages` ADD COLUMN `completed_at` DATETIME(3) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `started_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `cost_center_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `purchase_orders` ADD COLUMN `service_fee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE `quotations` ADD COLUMN `payment_method` VARCHAR(191) NULL,
    ADD COLUMN `shipping_method` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sales_invoice_items` ADD COLUMN `serial_numbers` JSON NULL,
    ADD COLUMN `uom` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sales_invoices` MODIFY `status` ENUM('draft', 'sent', 'posted', 'partial', 'paid', 'cancelled', 'approved') NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE `sales_return_items` ADD COLUMN `price` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `asset_base_url` VARCHAR(191) NULL,
    ADD COLUMN `default_project_stages` VARCHAR(1000) NOT NULL DEFAULT 'Persiapan, Pengerjaan, Quality Check, Selesai',
    ADD COLUMN `enable_auto_payment_method_code` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `enable_auto_shipping_method_code` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `payment_method_code_prefix` VARCHAR(191) NULL DEFAULT 'MTP-',
    ADD COLUMN `payroll_cutoff_day` INTEGER NOT NULL DEFAULT 25,
    ADD COLUMN `r2_access_key_id` VARCHAR(191) NULL,
    ADD COLUMN `r2_account_id` VARCHAR(191) NULL,
    ADD COLUMN `r2_bucket` VARCHAR(191) NULL,
    ADD COLUMN `r2_secret_access_key` VARCHAR(191) NULL,
    ADD COLUMN `rest_break_end` VARCHAR(191) NOT NULL DEFAULT '13:00',
    ADD COLUMN `rest_break_start` VARCHAR(191) NOT NULL DEFAULT '12:00',
    ADD COLUMN `shipping_method_code_prefix` VARCHAR(191) NULL DEFAULT 'MTK-',
    ADD COLUMN `storage_driver` VARCHAR(191) NOT NULL DEFAULT 'local',
    ADD COLUMN `storage_fallback_local` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `taxes` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `slug` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `vehicle_variants` ADD COLUMN `drivetrain` VARCHAR(191) NULL,
    ADD COLUMN `transmission` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `vendor_bills` ADD COLUMN `withholding_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `withholding_type_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `vendors` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `work_schedules` DROP COLUMN `day_of_week`,
    DROP COLUMN `department_id`,
    ADD COLUMN `work_days` VARCHAR(191) NOT NULL DEFAULT '';

-- DropTable
DROP TABLE `approval_delegations`;

-- DropTable
DROP TABLE `crm_pipeline_stages`;

-- DropTable
DROP TABLE `crm_pipelines`;

-- DropTable
DROP TABLE `currencies`;

-- DropTable
DROP TABLE `exchange_rates`;

-- DropTable
DROP TABLE `price_list_items`;

-- DropTable
DROP TABLE `price_lists`;

-- DropTable
DROP TABLE `skf_values`;

-- DropTable
DROP TABLE `statistical_key_figures`;

-- CreateTable
CREATE TABLE `recurring_transactions` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `frequency` VARCHAR(191) NOT NULL,
    `interval` INTEGER NOT NULL DEFAULT 1,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NULL,
    `next_run_date` DATETIME(3) NOT NULL,
    `last_run_at` DATETIME(3) NULL,
    `run_count` INTEGER NOT NULL DEFAULT 0,
    `template` TEXT NOT NULL,
    `last_result` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `recurring_transactions_slug_key`(`slug`),
    INDEX `recurring_transactions_is_active_deleted_at_next_run_date_idx`(`is_active`, `deleted_at`, `next_run_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cron_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `message` TEXT NULL,
    `duration` INTEGER NULL,
    `ran_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cron_logs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `uom_conversions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `item_id` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `factor_to_base` DECIMAL(15, 6) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `uom_conversions_item_id_fkey`(`item_id`),
    INDEX `uom_conversions_created_at_idx`(`created_at`),
    UNIQUE INDEX `uom_conversions_item_id_code_key`(`item_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_warehouses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_warehouses_user_id_warehouse_id_key`(`user_id`, `warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_keys` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `idempotency_keys_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_BrandCategories` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_BrandCategories_AB_unique`(`A`, `B`),
    INDEX `_BrandCategories_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_DepartmentWorkSchedules` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_DepartmentWorkSchedules_AB_unique`(`A`, `B`),
    INDEX `_DepartmentWorkSchedules_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_EmployeeWorkSchedules` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_EmployeeWorkSchedules_AB_unique`(`A`, `B`),
    INDEX `_EmployeeWorkSchedules_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `accounts_is_active_deleted_at_idx` ON `accounts`(`is_active`, `deleted_at`);

-- CreateIndex
CREATE INDEX `accounts_created_at_idx` ON `accounts`(`created_at`);

-- CreateIndex
CREATE INDEX `activity_logs_user_id_idx` ON `activity_logs`(`user_id`);

-- CreateIndex
CREATE INDEX `activity_logs_action_idx` ON `activity_logs`(`action`);

-- CreateIndex
CREATE INDEX `activity_logs_created_at_idx` ON `activity_logs`(`created_at`);

-- CreateIndex
CREATE INDEX `appreciations_created_at_idx` ON `appreciations`(`created_at`);

-- CreateIndex
CREATE INDEX `approval_histories_user_id_idx` ON `approval_histories`(`user_id`);

-- CreateIndex
CREATE INDEX `approval_histories_created_at_idx` ON `approval_histories`(`created_at`);

-- CreateIndex
CREATE INDEX `approval_workflow_steps_role_id_idx` ON `approval_workflow_steps`(`role_id`);

-- CreateIndex
CREATE INDEX `approval_workflow_steps_user_id_idx` ON `approval_workflow_steps`(`user_id`);

-- CreateIndex
CREATE INDEX `approval_workflow_steps_created_at_idx` ON `approval_workflow_steps`(`created_at`);

-- CreateIndex
CREATE INDEX `approval_workflows_created_at_idx` ON `approval_workflows`(`created_at`);

-- CreateIndex
CREATE INDEX `approvals_reference_type_reference_id_idx` ON `approvals`(`reference_type`, `reference_id`);

-- CreateIndex
CREATE INDEX `approvals_status_idx` ON `approvals`(`status`);

-- CreateIndex
CREATE INDEX `approvals_requested_by_idx` ON `approvals`(`requested_by`);

-- CreateIndex
CREATE INDEX `approvals_final_approved_by_idx` ON `approvals`(`final_approved_by`);

-- CreateIndex
CREATE INDEX `approvals_created_at_idx` ON `approvals`(`created_at`);

-- CreateIndex
CREATE INDEX `asset_brand_models_created_at_idx` ON `asset_brand_models`(`created_at`);

-- CreateIndex
CREATE INDEX `asset_brands_created_at_idx` ON `asset_brands`(`created_at`);

-- CreateIndex
CREATE INDEX `asset_categories_asset_account_id_idx` ON `asset_categories`(`asset_account_id`);

-- CreateIndex
CREATE INDEX `asset_categories_accumulated_depreciation_account_id_idx` ON `asset_categories`(`accumulated_depreciation_account_id`);

-- CreateIndex
CREATE INDEX `asset_categories_depreciation_expense_account_id_idx` ON `asset_categories`(`depreciation_expense_account_id`);

-- CreateIndex
CREATE INDEX `asset_categories_gain_loss_account_id_idx` ON `asset_categories`(`gain_loss_account_id`);

-- CreateIndex
CREATE INDEX `asset_categories_created_at_idx` ON `asset_categories`(`created_at`);

-- CreateIndex
CREATE INDEX `asset_groups_created_at_idx` ON `asset_groups`(`created_at`);

-- CreateIndex
CREATE INDEX `asset_histories_created_at_idx` ON `asset_histories`(`created_at`);

-- CreateIndex
CREATE INDEX `asset_transfers_from_employee_id_idx` ON `asset_transfers`(`from_employee_id`);

-- CreateIndex
CREATE INDEX `asset_transfers_to_employee_id_idx` ON `asset_transfers`(`to_employee_id`);

-- CreateIndex
CREATE INDEX `asset_transfers_created_by_idx` ON `asset_transfers`(`created_by`);

-- CreateIndex
CREATE INDEX `asset_transfers_created_at_idx` ON `asset_transfers`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_assets_status` ON `assets`(`status`);

-- CreateIndex
CREATE INDEX `assets_employee_id_idx` ON `assets`(`employee_id`);

-- CreateIndex
CREATE INDEX `assets_asset_brand_model_id_idx` ON `assets`(`asset_brand_model_id`);

-- CreateIndex
CREATE INDEX `assets_asset_brand_id_idx` ON `assets`(`asset_brand_id`);

-- CreateIndex
CREATE INDEX `assets_created_at_idx` ON `assets`(`created_at`);

-- CreateIndex
CREATE INDEX `attendances_date_idx` ON `attendances`(`date`);

-- CreateIndex
CREATE INDEX `idx_attendances_status` ON `attendances`(`status`);

-- CreateIndex
CREATE INDEX `attendances_created_at_idx` ON `attendances`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `attendances_employee_date_unique` ON `attendances`(`employee_id`, `date`);

-- CreateIndex
CREATE INDEX `bank_reconciliation_items_bank_statement_line_id_idx` ON `bank_reconciliation_items`(`bank_statement_line_id`);

-- CreateIndex
CREATE INDEX `bank_reconciliation_items_journal_entry_id_idx` ON `bank_reconciliation_items`(`journal_entry_id`);

-- CreateIndex
CREATE INDEX `bank_reconciliation_items_related_journal_id_idx` ON `bank_reconciliation_items`(`related_journal_id`);

-- CreateIndex
CREATE INDEX `bank_reconciliation_items_related_payment_id_idx` ON `bank_reconciliation_items`(`related_payment_id`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_status_idx` ON `bank_reconciliations`(`status`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_account_id_idx` ON `bank_reconciliations`(`account_id`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_bank_id_idx` ON `bank_reconciliations`(`bank_id`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_bank_statement_id_idx` ON `bank_reconciliations`(`bank_statement_id`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_completed_by_idx` ON `bank_reconciliations`(`completed_by`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_created_by_idx` ON `bank_reconciliations`(`created_by`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_created_at_idx` ON `bank_reconciliations`(`created_at`);

-- CreateIndex
CREATE INDEX `bank_reconciliations_deleted_at_idx` ON `bank_reconciliations`(`deleted_at`);

-- CreateIndex
CREATE INDEX `bank_statement_lines_matched_journal_id_idx` ON `bank_statement_lines`(`matched_journal_id`);

-- CreateIndex
CREATE INDEX `bank_statement_lines_matched_payment_id_idx` ON `bank_statement_lines`(`matched_payment_id`);

-- CreateIndex
CREATE INDEX `bank_statements_account_id_idx` ON `bank_statements`(`account_id`);

-- CreateIndex
CREATE INDEX `bank_statements_bank_id_idx` ON `bank_statements`(`bank_id`);

-- CreateIndex
CREATE INDEX `bank_statements_status_idx` ON `bank_statements`(`status`);

-- CreateIndex
CREATE INDEX `bank_statements_uploaded_by_idx` ON `bank_statements`(`uploaded_by`);

-- CreateIndex
CREATE INDEX `bank_statements_created_at_idx` ON `bank_statements`(`created_at`);

-- CreateIndex
CREATE INDEX `banks_account_id_idx` ON `banks`(`account_id`);

-- CreateIndex
CREATE INDEX `banks_created_at_idx` ON `banks`(`created_at`);

-- CreateIndex
CREATE INDEX `barcodes_created_at_idx` ON `barcodes`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `brands_name_key` ON `brands`(`name`);

-- CreateIndex
CREATE INDEX `brands_created_at_idx` ON `brands`(`created_at`);

-- CreateIndex
CREATE INDEX `cost_centers_department_id_idx` ON `cost_centers`(`department_id`);

-- CreateIndex
CREATE INDEX `cost_centers_profit_center_id_idx` ON `cost_centers`(`profit_center_id`);

-- CreateIndex
CREATE INDEX `cost_centers_parent_id_idx` ON `cost_centers`(`parent_id`);

-- CreateIndex
CREATE INDEX `cost_centers_created_at_idx` ON `cost_centers`(`created_at`);

-- CreateIndex
CREATE INDEX `crm_ticket_comments_user_id_idx` ON `crm_ticket_comments`(`user_id`);

-- CreateIndex
CREATE INDEX `crm_ticket_comments_created_at_idx` ON `crm_ticket_comments`(`created_at`);

-- CreateIndex
CREATE INDEX `crm_tickets_status_idx` ON `crm_tickets`(`status`);

-- CreateIndex
CREATE INDEX `crm_tickets_customer_id_idx` ON `crm_tickets`(`customer_id`);

-- CreateIndex
CREATE INDEX `crm_tickets_assigned_to_idx` ON `crm_tickets`(`assigned_to`);

-- CreateIndex
CREATE INDEX `crm_tickets_created_by_idx` ON `crm_tickets`(`created_by`);

-- CreateIndex
CREATE INDEX `crm_tickets_created_at_idx` ON `crm_tickets`(`created_at`);

-- CreateIndex
CREATE INDEX `crm_tickets_deleted_at_idx` ON `crm_tickets`(`deleted_at`);

-- CreateIndex
CREATE UNIQUE INDEX `customer_vehicles_slug_key` ON `customer_vehicles`(`slug`);

-- CreateIndex
CREATE INDEX `customer_vehicles_created_at_idx` ON `customer_vehicles`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `customers_code_key` ON `customers`(`code`);

-- CreateIndex
CREATE INDEX `idx_customers_active_deleted` ON `customers`(`is_active`, `deleted_at`);

-- CreateIndex
CREATE INDEX `idx_customers_name` ON `customers`(`name`);

-- CreateIndex
CREATE INDEX `idx_customers_code` ON `customers`(`code`);

-- CreateIndex
CREATE INDEX `customers_created_at_idx` ON `customers`(`created_at`);

-- CreateIndex
CREATE INDEX `delivery_order_items_sales_order_item_id_idx` ON `delivery_order_items`(`sales_order_item_id`);

-- CreateIndex
CREATE INDEX `delivery_orders_status_idx` ON `delivery_orders`(`status`);

-- CreateIndex
CREATE INDEX `delivery_orders_customer_id_idx` ON `delivery_orders`(`customer_id`);

-- CreateIndex
CREATE INDEX `delivery_orders_confirmed_by_idx` ON `delivery_orders`(`confirmed_by`);

-- CreateIndex
CREATE INDEX `delivery_orders_created_by_idx` ON `delivery_orders`(`created_by`);

-- CreateIndex
CREATE INDEX `delivery_orders_created_at_idx` ON `delivery_orders`(`created_at`);

-- CreateIndex
CREATE INDEX `department_holidays_created_at_idx` ON `department_holidays`(`created_at`);

-- CreateIndex
CREATE INDEX `department_holidays_date_idx` ON `department_holidays`(`date`);

-- CreateIndex
CREATE UNIQUE INDEX `departments_name_key` ON `departments`(`name`);

-- CreateIndex
CREATE UNIQUE INDEX `departments_code_key` ON `departments`(`code`);

-- CreateIndex
CREATE INDEX `departments_created_at_idx` ON `departments`(`created_at`);

-- CreateIndex
CREATE INDEX `document_sequences_created_at_idx` ON `document_sequences`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_down_payments_status` ON `down_payments`(`status`);

-- CreateIndex
CREATE INDEX `down_payments_created_by_idx` ON `down_payments`(`created_by`);

-- CreateIndex
CREATE INDEX `down_payments_created_at_idx` ON `down_payments`(`created_at`);

-- CreateIndex
CREATE INDEX `employee_loans_status_idx` ON `employee_loans`(`status`);

-- CreateIndex
CREATE INDEX `employee_loans_approved_by_idx` ON `employee_loans`(`approved_by`);

-- CreateIndex
CREATE INDEX `employee_loans_created_by_idx` ON `employee_loans`(`created_by`);

-- CreateIndex
CREATE INDEX `employee_loans_created_at_idx` ON `employee_loans`(`created_at`);

-- CreateIndex
CREATE INDEX `employees_is_active_deleted_at_idx` ON `employees`(`is_active`, `deleted_at`);

-- CreateIndex
CREATE INDEX `employees_user_id_idx` ON `employees`(`user_id`);

-- CreateIndex
CREATE INDEX `employees_created_at_idx` ON `employees`(`created_at`);

-- CreateIndex
CREATE INDEX `expenses_account_id_idx` ON `expenses`(`account_id`);

-- CreateIndex
CREATE INDEX `expenses_project_id_idx` ON `expenses`(`project_id`);

-- CreateIndex
CREATE INDEX `expenses_employee_id_idx` ON `expenses`(`employee_id`);

-- CreateIndex
CREATE INDEX `expenses_status_idx` ON `expenses`(`status`);

-- CreateIndex
CREATE INDEX `expenses_paid_from_account_id_idx` ON `expenses`(`paid_from_account_id`);

-- CreateIndex
CREATE INDEX `expenses_approved_by_idx` ON `expenses`(`approved_by`);

-- CreateIndex
CREATE INDEX `expenses_cost_center_id_idx` ON `expenses`(`cost_center_id`);

-- CreateIndex
CREATE INDEX `expenses_created_by_idx` ON `expenses`(`created_by`);

-- CreateIndex
CREATE INDEX `expenses_created_at_idx` ON `expenses`(`created_at`);

-- CreateIndex
CREATE INDEX `expenses_category_id_idx` ON `expenses`(`category_id`);

-- CreateIndex
CREATE INDEX `goods_receipt_items_item_id_idx` ON `goods_receipt_items`(`item_id`);

-- CreateIndex
CREATE INDEX `goods_receipt_items_warehouse_id_idx` ON `goods_receipt_items`(`warehouse_id`);

-- CreateIndex
CREATE INDEX `goods_receipt_items_stock_move_id_idx` ON `goods_receipt_items`(`stock_move_id`);

-- CreateIndex
CREATE INDEX `idx_goods_receipts_status` ON `goods_receipts`(`status`);

-- CreateIndex
CREATE INDEX `goods_receipts_created_by_idx` ON `goods_receipts`(`created_by`);

-- CreateIndex
CREATE INDEX `goods_receipts_created_at_idx` ON `goods_receipts`(`created_at`);

-- CreateIndex
CREATE INDEX `holidays_created_at_idx` ON `holidays`(`created_at`);

-- CreateIndex
CREATE INDEX `holidays_date_idx` ON `holidays`(`date`);

-- CreateIndex
CREATE INDEX `inventory_layers_item_warehouse_idx` ON `inventory_layers`(`item_id`, `warehouse_id`);

-- CreateIndex
CREATE INDEX `inventory_layers_created_at_idx` ON `inventory_layers`(`created_at`);

-- CreateIndex
CREATE INDEX `inventory_layers_remaining_idx` ON `inventory_layers`(`remaining`);

-- CreateIndex
CREATE INDEX `inventory_layers_warehouse_id_remaining_idx` ON `inventory_layers`(`warehouse_id`, `remaining`);

-- CreateIndex
CREATE INDEX `inventory_transfer_items_item_id_idx` ON `inventory_transfer_items`(`item_id`);

-- CreateIndex
CREATE INDEX `inventory_transfers_status_idx` ON `inventory_transfers`(`status`);

-- CreateIndex
CREATE INDEX `inventory_transfers_created_by_idx` ON `inventory_transfers`(`created_by`);

-- CreateIndex
CREATE INDEX `inventory_transfers_created_at_idx` ON `inventory_transfers`(`created_at`);

-- CreateIndex
CREATE INDEX `item_batches_created_at_idx` ON `item_batches`(`created_at`);

-- CreateIndex
CREATE INDEX `item_batches_item_id_batch_number_idx` ON `item_batches`(`item_id`, `batch_number`);

-- CreateIndex
CREATE UNIQUE INDEX `item_categories_name_key` ON `item_categories`(`name`);

-- CreateIndex
CREATE INDEX `item_categories_created_at_idx` ON `item_categories`(`created_at`);

-- CreateIndex
CREATE INDEX `item_serials_status_idx` ON `item_serials`(`status`);

-- CreateIndex
CREATE INDEX `item_serials_created_at_idx` ON `item_serials`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_items_is_active` ON `items`(`is_active`);

-- CreateIndex
CREATE INDEX `items_is_active_deleted_at_idx` ON `items`(`is_active`, `deleted_at`);

-- CreateIndex
CREATE INDEX `items_created_at_idx` ON `items`(`created_at`);

-- CreateIndex
CREATE INDEX `journal_entries_cost_center_id_idx` ON `journal_entries`(`cost_center_id`);

-- CreateIndex
CREATE INDEX `journal_entries_profit_center_id_idx` ON `journal_entries`(`profit_center_id`);

-- CreateIndex
CREATE INDEX `journal_entries_account_id_journal_id_idx` ON `journal_entries`(`account_id`, `journal_id`);

-- CreateIndex
CREATE INDEX `idx_journals_status` ON `journals`(`status`);

-- CreateIndex
CREATE INDEX `idx_journals_transaction_date` ON `journals`(`transaction_date`);

-- CreateIndex
CREATE INDEX `journals_created_at_idx` ON `journals`(`created_at`);

-- CreateIndex
CREATE INDEX `journals_deleted_at_idx` ON `journals`(`deleted_at`);

-- CreateIndex
CREATE UNIQUE INDEX `journals_reference_unique` ON `journals`(`reference_type`, `reference_id`);

-- CreateIndex
CREATE INDEX `lead_activities_user_id_idx` ON `lead_activities`(`user_id`);

-- CreateIndex
CREATE INDEX `lead_activities_created_at_idx` ON `lead_activities`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_leads_status` ON `leads`(`status`);

-- CreateIndex
CREATE INDEX `leads_customer_id_idx` ON `leads`(`customer_id`);

-- CreateIndex
CREATE INDEX `leads_assigned_to_idx` ON `leads`(`assigned_to`);

-- CreateIndex
CREATE INDEX `leads_created_by_idx` ON `leads`(`created_by`);

-- CreateIndex
CREATE INDEX `leads_created_at_idx` ON `leads`(`created_at`);

-- CreateIndex
CREATE INDEX `leads_deleted_at_idx` ON `leads`(`deleted_at`);

-- CreateIndex
CREATE INDEX `idx_leave_requests_status` ON `leave_requests`(`status`);

-- CreateIndex
CREATE INDEX `leave_requests_approved_by_idx` ON `leave_requests`(`approved_by`);

-- CreateIndex
CREATE INDEX `leave_requests_created_at_idx` ON `leave_requests`(`created_at`);

-- CreateIndex
CREATE INDEX `material_issue_items_item_id_idx` ON `material_issue_items`(`item_id`);

-- CreateIndex
CREATE INDEX `idx_material_issues_status` ON `material_issues`(`status`);

-- CreateIndex
CREATE INDEX `material_issues_project_id_idx` ON `material_issues`(`project_id`);

-- CreateIndex
CREATE INDEX `material_issues_work_order_id_idx` ON `material_issues`(`work_order_id`);

-- CreateIndex
CREATE INDEX `material_issues_cost_center_id_idx` ON `material_issues`(`cost_center_id`);

-- CreateIndex
CREATE INDEX `material_issues_created_by_idx` ON `material_issues`(`created_by`);

-- CreateIndex
CREATE INDEX `material_issues_created_at_idx` ON `material_issues`(`created_at`);

-- CreateIndex
CREATE INDEX `notifications_user_id_fkey` ON `notifications`(`user_id`);

-- CreateIndex
CREATE INDEX `notifications_created_at_idx` ON `notifications`(`created_at`);

-- CreateIndex
CREATE INDEX `overtime_requests_status_idx` ON `overtime_requests`(`status`);

-- CreateIndex
CREATE INDEX `overtime_requests_approved_by_idx` ON `overtime_requests`(`approved_by`);

-- CreateIndex
CREATE INDEX `overtime_requests_approved_by_supervisor_idx` ON `overtime_requests`(`approved_by_supervisor`);

-- CreateIndex
CREATE INDEX `overtime_requests_created_at_idx` ON `overtime_requests`(`created_at`);

-- CreateIndex
CREATE INDEX `payment_terms_created_at_idx` ON `payment_terms`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_payrolls_status` ON `payrolls`(`status`);

-- CreateIndex
CREATE INDEX `payrolls_cost_center_id_idx` ON `payrolls`(`cost_center_id`);

-- CreateIndex
CREATE INDEX `payrolls_approved_by_idx` ON `payrolls`(`approved_by`);

-- CreateIndex
CREATE INDEX `payrolls_created_by_idx` ON `payrolls`(`created_by`);

-- CreateIndex
CREATE INDEX `payrolls_created_at_idx` ON `payrolls`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `uq_payroll_employee_period` ON `payrolls`(`employee_id`, `period`);

-- CreateIndex
CREATE INDEX `permissions_created_at_idx` ON `permissions`(`created_at`);

-- CreateIndex
CREATE INDEX `petty_cash_account_id_idx` ON `petty_cash`(`account_id`);

-- CreateIndex
CREATE INDEX `petty_cash_source_account_id_idx` ON `petty_cash`(`source_account_id`);

-- CreateIndex
CREATE INDEX `petty_cash_expense_account_id_idx` ON `petty_cash`(`expense_account_id`);

-- CreateIndex
CREATE INDEX `petty_cash_created_by_idx` ON `petty_cash`(`created_by`);

-- CreateIndex
CREATE INDEX `petty_cash_created_at_idx` ON `petty_cash`(`created_at`);

-- CreateIndex
CREATE INDEX `positions_created_at_idx` ON `positions`(`created_at`);

-- CreateIndex
CREATE INDEX `product_materials_item_id_idx` ON `product_materials`(`item_id`);

-- CreateIndex
CREATE INDEX `production_order_materials_item_id_idx` ON `production_order_materials`(`item_id`);

-- CreateIndex
CREATE INDEX `production_orders_status_idx` ON `production_orders`(`status`);

-- CreateIndex
CREATE INDEX `production_orders_created_by_idx` ON `production_orders`(`created_by`);

-- CreateIndex
CREATE INDEX `production_orders_created_at_idx` ON `production_orders`(`created_at`);

-- CreateIndex
CREATE INDEX `products_created_at_idx` ON `products`(`created_at`);

-- CreateIndex
CREATE INDEX `profit_centers_created_at_idx` ON `profit_centers`(`created_at`);

-- CreateIndex
CREATE INDEX `project_items_item_id_idx` ON `project_items`(`item_id`);

-- CreateIndex
CREATE INDEX `project_logs_user_id_idx` ON `project_logs`(`user_id`);

-- CreateIndex
CREATE INDEX `project_logs_created_at_idx` ON `project_logs`(`created_at`);

-- CreateIndex
CREATE INDEX `project_stage_progress_created_by_idx` ON `project_stage_progress`(`created_by`);

-- CreateIndex
CREATE INDEX `project_stage_progress_created_at_idx` ON `project_stage_progress`(`created_at`);

-- CreateIndex
CREATE INDEX `project_stages_status_idx` ON `project_stages`(`status`);

-- CreateIndex
CREATE INDEX `project_stages_created_at_idx` ON `project_stages`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_projects_status` ON `projects`(`status`);

-- CreateIndex
CREATE INDEX `projects_work_order_id_idx` ON `projects`(`work_order_id`);

-- CreateIndex
CREATE INDEX `projects_cost_center_id_idx` ON `projects`(`cost_center_id`);

-- CreateIndex
CREATE INDEX `projects_created_by_idx` ON `projects`(`created_by`);

-- CreateIndex
CREATE INDEX `projects_created_at_idx` ON `projects`(`created_at`);

-- CreateIndex
CREATE INDEX `purchase_order_items_item_id_idx` ON `purchase_order_items`(`item_id`);

-- CreateIndex
CREATE INDEX `idx_purchase_orders_status` ON `purchase_orders`(`status`);

-- CreateIndex
CREATE INDEX `purchase_orders_approved_by_idx` ON `purchase_orders`(`approved_by`);

-- CreateIndex
CREATE INDEX `purchase_orders_created_by_idx` ON `purchase_orders`(`created_by`);

-- CreateIndex
CREATE INDEX `purchase_orders_created_at_idx` ON `purchase_orders`(`created_at`);

-- CreateIndex
CREATE INDEX `purchase_orders_deleted_at_idx` ON `purchase_orders`(`deleted_at`);

-- CreateIndex
CREATE INDEX `purchase_request_items_item_id_idx` ON `purchase_request_items`(`item_id`);

-- CreateIndex
CREATE INDEX `idx_purchase_requests_status` ON `purchase_requests`(`status`);

-- CreateIndex
CREATE INDEX `purchase_requests_requested_by_idx` ON `purchase_requests`(`requested_by`);

-- CreateIndex
CREATE INDEX `purchase_requests_requester_id_idx` ON `purchase_requests`(`requester_id`);

-- CreateIndex
CREATE INDEX `purchase_requests_approved_by_idx` ON `purchase_requests`(`approved_by`);

-- CreateIndex
CREATE INDEX `purchase_requests_created_by_idx` ON `purchase_requests`(`created_by`);

-- CreateIndex
CREATE INDEX `purchase_requests_created_at_idx` ON `purchase_requests`(`created_at`);

-- CreateIndex
CREATE INDEX `purchase_return_items_item_id_idx` ON `purchase_return_items`(`item_id`);

-- CreateIndex
CREATE INDEX `purchase_returns_status_idx` ON `purchase_returns`(`status`);

-- CreateIndex
CREATE INDEX `purchase_returns_created_by_idx` ON `purchase_returns`(`created_by`);

-- CreateIndex
CREATE INDEX `purchase_returns_created_at_idx` ON `purchase_returns`(`created_at`);

-- CreateIndex
CREATE INDEX `quotation_histories_user_id_idx` ON `quotation_histories`(`user_id`);

-- CreateIndex
CREATE INDEX `quotation_histories_created_at_idx` ON `quotation_histories`(`created_at`);

-- CreateIndex
CREATE INDEX `quotation_items_item_id_idx` ON `quotation_items`(`item_id`);

-- CreateIndex
CREATE INDEX `quotation_items_created_at_idx` ON `quotation_items`(`created_at`);

-- CreateIndex
CREATE INDEX `quotation_sections_created_at_idx` ON `quotation_sections`(`created_at`);

-- CreateIndex
CREATE INDEX `idx_quotations_status` ON `quotations`(`status`);

-- CreateIndex
CREATE INDEX `quotations_project_id_idx` ON `quotations`(`project_id`);

-- CreateIndex
CREATE INDEX `quotations_created_by_idx` ON `quotations`(`created_by`);

-- CreateIndex
CREATE INDEX `quotations_created_at_idx` ON `quotations`(`created_at`);

-- CreateIndex
CREATE INDEX `quotations_deleted_at_idx` ON `quotations`(`deleted_at`);

-- CreateIndex
CREATE INDEX `rack_rows_created_at_idx` ON `rack_rows`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `rack_rows_rack_id_code_key` ON `rack_rows`(`rack_id`, `code`);

-- CreateIndex
CREATE INDEX `racks_created_at_idx` ON `racks`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `racks_warehouse_id_code_key` ON `racks`(`warehouse_id`, `code`);

-- CreateIndex
CREATE INDEX `roles_created_at_idx` ON `roles`(`created_at`);

-- CreateIndex
CREATE INDEX `sales_invoice_items_item_id_idx` ON `sales_invoice_items`(`item_id`);

-- CreateIndex
CREATE INDEX `idx_sales_invoices_status` ON `sales_invoices`(`status`);

-- CreateIndex
CREATE INDEX `idx_sales_invoices_due_date` ON `sales_invoices`(`due_date`);

-- CreateIndex
CREATE INDEX `sales_invoices_customer_vehicle_id_idx` ON `sales_invoices`(`customer_vehicle_id`);

-- CreateIndex
CREATE INDEX `sales_invoices_project_id_idx` ON `sales_invoices`(`project_id`);

-- CreateIndex
CREATE INDEX `sales_invoices_created_by_idx` ON `sales_invoices`(`created_by`);

-- CreateIndex
CREATE INDEX `sales_invoices_created_at_idx` ON `sales_invoices`(`created_at`);

-- CreateIndex
CREATE INDEX `sales_invoices_deleted_at_idx` ON `sales_invoices`(`deleted_at`);

-- CreateIndex
CREATE INDEX `sales_invoices_payment_status_idx` ON `sales_invoices`(`payment_status`);

-- CreateIndex
CREATE INDEX `sales_invoices_deleted_at_payment_status_due_date_idx` ON `sales_invoices`(`deleted_at`, `payment_status`, `due_date`);

-- CreateIndex
CREATE INDEX `sales_order_items_item_id_idx` ON `sales_order_items`(`item_id`);

-- CreateIndex
CREATE INDEX `idx_sales_orders_status` ON `sales_orders`(`status`);

-- CreateIndex
CREATE INDEX `sales_orders_customer_vehicle_id_idx` ON `sales_orders`(`customer_vehicle_id`);

-- CreateIndex
CREATE INDEX `sales_orders_created_by_idx` ON `sales_orders`(`created_by`);

-- CreateIndex
CREATE INDEX `sales_orders_created_at_idx` ON `sales_orders`(`created_at`);

-- CreateIndex
CREATE INDEX `sales_orders_deleted_at_idx` ON `sales_orders`(`deleted_at`);

-- CreateIndex
CREATE INDEX `sales_payments_customer_id_idx` ON `sales_payments`(`customer_id`);

-- CreateIndex
CREATE INDEX `sales_payments_account_id_idx` ON `sales_payments`(`account_id`);

-- CreateIndex
CREATE INDEX `sales_payments_created_by_idx` ON `sales_payments`(`created_by`);

-- CreateIndex
CREATE INDEX `sales_payments_created_at_idx` ON `sales_payments`(`created_at`);

-- CreateIndex
CREATE INDEX `sales_return_items_item_id_idx` ON `sales_return_items`(`item_id`);

-- CreateIndex
CREATE INDEX `sales_returns_status_idx` ON `sales_returns`(`status`);

-- CreateIndex
CREATE INDEX `sales_returns_created_by_idx` ON `sales_returns`(`created_by`);

-- CreateIndex
CREATE INDEX `sales_returns_created_at_idx` ON `sales_returns`(`created_at`);

-- CreateIndex
CREATE INDEX `stock_adjustment_items_item_id_idx` ON `stock_adjustment_items`(`item_id`);

-- CreateIndex
CREATE INDEX `stock_adjustment_items_batch_id_idx` ON `stock_adjustment_items`(`batch_id`);

-- CreateIndex
CREATE INDEX `stock_adjustments_status_idx` ON `stock_adjustments`(`status`);

-- CreateIndex
CREATE INDEX `stock_adjustments_approved_by_idx` ON `stock_adjustments`(`approved_by`);

-- CreateIndex
CREATE INDEX `stock_adjustments_journal_id_idx` ON `stock_adjustments`(`journal_id`);

-- CreateIndex
CREATE INDEX `stock_adjustments_created_by_idx` ON `stock_adjustments`(`created_by`);

-- CreateIndex
CREATE INDEX `stock_adjustments_created_at_idx` ON `stock_adjustments`(`created_at`);

-- CreateIndex
CREATE INDEX `stock_adjustments_deleted_at_idx` ON `stock_adjustments`(`deleted_at`);

-- CreateIndex
CREATE INDEX `idx_stock_moves_status` ON `stock_moves`(`status`);

-- CreateIndex
CREATE INDEX `idx_stock_moves_ref` ON `stock_moves`(`reference_type`, `reference_id`);

-- CreateIndex
CREATE INDEX `stock_moves_rack_id_idx` ON `stock_moves`(`rack_id`);

-- CreateIndex
CREATE INDEX `stock_moves_rack_row_id_idx` ON `stock_moves`(`rack_row_id`);

-- CreateIndex
CREATE INDEX `stock_moves_created_by_idx` ON `stock_moves`(`created_by`);

-- CreateIndex
CREATE INDEX `stock_moves_created_at_idx` ON `stock_moves`(`created_at`);

-- CreateIndex
CREATE INDEX `stock_moves_item_id_transaction_date_idx` ON `stock_moves`(`item_id`, `transaction_date`);

-- CreateIndex
CREATE INDEX `stock_moves_type_transaction_date_idx` ON `stock_moves`(`type`, `transaction_date`);

-- CreateIndex
CREATE INDEX `tasks_status_idx` ON `tasks`(`status`);

-- CreateIndex
CREATE INDEX `tasks_created_at_idx` ON `tasks`(`created_at`);

-- CreateIndex
CREATE INDEX `tax_groups_created_at_idx` ON `tax_groups`(`created_at`);

-- CreateIndex
CREATE INDEX `taxes_account_id_idx` ON `taxes`(`account_id`);

-- CreateIndex
CREATE INDEX `taxes_created_at_idx` ON `taxes`(`created_at`);

-- CreateIndex
CREATE INDEX `timesheets_created_at_idx` ON `timesheets`(`created_at`);

-- CreateIndex
CREATE INDEX `transaction_attachments_uploaded_by_idx` ON `transaction_attachments`(`uploaded_by`);

-- CreateIndex
CREATE INDEX `transaction_attachments_created_at_idx` ON `transaction_attachments`(`created_at`);

-- CreateIndex
CREATE INDEX `unit_of_measures_base_unit_id_idx` ON `unit_of_measures`(`base_unit_id`);

-- CreateIndex
CREATE INDEX `unit_of_measures_created_at_idx` ON `unit_of_measures`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `users_slug_key` ON `users`(`slug`);

-- CreateIndex
CREATE INDEX `users_created_at_idx` ON `users`(`created_at`);

-- CreateIndex
CREATE INDEX `vehicle_brands_created_at_idx` ON `vehicle_brands`(`created_at`);

-- CreateIndex
CREATE INDEX `vehicle_models_created_at_idx` ON `vehicle_models`(`created_at`);

-- CreateIndex
CREATE UNIQUE INDEX `vehicle_models_brand_name_unique` ON `vehicle_models`(`vehicle_brand_id`, `name`);

-- CreateIndex
CREATE INDEX `vehicle_variants_created_at_idx` ON `vehicle_variants`(`created_at`);

-- CreateIndex
CREATE INDEX `vehicles_created_at_idx` ON `vehicles`(`created_at`);

-- CreateIndex
CREATE INDEX `vendor_bill_items_item_id_idx` ON `vendor_bill_items`(`item_id`);

-- CreateIndex
CREATE INDEX `vendor_bill_items_goods_receipt_item_id_idx` ON `vendor_bill_items`(`goods_receipt_item_id`);

-- CreateIndex
CREATE INDEX `vendor_bill_items_account_id_idx` ON `vendor_bill_items`(`account_id`);

-- CreateIndex
CREATE INDEX `vendor_bill_items_cost_center_id_idx` ON `vendor_bill_items`(`cost_center_id`);

-- CreateIndex
CREATE INDEX `idx_vendor_bills_status` ON `vendor_bills`(`status`);

-- CreateIndex
CREATE INDEX `idx_vendor_bills_due_date` ON `vendor_bills`(`due_date`);

-- CreateIndex
CREATE INDEX `vendor_bills_cost_center_id_idx` ON `vendor_bills`(`cost_center_id`);

-- CreateIndex
CREATE INDEX `vendor_bills_approved_by_idx` ON `vendor_bills`(`approved_by`);

-- CreateIndex
CREATE INDEX `vendor_bills_created_by_idx` ON `vendor_bills`(`created_by`);

-- CreateIndex
CREATE INDEX `vendor_bills_created_at_idx` ON `vendor_bills`(`created_at`);

-- CreateIndex
CREATE INDEX `vendor_bills_vendor_id_status_balance_due_idx` ON `vendor_bills`(`vendor_id`, `status`, `balance_due`);

-- CreateIndex
CREATE INDEX `vendor_payments_status_idx` ON `vendor_payments`(`status`);

-- CreateIndex
CREATE INDEX `vendor_payments_bank_id_idx` ON `vendor_payments`(`bank_id`);

-- CreateIndex
CREATE INDEX `vendor_payments_confirmed_by_idx` ON `vendor_payments`(`confirmed_by`);

-- CreateIndex
CREATE INDEX `vendor_payments_account_id_idx` ON `vendor_payments`(`account_id`);

-- CreateIndex
CREATE INDEX `vendor_payments_created_by_idx` ON `vendor_payments`(`created_by`);

-- CreateIndex
CREATE INDEX `vendor_payments_payment_date_idx` ON `vendor_payments`(`payment_date`);

-- CreateIndex
CREATE INDEX `vendor_payments_deleted_at_idx` ON `vendor_payments`(`deleted_at`);

-- CreateIndex
CREATE INDEX `vendors_is_active_deleted_at_idx` ON `vendors`(`is_active`, `deleted_at`);

-- CreateIndex
CREATE INDEX `vendors_created_at_idx` ON `vendors`(`created_at`);

-- CreateIndex
CREATE INDEX `warehouses_is_active_deleted_at_idx` ON `warehouses`(`is_active`, `deleted_at`);

-- CreateIndex
CREATE INDEX `warehouses_name_idx` ON `warehouses`(`name`);

-- CreateIndex
CREATE INDEX `warehouses_created_at_idx` ON `warehouses`(`created_at`);

-- CreateIndex
CREATE INDEX `work_order_items_item_id_idx` ON `work_order_items`(`item_id`);

-- CreateIndex
CREATE INDEX `idx_work_orders_status` ON `work_orders`(`status`);

-- CreateIndex
CREATE INDEX `work_orders_customer_vehicle_id_idx` ON `work_orders`(`customer_vehicle_id`);

-- CreateIndex
CREATE INDEX `work_orders_project_id_idx` ON `work_orders`(`project_id`);

-- CreateIndex
CREATE INDEX `work_orders_created_by_idx` ON `work_orders`(`created_by`);

-- CreateIndex
CREATE INDEX `work_orders_created_at_idx` ON `work_orders`(`created_at`);

-- CreateIndex
CREATE INDEX `work_schedules_created_at_idx` ON `work_schedules`(`created_at`);

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_customer_category_id_fkey` FOREIGN KEY (`customer_category_id`) REFERENCES `customer_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_bills` ADD CONSTRAINT `vendor_bills_withholding_type_id_fkey` FOREIGN KEY (`withholding_type_id`) REFERENCES `withholding_tax_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_payments` ADD CONSTRAINT `vendor_payments_vendor_bill_id_fkey` FOREIGN KEY (`vendor_bill_id`) REFERENCES `vendor_bills`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_issues` ADD CONSTRAINT `material_issues_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_customer_vehicle_id_fkey` FOREIGN KEY (`customer_vehicle_id`) REFERENCES `customer_vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payrolls` ADD CONSTRAINT `payrolls_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `petty_cash` ADD CONSTRAINT `petty_cash_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `petty_cash` ADD CONSTRAINT `petty_cash_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `petty_cash` ADD CONSTRAINT `petty_cash_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_centers` ADD CONSTRAINT `cost_centers_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_transfers` ADD CONSTRAINT `asset_transfers_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_cost_center_id_fkey` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `uom_conversions` ADD CONSTRAINT `uom_conversions_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_fitment_rules` ADD CONSTRAINT `vehicle_fitment_rules_vehicle_brand_id_fkey` FOREIGN KEY (`vehicle_brand_id`) REFERENCES `vehicle_brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_fitment_rules` ADD CONSTRAINT `vehicle_fitment_rules_vehicle_model_id_fkey` FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_fitment_rules` ADD CONSTRAINT `vehicle_fitment_rules_vehicle_variant_id_fkey` FOREIGN KEY (`vehicle_variant_id`) REFERENCES `vehicle_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_warehouses` ADD CONSTRAINT `user_warehouses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_warehouses` ADD CONSTRAINT `user_warehouses_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_BrandCategories` ADD CONSTRAINT `_BrandCategories_A_fkey` FOREIGN KEY (`A`) REFERENCES `brands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_BrandCategories` ADD CONSTRAINT `_BrandCategories_B_fkey` FOREIGN KEY (`B`) REFERENCES `item_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_DepartmentWorkSchedules` ADD CONSTRAINT `_DepartmentWorkSchedules_A_fkey` FOREIGN KEY (`A`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_DepartmentWorkSchedules` ADD CONSTRAINT `_DepartmentWorkSchedules_B_fkey` FOREIGN KEY (`B`) REFERENCES `work_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EmployeeWorkSchedules` ADD CONSTRAINT `_EmployeeWorkSchedules_A_fkey` FOREIGN KEY (`A`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EmployeeWorkSchedules` ADD CONSTRAINT `_EmployeeWorkSchedules_B_fkey` FOREIGN KEY (`B`) REFERENCES `work_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `crm_tickets` RENAME INDEX `crm_tickets_status_assignedto_idx` TO `crm_tickets_status_assigned_to_idx`;

-- RenameIndex
ALTER TABLE `notifications` RENAME INDEX `notifications_user_readat_idx` TO `notifications_user_id_read_at_idx`;

-- RenameIndex
ALTER TABLE `purchase_requests` RENAME INDEX `purchase_requests_vendor_id_fkey` TO `purchase_requests_vendor_id_idx`;

-- RenameIndex
ALTER TABLE `sales_returns` RENAME INDEX `sales_returns_customer_id_fkey` TO `sales_returns_customer_id_idx`;

-- RenameIndex
ALTER TABLE `sales_returns` RENAME INDEX `sales_returns_sales_invoice_id_fkey` TO `sales_returns_sales_invoice_id_idx`;

-- RenameIndex
ALTER TABLE `vendor_bills` RENAME INDEX `vendor_bills_goods_receipt_id_fkey` TO `vendor_bills_goods_receipt_id_idx`;

-- RenameIndex
ALTER TABLE `vendor_payment_allocations` RENAME INDEX `vendor_payment_allocations_vendor_bill_id_fkey` TO `vendor_payment_allocations_vendor_bill_id_idx`;


-- Putaran rekonsiliasi kedua: index bernama untuk kolom FK, yang belum ada
-- meski constraint FK-nya sudah terpasang. Juga dari prisma migrate diff.

-- CreateIndex
CREATE INDEX `attendances_employee_id_fkey` ON `attendances`(`employee_id`);

-- CreateIndex
CREATE INDEX `inventory_layers_item_id_fkey` ON `inventory_layers`(`item_id`);

-- CreateIndex
CREATE INDEX `item_batches_item_id_fkey` ON `item_batches`(`item_id`);

-- CreateIndex
CREATE INDEX `journal_entries_account_id_fkey` ON `journal_entries`(`account_id`);

-- CreateIndex
CREATE INDEX `payrolls_employee_id_fkey` ON `payrolls`(`employee_id`);

-- CreateIndex
CREATE INDEX `rack_rows_rack_id_fkey` ON `rack_rows`(`rack_id`);

-- CreateIndex
CREATE INDEX `racks_warehouse_id_fkey` ON `racks`(`warehouse_id`);

-- CreateIndex
CREATE INDEX `stock_moves_item_id_fkey` ON `stock_moves`(`item_id`);

-- CreateIndex
CREATE INDEX `vehicle_models_vehicle_brand_id_fkey` ON `vehicle_models`(`vehicle_brand_id`);

-- CreateIndex
CREATE INDEX `vendor_bills_vendor_id_fkey` ON `vendor_bills`(`vendor_id`);

