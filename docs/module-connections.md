# Peta Koneksi Antar-Modul — Silengkap / YaraERP

Dokumen ini adalah peta "siapa terhubung ke siapa" di codebase: modul bisnis,
rantai dokumen (document chain), hook/service yang menjadi jembatan, dan
invariant yang mengunci konsistensi. Sumber: `prisma/schema.prisma`,
`src/actions/*.actions.ts`, `src/lib/hooks/*.hook.ts`, `src/lib/services/*.service.ts`,
dan `docs/audit-rantai-dokumen.md`.

> Konvensi: **Hook** = pengganti Laravel observer, dipanggil eksplisit dari
> server action di dalam transaksi. **Service** = engine backend (FIFO, jurnal,
> period lock, document sequence). Semua hook menerima `txClient` opsional agar
> ikut transaksi pemanggil.

---

## 1. Lapisan arsitektur

```
UI page (Server/Client Component)
  └─ Server Action (src/actions/*.actions.ts)   ← requirePermission + assertPeriodOpen
        ├─ Zod schema (src/lib/validations/*.schemas.ts)
        ├─ Hook (src/lib/hooks/*.hook.ts)        ← jurnal, stok, sub-ledger
        └─ Service (src/lib/services/*.service.ts) ← FIFO, period lock, doc seq, approval
              └─ Prisma (MariaDB)
```

Penjaga ratchet yang relevan: `link-wiring`, `action-wiring`, `chain-ui-wiring`,
`stock-out-single-path`, `schema-usage`, `form-field-wiring`, `permission-seed-parity`.

---

## 2. Modul bisnis (dashboard slugs)

| Slug | Modul | Aksi file |
|---|---|---|
| `master` | Master data (barang, pelanggan, vendor, akun, gudang, satuan, pajak, bank, departemen, jabatan, karyawan) | `master.actions.ts` |
| `penjualan` | Quotation → SalesOrder → DeliveryOrder → SalesInvoice → SalesPayment / SalesReturn / DownPayment | `sales.actions.ts` |
| `pembelian` | PurchaseRequest → PurchaseOrder → GoodsReceipt → VendorBill → VendorPayment / PurchaseReturn / PurchaseAdvance | `purchase.actions.ts` |
| `inventaris` | StockAdjustment, InventoryTransfer, MaterialIssue, opname, mutasi stok, scan | `inventory.actions.ts` |
| `produksi` | Product, BOM revision, WorkOrder, ProductionOrder, ProductionCost, QC, genealogi | `manufacturing.actions.ts`, `qc.actions.ts`, `production-cost.actions.ts` |
| `sdm` | Attendance, Leave, Overtime, Payroll, Loan, Timesheet, Holiday/WorkSchedule, kalender kerja | `hrm.actions.ts` |
| `keuangan` | Journal, Expense, PettyCash, BankTransfer, Cheque, Reconciliation, Recurring, TaxPayment, Cost/Profit Center | `finance.actions.ts`, `bank-transfer.actions.ts`, `cheque.actions.ts`, `expense-category.actions.ts`, `tax-payment.actions.ts`, `recurring.actions.ts`, `period-close.actions.ts` |
| `aset` | Asset, AssetGroup/Brand/Model, transfer, disposisi | `asset.actions.ts` |
| `crm` | Lead, CrmTicket (+comment) | `crm.actions.ts` |
| `proyek` | Project, ProjectItem/Stage/Log/Task | `project.actions.ts` |
| `kendaraan` | Vehicle brand/model/variant, CustomerVehicle, fitment | `vehicle.actions.ts`, `vehicle-fitment.actions.ts` |
| `pengaturan` | SystemSetting, Role, Module/Permission, UserWarehouse, database, approval workflow | `settings.actions.ts`, `roles.actions.ts`, `approval.actions.ts`, `auth.actions.ts` |

Modul lintas: `approval`, `activity-log`, `bulk`, `favorite`, `invoice-exchange`,
`method`, `vendor-price`, `vendor-transfer`, `withholding-tax`.

---

## 3. Hub pusat (semua modul bermuara di sini)

