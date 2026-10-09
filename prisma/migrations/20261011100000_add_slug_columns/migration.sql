-- Add a nullable, unique `slug` column to every routed entity table.
-- Slugs are backfilled by scripts/backfill-slugs.mjs after migration.

ALTER TABLE `roles` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `roles_slug_key` ON `roles`(`slug`);

ALTER TABLE `customers` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `customers_slug_key` ON `customers`(`slug`);

ALTER TABLE `customer_categories` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `customer_categories_slug_key` ON `customer_categories`(`slug`);

ALTER TABLE `vendors` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `vendors_slug_key` ON `vendors`(`slug`);

ALTER TABLE `brands` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `brands_slug_key` ON `brands`(`slug`);

ALTER TABLE `items` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `items_slug_key` ON `items`(`slug`);

ALTER TABLE `item_categories` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `item_categories_slug_key` ON `item_categories`(`slug`);

ALTER TABLE `warehouses` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `warehouses_slug_key` ON `warehouses`(`slug`);

ALTER TABLE `racks` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `racks_slug_key` ON `racks`(`slug`);

ALTER TABLE `rack_rows` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `rack_rows_slug_key` ON `rack_rows`(`slug`);

ALTER TABLE `departments` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `departments_slug_key` ON `departments`(`slug`);

ALTER TABLE `positions` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `positions_slug_key` ON `positions`(`slug`);

ALTER TABLE `employees` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `employees_slug_key` ON `employees`(`slug`);

ALTER TABLE `accounts` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `accounts_slug_key` ON `accounts`(`slug`);

ALTER TABLE `payment_terms` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `payment_terms_slug_key` ON `payment_terms`(`slug`);

ALTER TABLE `payment_methods` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `payment_methods_slug_key` ON `payment_methods`(`slug`);

ALTER TABLE `shipping_methods` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `shipping_methods_slug_key` ON `shipping_methods`(`slug`);

ALTER TABLE `quotations` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `quotations_slug_key` ON `quotations`(`slug`);

ALTER TABLE `down_payments` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `down_payments_slug_key` ON `down_payments`(`slug`);

ALTER TABLE `sales_orders` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `sales_orders_slug_key` ON `sales_orders`(`slug`);

ALTER TABLE `sales_invoices` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `sales_invoices_slug_key` ON `sales_invoices`(`slug`);

ALTER TABLE `sales_payments` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `sales_payments_slug_key` ON `sales_payments`(`slug`);

ALTER TABLE `sales_returns` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `sales_returns_slug_key` ON `sales_returns`(`slug`);

ALTER TABLE `purchase_requests` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `purchase_requests_slug_key` ON `purchase_requests`(`slug`);

ALTER TABLE `purchase_orders` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `purchase_orders_slug_key` ON `purchase_orders`(`slug`);

ALTER TABLE `goods_receipts` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `goods_receipts_slug_key` ON `goods_receipts`(`slug`);

ALTER TABLE `purchase_returns` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `purchase_returns_slug_key` ON `purchase_returns`(`slug`);

ALTER TABLE `vendor_bills` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `vendor_bills_slug_key` ON `vendor_bills`(`slug`);

ALTER TABLE `vendor_payments` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `vendor_payments_slug_key` ON `vendor_payments`(`slug`);

ALTER TABLE `delivery_orders` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `delivery_orders_slug_key` ON `delivery_orders`(`slug`);

ALTER TABLE `stock_moves` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `stock_moves_slug_key` ON `stock_moves`(`slug`);

ALTER TABLE `stock_adjustments` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `stock_adjustments_slug_key` ON `stock_adjustments`(`slug`);

ALTER TABLE `inventory_transfers` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `inventory_transfers_slug_key` ON `inventory_transfers`(`slug`);

ALTER TABLE `material_issues` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `material_issues_slug_key` ON `material_issues`(`slug`);

ALTER TABLE `products` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `products_slug_key` ON `products`(`slug`);

ALTER TABLE `bom_revisions` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `bom_revisions_slug_key` ON `bom_revisions`(`slug`);

ALTER TABLE `production_orders` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `production_orders_slug_key` ON `production_orders`(`slug`);

ALTER TABLE `qc_checklists` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `qc_checklists_slug_key` ON `qc_checklists`(`slug`);

