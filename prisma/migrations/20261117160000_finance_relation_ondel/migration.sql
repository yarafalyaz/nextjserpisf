-- Kontrak onDelete eksplisit untuk relasi dokumen keuangan (audit 2026-11-17).
--
-- Sebelumnya 13 relasi mengandalkan DEFAULT Prisma: relasi WAJIB -> Restrict,
-- relasi OPSIONAL -> SetNull. Akibat nyatanya terlihat di DB: FK
-- `vendor_payments_vendor_bill_id_fkey` adalah SET NULL, sehingga hard-delete
-- sebuah tagihan vendor akan diam-diam melepas tautan pembayaran yang sudah
-- menunjuknya — fakta finansial hilang tanpa jejak. Kontraknya kini ditulis
-- eksplisit di schema dan ditegakkan di DDL.
--
-- Aturan yang dipakai:
--   * Fakta keuangan (pihak dokumen, dokumen sumber, dokumen pembayaran):
--     RESTRICT. Menghapus induk yang masih dirujuk ditolak DB.
--   * Relasi opsional referensial (project, purchase order pada tagihan):
--     SET NULL. Tagihan tetap sah walau proyek/PO dihapus.
--
-- Prisma/MySQL tidak mendukung "ALTER ... SET DELETE RULE"; aturan berubah
-- dengan DROP + ADD constraint. Pre-check gagal-berisik di bawah menghentikan
-- deploy bila ada baris yatim yang membuat ADD gagal (errno 1452).

SET @pre := (
  SELECT COUNT(*) FROM (
    SELECT 1 FROM `vendor_payments` p
      LEFT JOIN `vendor_bills` b ON b.`id` = p.`vendor_bill_id`
      WHERE p.`vendor_bill_id` IS NOT NULL AND b.`id` IS NULL
    UNION ALL
    SELECT 1 FROM `sales_payments` p
      LEFT JOIN `sales_invoices` b ON b.`id` = p.`sales_invoice_id`
      WHERE p.`sales_invoice_id` IS NOT NULL AND b.`id` IS NULL
  ) yatim
);
SET @sql := IF(
  @pre > 0,
  'SELECT 1 FROM `finance_fk_PRE_CHECK_YATIM_MIGRATION_MUST_STOP`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1. Pembayaran vendor -> tagihan: SET NULL menjadi RESTRICT.
ALTER TABLE `vendor_payments` DROP FOREIGN KEY `vendor_payments_vendor_bill_id_fkey`;
ALTER TABLE `vendor_payments`
  ADD CONSTRAINT `vendor_payments_vendor_bill_id_fkey`
  FOREIGN KEY (`vendor_bill_id`) REFERENCES `vendor_bills`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Tagihan vendor -> purchase order: SET NULL (opsional referensial).
ALTER TABLE `vendor_bills` DROP FOREIGN KEY `vendor_bills_purchase_order_id_fkey`;
ALTER TABLE `vendor_bills`
  ADD CONSTRAINT `vendor_bills_purchase_order_id_fkey`
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Tagihan vendor -> project: SET NULL.
ALTER TABLE `vendor_bills` DROP FOREIGN KEY `vendor_bills_project_id_fkey`;
ALTER TABLE `vendor_bills`
  ADD CONSTRAINT `vendor_bills_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Faktur penjualan -> penawaran & pesanan: RESTRICT (dokumen sumber).
ALTER TABLE `sales_invoices` DROP FOREIGN KEY `sales_invoices_quotation_id_fkey`;
ALTER TABLE `sales_invoices`
  ADD CONSTRAINT `sales_invoices_quotation_id_fkey`
  FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sales_invoices` DROP FOREIGN KEY `sales_invoices_sales_order_id_fkey`;
ALTER TABLE `sales_invoices`
  ADD CONSTRAINT `sales_invoices_sales_order_id_fkey`
  FOREIGN KEY (`sales_order_id`) REFERENCES `sales_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
