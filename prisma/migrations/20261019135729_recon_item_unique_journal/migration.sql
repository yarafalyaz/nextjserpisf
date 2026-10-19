-- R-03: satu entri jurnal hanya boleh dipakai sekali per rekonsiliasi.
-- UNIQUE aditif (bukan DROP/ALTER destruktif). MySQL mengizinkan banyak NULL
-- di journal_entry_id sehingga item penyesuaian (keduanya NULL) tak terpengaruh.
-- Nomor migrasi > 20261019001400 (terbaru saat audit) — format YYYYMMDDHHMMSS.
ALTER TABLE `bank_reconciliation_items`
  ADD UNIQUE INDEX `uq_recon_items_recon_journal`(`bank_reconciliation_id`, `journal_entry_id`);
