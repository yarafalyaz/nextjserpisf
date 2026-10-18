-- Hidupkan kolom category sebagai pemisah Barang/Jasa.
-- Baris lama (category NULL): JASA -> jasa, sisanya -> barang.
UPDATE unit_of_measures SET category = CASE WHEN UPPER(symbol) = 'JASA' THEN 'jasa' ELSE 'barang' END WHERE category IS NULL;
