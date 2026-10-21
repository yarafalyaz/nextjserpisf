-- F-2026-10-21-016 tahap 1: atribusi penjual (snapshot) di Quotation,
-- diwariskan SalesOrder -> SalesInvoice. Migrasi aditif saja: kolom
-- nullable baru, tanpa backfill, tanpa ubah kolom existing.
-- TANPA jurnal komisi (tahap 3 ditunda-teknis vonis Lead 2026-10-21).

-- AlterTable
ALTER TABLE `quotations` ADD COLUMN `sales_employee_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `sales_orders` ADD COLUMN `sales_employee_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `sales_invoices` ADD COLUMN `sales_employee_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `quotations_sales_employee_id_idx` ON `quotations`(`sales_employee_id`);

-- CreateIndex
CREATE INDEX `sales_orders_sales_employee_id_idx` ON `sales_orders`(`sales_employee_id`);

-- CreateIndex
CREATE INDEX `sales_invoices_sales_employee_id_idx` ON `sales_invoices`(`sales_employee_id`);

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_sales_employee_id_fkey` FOREIGN KEY (`sales_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_sales_employee_id_fkey` FOREIGN KEY (`sales_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_sales_employee_id_fkey` FOREIGN KEY (`sales_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
