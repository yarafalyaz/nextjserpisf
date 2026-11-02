-- Satu retur pembelian tidak boleh ditaut dua klaim garansi aktif secara
-- bersamaan. MariaDB tidak punya partial-unique atas subset klaim aktif,
-- jadi warranty.service menahan retur lewat kolom penanda ini: klaim
-- ditetapkan dan dilepas atomik dengan updateMany kondisional (CAS),
-- bukan baca-lalu-tulis atas klaim sendiri saja.
ALTER TABLE `purchase_returns`
  ADD COLUMN `supplier_claim_hold_claim_id` INTEGER NULL;