### 3.1 Jurnal / GL — `accounting.hook.ts`
Satu-satunya pintu posting GL. Setiap dokumen yang memengaruhi keuangan memanggil
fungsi ini di dalam transaksinya:

| Fungsi hook | Pemicu (action) | Jurnal yang lahir |
|---|---|---|
| `onSalesInvoicePosted` | posting faktur penjualan | `SalesInvoice` (Dr Piutang, Cr Pendapatan) + `SalesInvoiceCOGS` (Dr HPP, Cr Persediaan) + konsumsi FIFO + stok OUT |
| `onSalesPaymentCreated` | pembayaran piutang | Dr Kas/Bank, Cr Piutang |
| `onSalesReturnCompleted` | retur penjualan | pembalikan pendapatan & HPP, stok IN |
| `onDownPaymentReceived` | uang muka penjualan | Dr Kas, Cr Uang Muka Pelanggan |
| `onPurchaseOrderReceived` | penerimaan barang (GR) | Dr Persediaan, Cr Hutang (accrual) |
| `onVendorBillPosted` | posting tagihan vendor | Dr Beban/Persediaan, Cr Hutang Usaha |
| `onVendorPaymentCreated` | pembayaran hutang | Dr Hutang, Cr Kas/Bank |
| `onPurchaseReturnProcessed` | retur pembelian | pembalikan hutang & persediaan |
| `onExpenseApproved` | approval expense | Dr Beban, Cr Kas/Bank (akun sumber wajib) |
| `onPettyCashCreated` | kas kecil | Dr Kas Kecil, Cr Kas/Bank |
| `onPayrollPaid` | penggajian paid | Dr Beban Gaji + potongan, Cr Kas/Bank + hutang |
| `onEmployeeLoanDisbursed` | pencairan pinjaman | Dr Piutang Karyawan, Cr Kas/Bank |
| `onDownPaymentConfirmed` (down-payment.hook) | konfirmasi DP pembelian | jurnal DP vendor |

**Invariant kritis**: `onSalesInvoicePosted` **gagal keras** (throw) bila
`salesReceivableAccountId` / `salesRevenueAccountId` belum dipetakan — bukan
`return` senyap. Status faktur tetap `draft` jika posting gagal.

### 3.2 Stok — efek terjadi di SATU tempat
- **Stok keluar penjualan**: HANYA di `onSalesInvoicePosted` (saat faktur diposting):
  mengurangi `qty_on_hand`, mengonsumsi lapisan FIFO, menulis HPP/COGS.
- **Surat jalan TIDAK menyentuh stok** (tidak ada hook DO, tidak menyentuh
  `qty_on_hand`/`stock_moves`/`item_transactions`). Dikunci oleh
  `stock-out-single-path.test.ts` — menambah efek stok di DO memerahkan tes.
- **Pembatalan faktur** mengembalikan stok via `sales-invoice-posting.service.ts`
  (dokumen `SM-REV-INV-*`).
- **Ketersediaan** dihitung dari `inventory_layers` (FIFO), BUKAN dari
  `qty_on_hand`. Stok yang diisi langsung (seed/import) tanpa penerimaan barang
  → penjualan ditolak "stok tidak mencukupi".

Hook stok lain: `goods-receipt.hook` (IN + lapisan FIFO saat GR verified),
`inventory-transfer.hook`, `material-issue.hook`, `stock-adjustment.hook`,
`purchase-return.hook`, `sales-return.hook`.

### 3.3 Period lock — `period-lock.service.ts`
Semua dokumen bertanggal wajib `assertPeriodOpen()`. Periode tertutup → aksi
gagal terlihat, jadwal tetap jatuh tempo (bisa diulang). Dipakai oleh
finance, purchase, asset, manufacturing, recurring, tax-payment, bank-transfer.

### 3.4 Document sequence — `document-sequence.service.ts`
Penomoran dokumen (INV, PO, GR, dll.) per modul/per periode. Dipakai purchase,
bank-transfer, tax-payment, down-payment, dll.

### 3.5 Approval workflow — `approval-workflow.service.ts`
Dipakai finance, hrm, project, asset, purchase. Status transisi dokumen (draft →
approved → posted) lewat `approval.actions.ts` yang juga memicu hook GL
(`onEmployeeLoanDisbursed`, `onExpenseApprovedSyncPettyCash`).

