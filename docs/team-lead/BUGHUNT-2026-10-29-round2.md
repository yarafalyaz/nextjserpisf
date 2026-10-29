# Bug Hunt Round 2 — 2026-10-29 (8 agen, read-only)

Total ±90 temuan dari 8 agen. Tree bersih, 0 PR open.

## HIGH — paling serius (verifikasi silang 2+ agen)

### Keamanan HR
1. Team-scope bypass cuti/pinjaman — cek manual hanya self/department, `team` lolos. `src/actions/hrm.actions.ts:979,4924,3712,5190`.
2. Approval generik resurrect slip `rejected` → `approved` tanpa HR scope. `src/actions/approval.actions.ts:230-283`.
3. Route workflow manual tanpa HR scope. `src/app/api/workflow/[...path]/route.ts:218-276`.

### Slip gaji UI
4. Sukses palsu finalisasi/bayar: return `{success:false}` diabaikan, selalu toast sukses. `approve-button.tsx:19`, `mark-paid-button.tsx:19`.
5. Tombol slip tanpa gerbang `process_payroll` — user view-only bisa klik. `penggajian/[slug]/page.tsx:100-115`.

### Komisi
6. Faktur turun dari `paid` tak pernah un-accrue komisi — tetap bisa dibayar atas piutang tak lunas. `sales-payment.hook.ts:84-104`.
7. `deleteJournalByReferenceTx` cascade lolos gerbang periode untuk jurnal REVERSED → tulis ulang GL periode tertutup senyap. `accounting.hook.ts:152-189`.

### Laporan/PDF
8. Total baris geser kolom (est. vs aktual 9 kolom + pola sistemik aging/AR-AP/ledger). `job-estimate-vs-actual.ts:216-230`, `aging-reports-data.ts:90,223`, `ar-ap-summary-data.ts:78-94`, `ledger-cash-data.ts:752-774`.
9. PDF stok buang filter slug diam-diam (registry cuma terima digit). `report-registry.ts:921-941`.
10. Multi-periode `jumlah=abc` → NaN → 500. `multi-periode/page.tsx:47,125`.

### Infrastruktur/Perf
11. Gate Sonar eksternal wajib pass, CI tanpa job Sonar → antrean merge macet total bila app mati. `.github/workflows/antrean-merge.yml:96,124` vs `ci.yml`.
12. Balance sheet scan penuh: semua baris jurnal ke memori. `statement-data.ts:78`.
13. Detail WO ~23 await serial. `produksi/perintah-kerja/[slug]/page.tsx`.

### Aksesibilitas
14. Combobox tanpa nama screen-reader untuk label eksternal. `combobox.tsx:93-100`, `report-period-filter.tsx:128-138`.
15. MonthPicker keyboard rusak + 28px. `month-picker.tsx:133-177`.

### Guard/Tes
16. `schema-usage` buta: korpus ikut tes/komentar; kolom model mati lolos. `schema-usage.test.ts:202-220`, `EmployeeRoster` yatim total (`schema.prisma:3514`).
17. `silent-failure` skip per-berkas; pola catch keluar regex. `silent-failure.test.ts:44,313-328`.
18. `wired-transition` cuma regex kemunculan, bukan pemanggilan. `wired-transition-actions.test.ts:148-167`.
19. Jalur bayar komisi via slip NOL cakupan tes nyata (mock tanpa delegate). `accounting-hook.test.ts:209`, `payroll-paid-lock.test.ts:43`.
20. Tes `paidByIdTx` tak bisa membedakan findFirst vs findUnique (fixture satu baris). `commission-payable.test.ts:231-250`.
21. E2E assertion tautologis terhadap chrome sidebar. `module-coverage.spec.ts:12-19`, `payroll-flow.spec.ts:5-8`.
22. TaxInvoice unique hilang: cegah duplikat cuma service non-atomik → race. `schema.prisma:1381`.

## MEDIUM (ringkas)

- catch-telan accrue bisa commit jurnal tanpa entri (`sales-payment.hook.ts:101-103`).
- addPayrollCommissionLine TOCTOU draft (`hrm.actions.ts:748-800`); deadlock urutan kunci.
- reverseTx replay melempar; paidByIdTx kunci salah; akun beban komisi tak divalidasi tipe.
- Workflow route telan gagal step; StatusActions `sent` tak muncul; AddressPicker 500 diam.
- Masa pajak tak pernah dikirim form ketetapan; batal timpa notes asli.
- `.next/standalone` basi (perlu `npm run build` sebelum E2E).
- Column estimate mati, VendorBillItem tanpa FK, seed komisi tak lengkap, loader estimate-vs-actual nol test.
- 59 waitForTimeout / 143 networkidle tersisa; CI tanpa job Playwright; `reuseExistingServer: !CI`.
- N+1 cron + goods-receipt; `new Intl.*` per panggilan (1656x); gambar `unoptimized`.
- Touch <44px: kalender 36px, X dialog ~16px, tombol dialog 36px, Setujui/Tolak 32px, VoidButton 32px.
- `aria-label="Hapus"` generik ±50 pemakaian; tabel lebar tanpa caption/sticky.

## Urutan saran

1. Keamanan HR 1–3 (scope: assertHrEmployeeAccess di semua jalur).
2. Slip 4–5 (cek success + hasPermission process_payroll).
3. Komisi 6 + delete cascade 7 (un-accrue + assert semua jurnal cascade).
4. Laporan/PDF 8–10 (total trailing, slug registry, NaN guard).
5. Guard/tes 16–21 (korpus produk saja, pola catch luas, cakupan komisi).
6. Perf 11–13 (groupBy neraca, paralel WO, job Sonar internal).
7. Skema 22 + roster yatim + seed komisi.
