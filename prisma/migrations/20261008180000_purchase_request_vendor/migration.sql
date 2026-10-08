-- Add optional suggested vendor to Purchase Request.
-- A PR records WHAT is needed; the vendor is only a recommendation used to
-- prefill the Purchase Order (and can still be changed on the PO).

ALTER TABLE `purchase_requests`
  ADD COLUMN `vendor_id` INTEGER NULL;

CREATE INDEX `purchase_requests_vendor_id_fkey` ON `purchase_requests`(`vendor_id`);

ALTER TABLE `purchase_requests`
  ADD CONSTRAINT `purchase_requests_vendor_id_fkey`
  FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