### 3.6 Activity log — `activity-log.service.ts`
Dipakai SEMUA action (audit trail). Ditulis via raw SQL `INSERT INTO activity_logs`.

---

## 4. Rantai dokumen (document chain)

### 4.1 Penjualan (commit `bcd7eca4`, `89bfd30b`, `27c28fa7`)
```
Quotation ──► SalesOrder ──► DeliveryOrder ──► SalesInvoice ──► SalesPayment
   │              │                │                │
   │              │                │                ├─► SalesReturn (tab di faktur)
   │              │                │                └─► SalesInvoiceCOGS (HPP)
   │              │                └─► (tidak sentuh stok)
   │              └─► DownPayment (uang muka, ?salesOrderId=)
   └─► (1 quotation → 1 sales order, dikunci FOR UPDATE)
```
- `createSalesOrder` menolak bila quotation sudah punya order (kunci penawaran).
- DO: `DeliveryOrderItem.salesOrderItemId` terisi dari SISA (qty pesan − sudah kirim),
  status maju via `shipDeliveryOrder`/`deliverDeliveryOrder` (klaim atomik).
- Faktur: membaca `?quotationId=` dan `?salesOrderId=`; posting memicu stok OUT + HPP.
- Faktur menampilkan tab "Retur" + tombol "+ Buat Retur" (`?invoiceId=`).

### 4.2 Pembelian (commit `09b116ee`)
```
PurchaseRequest ──► PurchaseOrder ──► GoodsReceipt ──► VendorBill ──► VendorPayment
                        │                │                │
                        │                │                ├─► PurchaseReturn (tab di PO)
                        │                │                └─► (GR campuran barang+jasa: 2 jurnal, penanda berbeda)
                        │                └─► VendorBill (tagihan dari GR, ?grId=)
                        └─► (receivedQty ditulis absolut dari peta kumulatif)
```
- GR campuran (barang+jasa): dua jurnal, `referenceType` dipisah (`GoodsReceiptService`)
  agar tidak melanggar unique index `journals(referenceType, referenceId)`.
- `VendorBill.goodsReceiptId` / `VendorBillItem.goodsReceiptItemId` terisi jalur
  "buat tagihan dari penerimaan" (validasi GR: vendor sama, belum ditagih penuh).
- `VendorBill.discountAmount` (level dokumen) = Σ diskon baris, diisi saat create & update,
  via `src/lib/finance/vendor-bill.ts` (satu sumber matematika, guard `vendor-bill-discount-wiring`).
- Backlink PO → Retur dirender (tab Retur + tombol "Buat Retur", `?poId=`).

### 4.3 Produksi & stok
```
WorkOrder ──► ProductionOrder (+ProductionOrderMaterial)
   │                │
   │                ├─► MaterialIssue (pengeluaran material, taut ke WO/Project/CostCenter)
   │                ├─► QcInspection / Nonconformance
   │                ├─► ProductionGenealogy (asal bahan)
   │                └─► ProductionCost (HPP produksi)
   └─► BomRevision (snapshot revisi BOM)
```
- `ProductionOrder.workOrderId` terisi (combobox WO, validasi baris nyata).
- `WorkOrder.bomRevisionId` diisi dari revisi BOM yang di-snapshot.
- `startProductionOrder` membuka gerbang status untuk order tanpa material BOM.
- Stok keluar material lewat `material-issue.hook.ts` (`onMaterialIssueCompleted`).

### 4.4 Keuangan internal
```
Expense ──► (approval) ──► onExpenseApproved ──► Jurnal (Dr Beban, Cr Kas)
PettyCash ──► onPettyCashCreated ──► Jurnal
RecurringTransaction ──► (cron) ──► Jurnal DRAFT (referenceType=RecurringTransaction_YYYYMMDD)
Payroll (paid) ──► onPayrollPaid ──► Jurnal
EmployeeLoan (disbursed) ──► onEmployeeLoanDisbursed ──► Jurnal
Asset depreciation ──► Jurnal (ASSET_DEPRECIATION_*)
```
- Expense `paid` TIDAK bisa tanpa `paidFromAccountId` (ditolak lebih dulu).
- Recurring memakai `assertPeriodOpen`; periode tertutup → gagal terlihat, jadwal
  tetap jatuh tempo.