ALTER TABLE `qc_inspections` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `qc_inspections_slug_key` ON `qc_inspections`(`slug`);

ALTER TABLE `nonconformances` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `nonconformances_slug_key` ON `nonconformances`(`slug`);

ALTER TABLE `work_orders` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `work_orders_slug_key` ON `work_orders`(`slug`);

ALTER TABLE `leave_requests` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `leave_requests_slug_key` ON `leave_requests`(`slug`);

ALTER TABLE `overtime_requests` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `overtime_requests_slug_key` ON `overtime_requests`(`slug`);

ALTER TABLE `payrolls` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `payrolls_slug_key` ON `payrolls`(`slug`);

ALTER TABLE `employee_loans` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `employee_loans_slug_key` ON `employee_loans`(`slug`);

ALTER TABLE `timesheets` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `timesheets_slug_key` ON `timesheets`(`slug`);

ALTER TABLE `journals` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `journals_slug_key` ON `journals`(`slug`);

ALTER TABLE `expense_categories` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `expense_categories_slug_key` ON `expense_categories`(`slug`);

ALTER TABLE `expenses` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `expenses_slug_key` ON `expenses`(`slug`);

ALTER TABLE `petty_cash` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `petty_cash_slug_key` ON `petty_cash`(`slug`);

ALTER TABLE `budgets` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `budgets_slug_key` ON `budgets`(`slug`);

ALTER TABLE `cost_centers` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `cost_centers_slug_key` ON `cost_centers`(`slug`);

ALTER TABLE `bank_statements` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `bank_statements_slug_key` ON `bank_statements`(`slug`);

ALTER TABLE `bank_reconciliations` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `bank_reconciliations_slug_key` ON `bank_reconciliations`(`slug`);

ALTER TABLE `leads` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `leads_slug_key` ON `leads`(`slug`);

ALTER TABLE `crm_tickets` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `crm_tickets_slug_key` ON `crm_tickets`(`slug`);

ALTER TABLE `asset_categories` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `asset_categories_slug_key` ON `asset_categories`(`slug`);

ALTER TABLE `asset_brands` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `asset_brands_slug_key` ON `asset_brands`(`slug`);

ALTER TABLE `assets` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `assets_slug_key` ON `assets`(`slug`);

ALTER TABLE `asset_transfers` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `asset_transfers_slug_key` ON `asset_transfers`(`slug`);

ALTER TABLE `vehicle_brands` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `vehicle_brands_slug_key` ON `vehicle_brands`(`slug`);

ALTER TABLE `vehicle_models` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `vehicle_models_slug_key` ON `vehicle_models`(`slug`);

ALTER TABLE `vehicles` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `vehicles_slug_key` ON `vehicles`(`slug`);

ALTER TABLE `projects` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `projects_slug_key` ON `projects`(`slug`);

ALTER TABLE `approval_workflows` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `approval_workflows_slug_key` ON `approval_workflows`(`slug`);

ALTER TABLE `approvals` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `approvals_slug_key` ON `approvals`(`slug`);

ALTER TABLE `banks` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `banks_slug_key` ON `banks`(`slug`);

ALTER TABLE `taxes` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `taxes_slug_key` ON `taxes`(`slug`);

ALTER TABLE `barcodes` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `barcodes_slug_key` ON `barcodes`(`slug`);

ALTER TABLE `tax_groups` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `tax_groups_slug_key` ON `tax_groups`(`slug`);

ALTER TABLE `statistical_key_figures` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `statistical_key_figures_slug_key` ON `statistical_key_figures`(`slug`);

ALTER TABLE `allocation_rules` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `allocation_rules_slug_key` ON `allocation_rules`(`slug`);

ALTER TABLE `unit_of_measures` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `unit_of_measures_slug_key` ON `unit_of_measures`(`slug`);

ALTER TABLE `appreciations` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `appreciations_slug_key` ON `appreciations`(`slug`);

ALTER TABLE `tasks` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `tasks_slug_key` ON `tasks`(`slug`);

ALTER TABLE `vehicle_fitment_rules` ADD COLUMN `slug` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `vehicle_fitment_rules_slug_key` ON `vehicle_fitment_rules`(`slug`);
