-- F-2026-10-25-024-S (BR-OT-09/BR-OT-11): snapshot rincian dasar upah
-- lembur Pasal 32 PP 35/2021, ditulis approveOvertime pada klaim atomik
-- yang sama dengan calculatedValue. Aditif saja: 1 kolom JSON nullable di
-- overtime_requests. NULL = baris approved sebelum snapshot ada (tanpa
-- backfill — nilai approved beku, rincian tidak dikarang dari master kini).
-- Dibaca verbatim hanya lewat loader bergate view_payroll; loader rekap
-- BR-OVR-12 tidak berubah.

ALTER TABLE `overtime_requests`
  ADD COLUMN `overtime_base_snapshot` JSON NULL;
