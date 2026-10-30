-- Satu baris libur per tanggal kalender.
-- Holiday: tanggal adalah kunci bisnis hari libur nasional — dua baris di
-- tanggal yang sama membuat attendance summary/daily attendance menghitung
-- hari yang sama dua kali. DepartmentHoliday: uniques per (departemen,
-- tanggal), pola yang sama di lingkup departemen.
--
-- RISIKO DATA EXISTING: migrasi GAGAL bila ada duplikat tanggal. Cek dulu:
--   SELECT date, COUNT(*) FROM holidays GROUP BY date HAVING COUNT(*) > 1;
--   SELECT department_id, date, COUNT(*) FROM department_holidays
--     GROUP BY department_id, date HAVING COUNT(*) > 1;
-- Cek lokal 2026-10-30 (DB dev): holidays 33 baris / 0 grup duplikat;
-- department_holidays 0 baris / 0 grup duplikat.
-- Jalur tulis aplikasi (create/update holiday + auto-sync nasional) sudah
-- menolak duplikat di muka dan memetakan P2002 balapan ke pesan ramah, jadi
-- constraint ini adalah jaring pengaman terakhir, bukan penjaga utama.

-- CreateIndex
CREATE UNIQUE INDEX `holidays_date_key` ON `holidays`(`date`);

-- CreateIndex
CREATE UNIQUE INDEX `department_holidays_department_id_date_key` ON `department_holidays`(`department_id`, `date`);

-- DropIndex (ditutupi unique index di atas)
DROP INDEX `holidays_date_idx` ON `holidays`;
DROP INDEX `department_holidays_date_idx` ON `department_holidays`;
