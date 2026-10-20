-- Nomor faktur pajak (e-Faktur/Coretax) per dokumen untuk SPT Masa PPN:
-- keluaran di faktur penjualan, masukan di tagihan vendor. Kolom opsional
-- (dokumen lama & tanpa PPN tetap NULL); aditif, bukan ALTER destruktif.
ALTER TABLE `sales_invoices`
  ADD COLUMN `tax_invoice_number` VARCHAR(191) NULL;

ALTER TABLE `vendor_bills`
  ADD COLUMN `tax_invoice_number` VARCHAR(191) NULL;
