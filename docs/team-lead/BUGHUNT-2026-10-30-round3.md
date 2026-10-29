# Bug Hunt Round 3 — 2026-10-30 (6 agen read-only + MCP runtime + browser)

Basis: HEAD `a7dcce045` (sesudah 8 commit round 2). Tree bersih, 0 edit dibuat.
Metode: 6 agen audit domain (HR, sales/purchase/inventory, akuntansi/pajak,
produksi, laporan/PDF/perf, UI/guard/CI) + verifikasi runtime nyata
(`get_compilation_issues` 428 route, agent-browser login + sapu halaman).
9 temuan teratas di-spot-check mandiri dari kode sumber.

## Runtime — bersih

- Kompilasi 428 route: 0 issue.
- Landing + list/detail 9 modul (dasbor, penjualan, pembelian, inventaris,
  produksi, sdm, keuangan, laporan, master, roster, jurnal): 0 console error.
- 404 sesaat di link dasbor (`/penjualan/faktur/009-inv-iro-10-2026`,
  `/sdm/absensi?status=telat`): manifest route basi container dev (gejala
  terdokumentasi AGENTS.md). `docker compose restart app` → semua 200.
  **Bukan bug kode.**
- Guard statis eksisting: 49/49 pass (schema-usage, silent-failure,
  wired-transition-actions, action-wiring, navigation-targets).

## CRITICAL

1. Total PDF statement pelanggan geser kolom + saldo akhir hilang.
   `customer-statement-data.ts:322-327` kirim 7 sel termasuk blank leading;
   renderer `pdf/engine/render.ts:442-448` kontrak trailing-only
   (`leadingCount = max(columns - cells, 1)` → 1) → Total Debit tercetak di
   kolom Kredit, Total Kredit di Saldo, Saldo Akhir terpotong. Web benar.
   Pola sama (klaim agen, belum semua spot-check) di 9 builder:
   `bank-movements.ts:173-184`, `journal-listing.ts:116-122`,
   `job-order-cost.ts:143-154,170-182`, `job-order-completion.ts:119,136`,
   `received-not-billed.ts:195,213-218`, `tax-summary-data.ts:115,191`,
   `delivered-unbilled-export.ts:47-61`, `discount-exposure-export.ts:81-98`,
   `outstanding-lines.ts:168-183`.

## HIGH

### Akuntansi/Pajak

2. Revoke bupot me-reverse jurnal dokumen sumber, bukan hanya efek potongan.
   `withholding-certificate.service.ts:262-268`: tagihan vendor POSTED tertaut
   bupot → revoke koreksi nomor ikut reverse jurnal tagihan; beban/HPP +
   hutang hilang dari GL, tagihan tetap posted/terutang. Sama untuk
   `SalesPayment`.
3. Tagihan jasa/biaya ber-PPN kredit tidak memecah PPN Masukan.
   `accounting.hook.ts:2824-2831`: cabang jasa debit `latestGrandTotal` penuh
   ke `purchaseExpenseAccountId`; cabang barang memecah (2800-2813).
   Beban overstate, aset PPN Masukan hilang.
4. Retur besi tua over-kredit Piutang. `accounting.hook.ts:1967-1968,2024-2032`:
   `useReceivable = outstanding > 0` lalu kredit penuh `creditTotal`;
   faktur 100 dibayar 95, retur 20 → piutang −15, kelebihan tak ke
   CustomerCredit (jalur non-scrap memisah).
5. COGS senyap tanpa akun terpetakan. `accounting.hook.ts:893-897`:
   jurnal COGS hanya bila `cogsAccountId && inventoryAccountId`; stok keluar
   fisik + pendapatan tercatat, HPP nol senyap. Jalur pendapatan melempar
   keras bila akun kosong (314-320).

### Pembelian/Penjualan

6. `voidVendorBill` hard-delete jurnal POSTED + race tanpa kunci.
   `purchase.actions.ts:3769` `deleteJournalByReferenceTx` (standar repo
   melarang, lihat `purchase-advance.actions.ts:138-139`); guard
   `paidAmount=0` hanya di luar tx (3755-3766) → race vs
   `confirmVendorPayment` hasilkan tagihan cancelled ber-paidAmount>0, AP drift.
