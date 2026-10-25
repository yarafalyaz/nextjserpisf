-- F-2026-10-25-004-S inti (putusan Lead §8A PR #836 + vonis Accountant
-- F-2026-10-25-019-V): identitas pajak terstruktur master pelanggan.
-- Aditif saja, model Customer SAJA: 5 kolom baru nullable/default-aman.
-- tax_id TETAP NPWP (tanpa rename/backfill); baris lama = null/unknown.

-- AlterTable
ALTER TABLE `customers`
  ADD COLUMN `taxpayer_name` VARCHAR(191) NULL,
  ADD COLUMN `tax_address` TEXT NULL,
  ADD COLUMN `nitku` VARCHAR(191) NULL,
  ADD COLUMN `pkp_status` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  ADD COLUMN `pkp_effective_from` DATE NULL,
  ADD COLUMN `pkp_source` VARCHAR(191) NULL;
