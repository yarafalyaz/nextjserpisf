-- R6IE-07: bekukan alamat/email pembeli di TaxInvoice dan jasa/barang di
-- baris faktur penjualan, supaya ekspor Coretax tidak membaca master berjalan.
ALTER TABLE `tax_invoices` ADD COLUMN `buyer_address` TEXT NULL, ADD COLUMN `buyer_email` VARCHAR(191) NULL;
ALTER TABLE `sales_invoice_items` ADD COLUMN `is_service` BOOLEAN NULL;