7. Race edit-vs-confirm tanpa kunci/klaim status (pola berulang):
   `updateVendorPayment` `purchase.actions.ts:3569-3597`;
   `updateVendorBill` baca-ulang tanpa `FOR UPDATE` + tulis `status:"draft"`
   `purchase.actions.ts:3155-3160,3243`;
   `updateDownPayment` kunci quotation bukan baris DP
   `sales.actions.ts:3840-3875`;
   `updateGoodsReceipt` ganti baris tanpa syarat status
   `purchase.actions.ts:3347-3352,3410-3420`.

### SDM/Approval

8. Workflow route reopen dokumen HR sebelum cek scope.
   `api/workflow/[...path]/route.ts:145-160`: cabang workflow-aktif reset
   `rejected→draft` + `requestApprovalIfConfigured` commit dulu, cek scope
   hanya di cabang manual (282-290) → pemegang izin approve luar scope
   membangkitkan dokumen HR; respons 409 datang sesudah mutasi.
9. Apresiasi tanpa HR scope. `hrm.actions.ts:5478-5560`:
   `create/update/deleteAppreciation` hanya `requirePermission`; update
   menulis `employeeId` kiriman tanpa muat baris existing. Bonus karyawan
   luar scope bisa dibuat/dipindah/dihapus; payroll membayar (1453-1490).
10. Race pembayaran/pelunasan pinjaman. `hrm.actions.ts:5291,5301,5327`
    (write-off 5369-5398): loan dimuat di luar tx, `remainingAmount` basi,
    update `where:{id}` polos, tanpa kunci baris/unique → dua pembayaran
    konkuren sama-sama lolos, total melebihi sisa.

### Produksi

11. Fitur ganti revisi BOM PO mati total. `bom-revision-change.actions.ts:75`
    query `issuedQty` — model `ProductionOrderMaterial` (schema 3146-3187)
    field-nya `actualQty`. Prisma validation error tiap
    `requestBomRevisionChange({productionOrderId})`; mock test menerima
    argumen apa pun sehingga lolos.
12. NCR rework bocor ke PO `completed`. `qc.actions.ts:441`: guard hanya
    tolak `closed` (job-closeout.service.ts:48); PO selesai di-resolve →
    `totalActualCost` naik dari 0, Dr WIP terposting tanpa release pengkredit,
    `closeProductionOrder` tertahan sisa WIP≠0 selamanya.

### Guard/CI

13. `reverseJournal` yatim UI lolos guard. `finance.actions.ts:2199`:
    `action-wiring` menghitung token nama di method lain
    (`journal.service.ts:149`); UI jurnal hanya impor delete/post —
    jurnal POSTED salah posting tak bisa dikoreksi dari UI (deleteJournal
    menolak POSTED 1910-1912).
14. 7 suite integrasi DB tak pernah jalan CI. `ci.yml:118,248-323`:
    petty-cash-source-concurrency, stocktake-posting-concurrency,
    credit-gate-pending-persistence, warranty-unique, asset-journal-integration,
    sales-payment-withholding-integration, db-concurrency — job unit tanpa
    `INTEGRATION_DB_URL`, job db-integration hanya sebut 4 berkas eksplisit.

## MEDIUM

- Cek periode terkunci hanya di luar tx (race tutup periode):
  `tax-payment.actions.ts:60`, `bank-transfer.actions.ts:63`,
  `purchase-advance.actions.ts:58` — jalur void masing-masing sudah benar.
- Klaim terminal approval generik hanya Payroll: `approval.actions.ts:290`
  `terminalGuarded = {"Payroll"}`; Leave/Overtime/Loan update status polos
  (302-310, 447-452) — pinjaman `active` bisa ter-reject sesudah cair,
  jurnal pencairan tetap, potongan payroll berhenti.
- Approval generik lembur tak hitung `calculatedValue`: `approval.actions.ts:311`;
  hitungan hanya efek samping route workflow (217-221); payroll jumlahkan
  `calculatedValue ?? 0` → lembur disetujui dari halaman persetujuan dibayar 0.
- `updateEmployee` tulis `baseSalary` tanpa gerbang `view_salary_amounts`:
  `master.actions.ts:1026,1327,1502-1505`.
- `upsertPerformanceGoal` update tanpa cek pemilik existing:
  `performance.actions.ts:94-117` (delete memeriksa, update tidak).
- `updateBomRevision` cek status di luar tx, update tanpa klaim:
  `manufacturing.actions.ts:387-410` — revisi released bisa tertimpa.
