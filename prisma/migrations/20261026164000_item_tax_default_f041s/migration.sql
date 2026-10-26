-- F-2026-10-25-042-V (vonis Q-ITX-1, spec F-2026-10-25-041-S): penampung
-- default pajak per Item. Aditif saja: 3 kolom nullable di items + 2 FK
-- ke taxes (ON DELETE SET NULL mengikuti onDelete: SetNull schema).
-- Kolom NULL = perilaku existing byte-sama; tanpa backfill (legacy tanpa
-- snapshot pajak dibaca apa adanya, Putusan 4). Murni bantuan input +
-- jejak rekonsiliasi; DILARANG memengaruhi angka TaxInvoice/SPT/jurnal
-- (Putusan 6).

ALTER TABLE `items`
  ADD COLUMN `default_sales_tax_id` INTEGER NULL,
  ADD COLUMN `default_purchase_tax_id` INTEGER NULL,
  ADD COLUMN `default_dpp_percent` DECIMAL(5, 2) NULL;

ALTER TABLE `items`
  ADD CONSTRAINT `items_default_sales_tax_id_fkey`
    FOREIGN KEY (`default_sales_tax_id`) REFERENCES `taxes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `items_default_purchase_tax_id_fkey`
    FOREIGN KEY (`default_purchase_tax_id`) REFERENCES `taxes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
