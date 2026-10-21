-- Paritas skema: rantai migrasi harus mereproduksi schema.prisma persis
-- (gerbang `npm run db:check-migrations` menemukan 12 pernyataan drift).
--
-- Temuan terpenting: migrasi 20261019000600 membuat kolom
-- `stocktake_lines.system_qty`, sedangkan schema.prisma mendeklarasikan
-- field `systemQty` TANPA @map — Prisma Client membaca kolom `systemQty`.
-- Di database hasil `migrate deploy` (jalur provisioning produksi),
-- query stocktake_lines akan gagal "column does not exist". Diperbaiki
-- dengan RENAME COLUMN (tipe sudah sama DECIMAL(15,2) NOT NULL DEFAULT 0)
-- supaya data yang tersimpan tidak hilang — BUKAN drop+add seperti yang
-- disarankan keluaran diff mentah.
--
-- Sisanya penyelarasan definisi: nullability document_no/slug, default
-- updated_at (dikelola @updatedAt di aplikasi, bukan default DB), nama
-- index unik bawaan Prisma (`_key`), dan index FK yang hanya dibuat
-- `db push` tetapi tak pernah ditulis migrasi.

ALTER TABLE `stocktake_lines` RENAME COLUMN `system_qty` TO `systemQty`;

ALTER TABLE `stocktake_sessions`
  MODIFY `document_no` VARCHAR(191) NOT NULL,
  MODIFY `slug` VARCHAR(191) NULL,
  ALTER COLUMN `updated_at` DROP DEFAULT;

ALTER TABLE `remnants`
  MODIFY `document_no` VARCHAR(191) NOT NULL,
  ALTER COLUMN `updated_at` DROP DEFAULT;

ALTER TABLE `customer_credits` ALTER COLUMN `updated_at` DROP DEFAULT;

CREATE INDEX `bank_reconciliation_items_bank_reconciliation_id_fkey`
  ON `bank_reconciliation_items`(`bank_reconciliation_id`);

ALTER TABLE `remnants`
  RENAME INDEX `remnants_document_no_unique` TO `remnants_document_no_key`;

ALTER TABLE `stocktake_sessions`
  RENAME INDEX `stocktake_sessions_document_no_unique` TO `stocktake_sessions_document_no_key`;

ALTER TABLE `stocktake_sessions`
  RENAME INDEX `stocktake_sessions_slug_unique` TO `stocktake_sessions_slug_key`;
