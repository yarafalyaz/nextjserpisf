-- Additive nullable JSON columns -> no data loss, existing rows stay NULL.
-- Transfers are MOVE operations: the FIFO lots/serials consumed at the source
-- must be re-created/revived at the destination on receive. These columns record
-- what processInventoryTransfer actually consumed.
ALTER TABLE `inventory_transfer_items` ADD COLUMN `serial_numbers` JSON NULL;
ALTER TABLE `inventory_transfer_items` ADD COLUMN `batch_allocations` JSON NULL;
