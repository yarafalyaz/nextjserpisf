-- R6PA-06: satu akun login hanya boleh tertaut ke satu karyawan. Permukaan
-- self-service (slip gaji saya, pinjaman mandiri, getHrScope) memakai
-- findFirst({ where: { userId } }) tanpa urutan tentu — duplikat berarti
-- data karyawan lain bisa tampil sebagai "milik saya". Audit duplikat di
-- DB dev sebelum migrasi ini: 0 baris (GROUP BY user_id HAVING COUNT > 1).
-- NULL tetap boleh banyak (karyawan belum tertaut).
-- Indeks non-unik lama dibesarkan Prisma menjadi unik; indeks redundan
-- employees_user_id_idx dibuang (precedent: drop_index dalam rantai migrasi).
ALTER TABLE `employees` DROP INDEX `employees_user_id_idx`, ADD UNIQUE INDEX `employees_user_id_key`(`user_id`);
