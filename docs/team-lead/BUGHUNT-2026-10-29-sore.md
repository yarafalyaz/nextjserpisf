# Bug Hunt 2026-10-29 Sore (8 agen, read-only)

## S1 — kritis (10)

Komisi (baru, belum battle-tested):
1. accrueTx terima `known` basi pre-update → selalu no-op. [sales-payment.hook.ts:63-96](src/lib/hooks/sales-payment.hook.ts), [commission-payable.service.ts:95,98](src/lib/services/commission-payable.service.ts). Konfirmasi 2 agen independen.
2. accrue/reverse/paid tanpa FOR UPDATE → tulis ganda konkuren. [commission-payable.service.ts:86,155,233](src/lib/services/commission-payable.service.ts).
3. `paidByIdTx` baca-tulis `paidAmount` tanpa lock → overpay last-write-wins. [:238-253](src/lib/services/commission-payable.service.ts).
4. Jurnal retur pakai `new Date()` → tembus period lock. [stock-journal.service.ts:508,554](src/lib/services/stock-journal.service.ts).
5. paidTx lewati guard bila balance<0 → bayar tak terbatas. [:245](src/lib/services/commission-payable.service.ts).
6. `addPayrollCommissionLine` cek-dup di luar tx → dobel-bayar race. [hrm.actions.ts:762](src/actions/hrm.actions.ts).

Skema:
7. Drift `onDelete` relasi komisi (schema vs migrasi). [schema.prisma:1892-1893,608](prisma/schema.prisma).

Laporan/UI:
8. Stok-tidak-bergerak tulis path tapi baca query → filter reset diam-diam. [stok-tidak-bergerak](src/app/(dashboard)/laporan/stok-tidak-bergerak/[[...segments]]/page.tsx):26-38.
9. Total estimate-vs-aktual 7 sel vs 9 header → angka geser 2 kolom. [job-estimate-vs-actual.ts:32-41 vs 210-223](src/lib/reports/job-estimate-vs-actual.ts).
10. Upload lampiran sengketa 400: whitelist tanpa tax_assessment/tax_dispute_step. [attachment-route-contract.ts:6-14](src/lib/auth/attachment-route-contract.ts).
11. Jurnal gaji tanpa kunci periode: markPayrollPaid + onPayrollPaid tanpa assertPeriodOpen. [hrm.actions.ts:3239](src/actions/hrm.actions.ts), [accounting.hook.ts:2985](src/lib/hooks/accounting.hook.ts).

## S2 — penting (ringkas)

- deleteJournalByReferenceTx assertPeriodOpen tanpa tx (TOCTOU).
- onSalesInvoicePosted/Created cek period di luar tx, tanpa re-check dalam tx.
- accrueTx pakai updatedAt/now bukan tanggal faktur.
- accrue catch console.error → faktur paid tanpa subledger (sudah berizin guard).
- Baca DB sebelum auth (oracle ID) di hrm.actions.
- PII gaji (Rp...) ke console.error log.
- useSlipActionRunner tanpa try/catch → isPending macet.
- status-actions buang body error workflow.
- `.catch((e)=>...)` / `(()=>false/[])` lolos guard silent-failure (crm/tickets, karyawan, backup).
- E2E: waitForTimeout 1500/3000 (finance-journal, sales-crud, module-coverage), waitForURL.catch(()=>{}), test.skip bisu.
- Guard lint lokal-vs-CI masih drift (`eslint src/` vs `eslint .`).
- DB suite skip lokal; secret default tercommit; 17 stash + worktree yatim.
- Touch <44px: combobox 36, date-picker 40, tombol sm 32, panel komisi Tambah 36.
- Tabel laporan tanpa aria-label; hint tanpa aria-describedby.

## S3 — minor

4 catch-all mati, kontras amber, A4 9 kolom overflow, seed-only GPS/lampiran, catch queue:null tanpa log, `.next` 838M.

## Urutan saran

1. S1 komisi (1-6): known fresh + FOR UPDATE + tanggal faktur + guard balance + dup dalam tx.
2. S1 jurnal gaji period lock (11) + retur new Date (4).
3. S1 laporan/UI (8-10): baca segments, total 9 sel, whitelist upload.
4. S1 skema drift (7).
5. S2 batch: TOCTOU, oracle, PII log, try/catch runner, guard catch.
6. S3 + E2E sleep sisa.
