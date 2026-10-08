-- Menyelaraskan pengeluaran (expense) & kas kecil (petty cash) dengan pola
-- Jurnal Operasional: Deskripsi · Nama Project · Vendor · Kategori.
--
-- - expenses.vendor_id: pemasok/toko tempat biaya dibayarkan.
-- - petty_cash.project_id / vendor_id / category_id: label project & vendor
--   serta kategori biaya untuk tiap transaksi kas kecil.
ALTER TABLE `expenses` ADD COLUMN `vendor_id` INTEGER NULL;
CREATE INDEX `expenses_vendor_id_idx` ON `expenses`(`vendor_id`);

ALTER TABLE `petty_cash` ADD COLUMN `project_id` INTEGER NULL;
ALTER TABLE `petty_cash` ADD COLUMN `vendor_id` INTEGER NULL;
ALTER TABLE `petty_cash` ADD COLUMN `category_id` INTEGER NULL;
CREATE INDEX `petty_cash_project_id_idx` ON `petty_cash`(`project_id`);
CREATE INDEX `petty_cash_vendor_id_idx` ON `petty_cash`(`vendor_id`);
CREATE INDEX `petty_cash_category_id_idx` ON `petty_cash`(`category_id`);
