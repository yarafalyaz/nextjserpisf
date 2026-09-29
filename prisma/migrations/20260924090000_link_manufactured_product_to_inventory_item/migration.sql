ALTER TABLE `products`
  ADD COLUMN `inventory_item_id` INTEGER NULL;

CREATE UNIQUE INDEX `products_inventory_item_id_key`
  ON `products`(`inventory_item_id`);

ALTER TABLE `products`
  ADD CONSTRAINT `products_inventory_item_id_fkey`
  FOREIGN KEY (`inventory_item_id`) REFERENCES `items`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
