# Autonomous 6H — 2026-10-30

Misi: cari + perbaiki bug backend/frontend/ERP silengkap terus-menerus.
Sumber awal: `docs/team-lead/BUGHUNT-2026-10-30-round3.md` (CRITICALx1, HIGHx13).
Aturan: agen paralel file tak tumpang-tindih; tiap fix = tes regresi;
verifikasi gabungan (typecheck + test terdampak) sebelum commit lokal;
commit per batch logis di `main`, TANPA push tanpa perintah.
Checkpoint file ini diperbarui tiap batch selesai.

## Batch 1 — HIGH round3 (SELESAI, committed)
- [x] #1 PDF total (728dbc4bb) · #2-5 akuntansi (46398e68d) · #6-7 purchase/sales (0d56266b4)
- [x] #8-10 SDM + approval MEDIUM (dd30433e5) · #11-12 produksi (a5a46f2ef)
- [ ] #13-14 guard/CI: reverseJournal UI (journal-table berubah, commit menunggu agen), 7 suite CI (ci.yml +143 baris berubah, verifikasi menunggu agen guard)

## Batch 2 — MEDIUM round3
- [x] cek periode di dalam tx (656b7300e)
- [x] klaim terminal approval semua model HR + calculatedValue lembur generik (dd30433e5)
- [ ] updateEmployee gerbang view_salary_amounts; upsertPerformanceGoal pemilik
- [ ] updateBomRevision klaim; change-order reservasi; guard complete WO dlm tx
- [ ] dedupe timesheet proyek; N+1 start WO; aging batas; PDF NaN; formatAccounting cache
- [ ] audit 5 builder pola total sama: payment-expenses, stock-count, min-stock, sales/purchase-process-history, payroll-reports:262
- [ ] wired-transition detektor; schema-usage FK/enum; ci.yml permissions; E2E tautologi sisa

## Batch 3 — riset lanjutan
- [ ] audit domain belum tersentuh: CRM, proyek, aset, kendaraan, master, pengaturan
- [ ] sapu runtime browser: halaman detail/form per modul (console + interaksi)
- [ ] perf: loader serial, findMany tak terbatas, N+1 sisa (grep sistematis)
- [ ] keamanan: requirePermission/assertPeriodOpen cakupan semua server action

## Batch 4 — verifikasi berat
- [ ] npm run ci:quick penuh; build produksi; E2E subset bila DB seed memungkinkan
- [ ] db:check-migrations bila MIGRATION_CHECK_URL tersedia

## Log
- 2026-10-30 mulai: batch 1 dikerahkan (6 agen).
- Sesi terpotong; resume: 6 agen gelombang 2. Commit: 656b7300e periode,
  46398e68d akuntansi, dd30433e5 HR/approval, 728dbc4bb PDF,
  a5a46f2ef produksi, 0d56266b4 purchase/sales.
- Round4 audit (CRM/proyek/aset/kendaraan): 2 HIGH + 5 MED + 1 LOW tertulis
  di BUGHUNT round3; 3 agen fix jalan. Agen guard/CI masih jalan.
