-- F-2026-10-25-021-S tahap 1: jadwal servis berikutnya per kendaraan.
-- Kolom nullable aditif di customer_vehicles; NULL = belum terjadwal.
-- Status pengingat turunan baca-saja (builder), bukan kolom status.
-- Pencatat tercatat di next_service_updated_by/at (BR-SV-08).
ALTER TABLE `customer_vehicles`
  ADD COLUMN `next_service_date` DATE NULL,
  ADD COLUMN `next_service_km` INTEGER NULL,
  ADD COLUMN `next_service_note` TEXT NULL,
  ADD COLUMN `next_service_updated_by` INTEGER NULL,
  ADD COLUMN `next_service_updated_at` DATETIME(3) NULL;
