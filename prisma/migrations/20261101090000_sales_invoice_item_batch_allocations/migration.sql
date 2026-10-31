-- STOK-01: atribusi konsumsi FIFO per layer sumber pada baris faktur jual.
-- Void memulihkan lot persis dari JSON ini; retur menilai restock pada cost
-- asal. Nullable: baris lama tetap null (perilaku tanpa lot seperti semula).
ALTER TABLE `sales_invoice_items` ADD COLUMN `batch_allocations` JSON NULL;