### 4.5 Aset
```
AssetCategory ──► AssetGroup ──► Asset (brand/model) ──► AssetTransfer / AssetHistory
```
- `Asset.assetBrandId` & `Asset.groupId` ditulis form (bug skema yang dulu membuang
  `assetBrandId` sudah diperbaiki; guard `form-field-wiring`).
- Hapus AssetGroup ditolak bila masih dipakai aset (hindari SetNull diam-diam).
- `ProfitCenter` terhubung ke jurnal: form jurnal punya pilihan "Pusat Laba" yang
  ditulis ke setiap entri (buat & ubah + jalur pembalikan).

### 4.6 Kelas "seed-only" — sudah tuntas
Dulu 11 model **dibaca produk tetapi hanya bisa diisi seed**; kini semuanya punya jalur
tulis dan `SEED_ONLY_MODELS` di `src/__tests__/schema-usage.test.ts` **kosong** (berarah
dua: model baru yang hanya bisa diisi seed langsung memerahkan tes). Ditutup bertahap:
`UserWarehouse` (panel "Akses Gudang"), `CrmTicketComment` (`addTicketComment`),
`ProjectLog` (`addProjectLog`), `AssetBrandModel` ("Tipe / Model" di form merek),
`Holiday`/`DepartmentHoliday`/`WorkSchedule` (`/sdm/kalender-kerja`), `AssetGroup`
(`/aset/grup`), `ProfitCenter` (`/keuangan/pusat-laba`, terhubung ke jurnal), `Attendance`
(`/sdm/absensi`, commit `2cb1d7da`), dan `BankStatementLine`
(`/keuangan/laporan-bank/[slug]`, commit `6e60965e`). Yang tersisa di tingkat KOLOM
(GPS absensi, `CrmTicket.firstResponseAt`/`resolvedAt`, dan 4 kolom tanpa rujukan) ada di §8.

### 4.7 Proyek / CRM / Kendaraan
- `Project` ↔ `ProjectItem` (barang), `ProjectStage`/`Progress`, `ProjectLog`.
- `CrmTicket` ↔ `CrmTicketComment` (internal note via `isInternal`).
- `MaterialIssue` bisa menaut ke `workOrderId`/`projectId`/`costCenterId`.
- `CustomerVehicle` ↔ `VehicleVariant` (model tersirat dari varian).

---

## 5. Matriks koneksi modul → modul

| Dari | Ke | Mekanisme |
|---|---|---|
| Penjualan | Keuangan/GL | `onSalesInvoicePosted`, `onSalesPaymentCreated`, `onSalesReturnCompleted`, `onDownPaymentReceived` |
| Penjualan | Inventaris | konsumsi FIFO + stok OUT saat faktur posted; retur = stok IN |
| Penjualan | Produksi | (tidak langsung; via BOM/material issue terpisah) |
| Pembelian | Keuangan/GL | `onPurchaseOrderReceived`, `onVendorBillPosted`, `onVendorPaymentCreated`, `onPurchaseReturnProcessed` |
| Pembelian | Inventaris | GR verified → stok IN + lapisan FIFO; retur = stok OUT |
| Pembelian | Produksi | `syncServicePurchaseOrderCost` (PO jasa → biaya produksi) |
| Inventaris | Produksi | `MaterialIssue` → `onMaterialIssueCompleted` (stok OUT material) |
| Inventaris | Keuangan/GL | `onStockAdjustmentProcessed` (penyesuaian stok → jurnal) |
| Produksi | Keuangan/GL | `ProductionCost` → HPP; QC rework cost sync |
| Produksi | QC | `QcInspection`, `Nonconformance` |
| SDM | Keuangan/GL | `onPayrollPaid`, `onEmployeeLoanDisbursed`, `onExpenseApproved` (approval) |
| Aset | Keuangan/GL | depresiasi aset → jurnal; `ProfitCenter` per entri |
| CRM | (isolated) | tiket & komentar, approval via `approval-workflow` |
| Proyek | Inventaris | material issue taut ke project; laporan laba rugi proyek |
| Kendaraan | Master (pelanggan) | `CustomerVehicle` milik customer |
| Semua modul | ActivityLog | audit trail |
| Semua modul bertanggal | PeriodLock | `assertPeriodOpen` |
| Semua dokumen bernomor | DocumentSequence | penomoran |

