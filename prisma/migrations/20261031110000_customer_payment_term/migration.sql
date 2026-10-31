-- R8-JB-09: termin master pelanggan (cermin vendors.payment_term_id yang
-- sudah ada sejak 20260527071611). dueDate faktur yang lahir tanpa isian
-- eksplisit diturunkan dari PaymentTerm.days lawan; kolom ini sumbernya.
-- Kolom nullable: pelanggan lama tanpa termin tetap sah (jatuh tempo null).
ALTER TABLE `customers` ADD COLUMN `payment_term_id` INTEGER NULL;
ALTER TABLE `customers` ADD CONSTRAINT `customers_payment_term_id_fkey` FOREIGN KEY (`payment_term_id`) REFERENCES `payment_terms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `customers_payment_term_id_fkey` ON `customers`(`payment_term_id`);
