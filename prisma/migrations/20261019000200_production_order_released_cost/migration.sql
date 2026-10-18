-- P1-3: akumulasi biaya aktual yang sudah di-release per production order.
-- Genealogi final butuh total biaya SEMUA release; totalActualCost di-nol-kan
-- saat final sehingga total tak bisa direkonstruksi tanpa kolom ini.
-- Order lama (completed sebelum kolom ada): NULL = tak diketahui, genealogi
-- lama dibiarkan apa adanya.
ALTER TABLE `production_orders`
  ADD COLUMN `released_cost` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