---

## 6. Invariant / gerbang yang harus dipahami sebelum "melengkapi rantai"

1. **Stok keluar penjualan hanya di faktur posted** (bukan surat jalan). Dikunci
   `stock-out-single-path.test.ts`. Jangan tambahkan efek stok di DO.
2. **Ketersediaan dari lapisan FIFO**, bukan `qty_on_hand`.
3. **Faktur posted gagal keras** bila mapping akun (piutang/pendapatan) kosong.
4. **Expense paid** butuh `paidFromAccountId`.
5. **VendorBill.discountAmount** = Σ diskon baris (guard dua arah).
6. **Quotation → SalesOrder 1:1** (dikunci FOR UPDATE di `createSalesOrder`).
7. **GR campuran** butuh penanda jurnal terpisah (unique index).
8. **receivedQty** ditulis absolut dari peta kumulatif (bukan delta).
9. **Permission baru** butuh 4 suntingan (PERMISSIONS, RESOURCE_MODULE,
   RESOURCE_LABEL, permission-labels) + 2 penjaga (page-action-parity, ROUTE_PERMS).
10. **Model/kolom baru** yang hanya terisi seed terdeteksi `SEED_ONLY_MODELS` /
    `SEED_ONLY_COLUMNS` (berarah dua).

---

## 7. Cara menelusuri sebuah perubahan

- Cari action: `src/actions/<modul>.actions.ts`.
- Cari hook yang dipanggil: grep `from "@/lib/hooks/`.
- Cari service: grep `from "@/lib/services/`.
- Cek skema: `prisma/schema.prisma` model terkait.
- Cek guard ratchet: `src/__tests__/*-wiring.test.ts`, `schema-usage`, `silent-failure`.
- Cek rantai UI: `link-wiring.test.ts`, `chain-ui-wiring.test.ts`.

---

## 8. Catatan "belum ditutup" (keputusan produk)

Tingkat MODEL sudah bersih — lihat §4.6. Yang tersisa di tingkat kolom & migrasi:

- Kolom **seed-only** (`SEED_ONLY_COLUMNS`, 6): GPS absensi
  (`Attendance.checkIn/outLatitude`, `checkIn/outLongitude`) +
  `CrmTicket.firstResponseAt`/`resolvedAt` — tangkap lokasi di form absensi, tandai waktu
  respons/penyelesaian tiket, atau buang lewat migrasi.
- Kolom **tanpa rujukan** (`KNOWN_UNUSED`): **kosong** — gelombang 2 tuntas
  (2026-10-19, branch kerja): `Asset.assetBrandModelId` tersambung ke form aset,
  dan `ApprovalWorkflowStep.canSkip`, `BankReconciliationItem.clearedDate`,
  `BankStatementLine.matchedType` dibuang lewat migrasi
  `20261019001000_drop_wave2_dead_columns`.
- `PettyCash.sourceAccountId/expenseAccountId` kolom mati (akun per transaksi tidak bisa
  dipilih dari UI; hook memakai `sourceAccountId ?? cashBankAccountId` setelan).
- `OvertimeRequest.supervisorApprovedAt` kolom mati (halaman detail membacanya, belum ada
  penulis). `rejectionReason` **bukan** mati — ditulis langkah penolakan approval generik
  (`src/actions/approval.actions.ts`, `REJECTION_REASON_MODELS`).
- `UnitOfMeasure.baseUnitId` tidak pernah ditulis (hierarki satuan belum ada; penjaga hapus
  di `deleteUom` karena itu tidak pernah menyala).
- `MaterialIssue ↔ ProductionOrder` FK belum ada (migrasi).
- `Cheque → payment` FK + akun kliring belum ada (migrasi).
- Stok keluar di surat jalan vs faktur: keputusan bisnis belum diputuskan
  (lihat §5 audit-rantai-dokumen).
