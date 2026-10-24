-- F-2026-10-22-076-S (Q-PF-3 diputus BOT 3): kunci anti-dobel slip digeser
-- dari (employee_id, period) ke (employee_id, start_date, end_date) supaya
-- karyawan WEEKLY bisa punya 4-5 slip sah dalam satu bulan kalender
-- (period tetap "YYYY-MM" bulan endDate, V-PF2-1 BOT 4 PR #521).
-- Penjaga irisan rentang (rentang beririsan ditolak, bersebelahan lolos)
-- hidup di aksi hrm.actions (generateBulkPayroll/processPayroll/updatePayroll)
-- di dalam transaksi dengan lock baris karyawan.
-- CATATAN OPERASIONAL: bila data existing memuat >1 slip karyawan sama
-- dengan rentang persis sama (start_date+end_date identik), CREATE UNIQUE
-- INDEX ini gagal — bersihkan duplikat itu dulu (slip dobel rentang sama
-- memang tidak sah menurut BR-PF-03).

DROP INDEX `uq_payroll_employee_period` ON `payrolls`;

CREATE UNIQUE INDEX `uq_payroll_employee_range` ON `payrolls`(`employee_id`, `start_date`, `end_date`);
