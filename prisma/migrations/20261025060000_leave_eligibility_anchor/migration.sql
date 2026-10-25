-- Jangkar masa kerja hak cuti: masa magang (INTERN) tidak terhitung.
-- Terisi saat karyawan berubah status menjadi kontrak (PKWT/PKWTT);
-- kosong berarti dihitung dari tanggal masuk seperti sebelumnya.

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `leave_eligibility_start_date` DATETIME(3) NULL;
