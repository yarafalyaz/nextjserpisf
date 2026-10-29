-- Round2 skema: TaxInvoice @@index([direction, taxInvoiceNumber]) -> @@unique.
-- Nomor faktur pajak sama pada arah sama = dokumen sama; duplikat harus
-- ditolak DB, bukan hanya guard service.
--
-- RISIKO DATA EXISTING: migrasi GAGAL bila ada duplikat (direction,
-- tax_invoice_number). Cek dulu sebelum deploy:
--   SELECT direction, tax_invoice_number, COUNT(*) c FROM tax_invoices
--   GROUP BY direction, tax_invoice_number HAVING c > 1;
-- Selesaikan duplikat manual (faktur pengganti / batalkan salah satu),
-- JANGAN hapus baris sembarangan (jejak SPT/Coretax).
-- Cek lokal 2026-10-29 (DB dev silengkap_dev_db): 0 baris tax_invoices,
-- 0 duplikat — risiko hanya di DB produksi yang belum tercek dari sini.

-- DropIndex
DROP INDEX `idx_tax_invoices_direction_number` ON `tax_invoices`;

-- CreateIndex (unique)
CREATE UNIQUE INDEX `uq_tax_invoices_direction_number` ON `tax_invoices`(`direction`, `tax_invoice_number`);
