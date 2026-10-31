-- Q-CD-1 hardening: baris kunci serialisasi gerbang BLOKIR NPWP pelanggan.
-- findCustomerNpwpConflict menormalisasi NPWP di memori (master lama bisa
-- beda format), jadi unique constraint atas kolom tax_id mentah tidak bisa
-- menjadi backstop. Sebagai gantinya penulis NPWP mengunci baris tunggal
-- ini (SELECT ... FOR UPDATE) di dalam transaksinya sebelum scan + tulis,
-- sehingga scan konflik tidak bisa dilewati dua request konkuren.
CREATE TABLE `customer_npwp_gate` (
  `id` INT NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `customer_npwp_gate` (`id`) VALUES (1);