- Apply change-order `hapus`/`ubah` tanpa rekonsiliasi reservasi:
  `job-change-order.actions.ts:772` — reservasi hantu ≤14 hari.
- Guard complete WO (MI + QC) dibaca di luar tx penyelesaian:
  `manufacturing.actions.ts:1650-1663`.
- Dedupe timesheet proyek di luar tx, tanpa unique DB:
  `production-cost.actions.ts:306-318` + schema 3387 — HPP labor dobel.
- N+1 `availableQty` serial per gudang×item dalam tx start WO:
  `stock-reservation.service.ts:105-110`.
- Aging loader tanpa batas tanggal/`take`/agregasi + registry tak kirim
  periode: `aging-reports-data.ts:96-100,130-134,170-174`,
  `report-registry.ts:841-871`.
- PDF `tanggalMulai=abc` → Invalid Date → 500: `report-registry.ts:250-253`.
- `formatAccounting` buat `Intl.NumberFormat` per panggilan:
  `format.ts:79-82` (cache `idNumberFmt` ada, tak dipakai).
- `wired-transition` detektor lemah: `wired-transition-actions.test.ts:143-157`
  invoker beku 5 berkas, regex prop sempit; ±109 aksi transisi vs 15
  REQUIRED_CALLERS; pola sah lolos deteksi (spread, `.bind`, dynamic import,
  helper, prop renama).
- FK yatim lolos `schema-usage` (parser skip FK + enum): `CrmTicket.warrantyClaimId`
  schema:4967, `InventoryTransferReceiptItem.receiptId` :2910,
  `ProductionGenealogyMaterial.genealogyId` :3223 — 0 rujukan kode produk;
  field enum (Account.type, SalesInvoice.status, StockMove.*) di luar cakupan.
- `ci.yml` tanpa `permissions:` top-level/per-job (0 hit; antrean-merge.yml:49
  membatasi eksplisit).
- E2E tautologi sisa: `finance-flow.spec.ts:7,19,25`,
  `inventory-flow.spec.ts:7,19,25,31` assert kata yang sama dengan label
  sidebar; `inventory-scan-barcode.spec.ts:40` `test.skip(true)` permanen.

## LOW

- `decideProbation` terima review `decided`, tanpa klaim atomik:
  `probation.actions.ts:283,302-308`.
- Subtree pusat biaya 1 query serial per node: `statement-data.ts:268-287`.
- Resolver slug muat seluruh master aktif lalu cari di memori:
  `stock-flow-data.ts:48-64`, `ledger-cash-data.ts:175-185,219-227`.
- Loader detail PO ±8 query serial + await inline JSX:
  `production-orders/[slug]/page.tsx:83-195,387`.

## Urutan saran

1. CRITICAL #1 + audit 9 builder pola sama (kontrak trailing-only ditegakkan
   di builder atau renderer menolak blank leading).
2. Akuntansi HIGH #2-5.
3. Pembelian #6-7 (kunci baris + klaim status dalam tx, pola existing file sama).
4. SDM #8-10 (scope sebelum mutasi, klaim terminal semua model HR,
   kunci baris pinjaman).
5. Produksi #11-12.
6. Guard/CI #13-14 + cakupan FK/enum schema-usage, permissions ci.yml.

## Round 4 — audit domain baru (CRM/proyek/aset/kendaraan/master/pengaturan)

Pengaturan + master bersih (selain updateEmployee round3). Temuan:

1. HIGH asset.actions.ts:540-551 updateAssetBrand delete+recreate semua
   AssetBrandModel tiap edit → assetBrandModelId yatim (Int? tanpa FK).
2. HIGH warranty.service.ts:361-376 decide/transition tanpa klaim atomik
   (read-check-update polos) — keputusan konkuren last-wins dua sukses.
3. MED project.actions.ts:1382 reject revisi anggaran tanpa kunci FOR UPDATE.
4. MED project.actions.ts:266-359 guard tahap sebelumnya di luar tx.
5. MED crm.actions.ts:340 addLeadActivity tanpa cek lead hidup/kepemilikan.
6. MED vehicle.actions.ts:688 updateCustomerVehicle mutasi katalog bersama.
7. MED crm/leads/page.tsx:59 3 loader full-table serial tak terbatas.
8. LOW crm.actions.ts:103 updateTicket reopen tak clear resolvedAt.
