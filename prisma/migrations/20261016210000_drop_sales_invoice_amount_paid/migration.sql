-- Buang kolom mati `sales_invoices.amount_paid`.
--
-- Temuan audit: `amountPaid` hanya disebut SEKALI di seluruh repo — di schema.prisma
-- itu sendiri; nol rujukan di kode. Yang benar-benar dipakai (dan diperbarui hook
-- pembayaran) adalah `paidAmount`. Dua kolom dengan makna mirip itu berbahaya karena
-- pembaca berikutnya bisa memakai yang salah dan nilainya selalu 0.
--
-- Aman: saat dijalankan di DB dev, tabel `sales_invoices` kosong (0 baris), dan
-- karena tak ada kode yang menulis `amount_paid`, nilainya memang selalu default 0.
--
-- Idempoten.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND COLUMN_NAME = 'amount_paid');
SET @s := IF(@c = 1, 'ALTER TABLE `sales_invoices` DROP COLUMN `amount_paid`', 'SELECT 1');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
