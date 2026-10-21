-- F-2026-10-21-018: harga bertingkat CustomerPriceList (minQty inklusif)
-- + persist sumber harga di baris faktur (BR-TIER-09).
-- Baris lama CustomerPriceList terbaca minQty 1.00 (default kolom), tanpa backfill.
-- Unique lama [kategori, item, tanggal] diganti [kategori, item, minQty, tanggal];
-- MySQL tetap memperlakukan NULL kategori sebagai berbeda, duplikat kategori-null
-- tetap dicegah cek aplikasi di customer-price-list.actions.ts.

-- AlterTable
ALTER TABLE `customer_price_lists` ADD COLUMN `min_qty` DECIMAL(15, 2) NOT NULL DEFAULT 1.00;

-- DropIndex
DROP INDEX `uq_customer_price_list` ON `customer_price_lists`;

-- CreateIndex
CREATE UNIQUE INDEX `uq_customer_price_list` ON `customer_price_lists`(`customer_category_id`, `item_id`, `min_qty`, `effective_date`);

-- AlterTable
ALTER TABLE `sales_invoice_items` ADD COLUMN `price_source` VARCHAR(191) NULL;
ALTER TABLE `sales_invoice_items` ADD COLUMN `price_list_id` INTEGER NULL;
ALTER TABLE `sales_invoice_items` ADD COLUMN `price_list_min_qty` DECIMAL(15, 2) NULL;
