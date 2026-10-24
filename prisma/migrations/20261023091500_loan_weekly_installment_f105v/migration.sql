-- F-2026-10-23-105-V (vonis BOT 4): nominal cicilan mingguan tersimpan per
-- pinjaman. Aditif nullable — baris existing semua NULL = tanpa jadwal
-- mingguan tertulis; tidak ada perilaku berubah tanpa isi eksplisit.
ALTER TABLE `employee_loans` ADD COLUMN `weekly_installment` DECIMAL(15, 2) NULL;
