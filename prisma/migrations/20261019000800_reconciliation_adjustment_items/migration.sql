-- R-11: item penyesuaian rekonsiliasi (setoran beredar / cek beredar) tidak
-- menunjuk baris rekening koran mana pun, jadi kolomnya harus NULL-able.
-- Baris yang sudah ada selalu terisi (ditulis matchReconciliationLine), sehingga
-- tidak ada data yang perlu dimigrasi — hanya pelonggaran constraint.
ALTER TABLE `bank_reconciliation_items` MODIFY `bank_statement_line_id` INT NULL;
