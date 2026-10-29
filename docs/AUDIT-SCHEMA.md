# Audit: janji skema & alur vs yang benar-benar dipakai kode

**Status (akhir sesi):** sebagian temuan sudah **ditutup** (lihat §0). Sisanya menunggu
keputusan pemilik produk, didaftarkan di bagian **Keputusan yang menunggu**.

> **Pembaruan 2026-10-19 (branch kerja).** Gelombang 2 §3 kini **tuntas**: keenam kolom
> sudah ditutup — `BankStatement.totalDebits`/`totalCredits` dihitung ulang dari
> barisnya, `Asset.assetBrandModelId` tersambung ke form aset, dan
> `ApprovalWorkflowStep.canSkip` / `BankReconciliationItem.clearedDate` /
> `BankStatementLine.matchedType` dibuang lewat migrasi
> `20261019001000_drop_wave2_dead_columns`. `KNOWN_UNUSED` kosong.
> Rincian per item ada di bagian masing-masing dan di **Keputusan yang menunggu**.

**Cara memeriksa:** setiap nama field/kolom dicari sebagai kata utuh di `src/`, `scripts/`,
`e2e/`, dan `prisma/` (termasuk seed). Positif-palsu yang diketahui — FK skalar yang dipakai
Prisma lewat `connect` tidak pernah disebut namanya — **diperiksa satu per satu**, bukan
diabaikan. Untuk aksi server, "dipanggil" berarti namanya muncul di luar berkas definisinya
(`StatusActions` hanya menangani approve/reject dan tak ada registri transisi, sehingga "nol
rujukan" sungguh berarti tak terjangkau).

---

## 0. Sudah ditutup (bukan lagi temuan)

| Temuan | Penyelesaian | Bukti |
| --- | --- | --- |
| `SalesInvoice.amountPaid` — duplikat `paidAmount`, selalu 0 | dibuang (migrasi `…drop_sales_invoice_amount_paid`) | drift 0, suite hijau |
| **4 kolom penaut rekonsiliasi duplikat** | dibuang (migrasi `20261016210000_drop_duplicate_reconciliation_links`) | 0 baris di DB; jejak audit yang sah ada di `BankReconciliationItem.journalEntryId` |
| **`updatedBy` (12 model, 0 penulisan)** | kini ditulis di 16 titik / 2 berkas + 15 penangkapan `user` | diuji lewat UI: `updated_by = 1`; allowlist guard dipangkas 12 entri |
| `postJournal` tak tersambung → jurnal manual tak pernah masuk pembukuan | disambungkan + dikunci di guard | E2E: DB `DRAFT 1/POSTED 5` → `POSTED 6` |
| `confirmVendorPayment` tak tersambung | disambungkan + dikunci di guard | E2E: pembayaran `completed`, tagihan `paid`, **1 alokasi** |
| **Tiga gerbang status buntu** | halaman kini menjelaskan syaratnya (bukan buntu senyap) + tes invarian | §5d |
| **7 `.catch()` menyesatkan** (fetch gagal tampak seperti "tidak ada data") | menampilkan pesan; guard diperluas ke promise-senyap | typecheck, suite unit, E2E penuh hijau |
| Rantai migrasi gagal dari DB kosong | 8 tabel yang tak pernah dibuat ditambahkan + rekonsiliasi | `migrate deploy` dari nol ✓, drift 0 |
| `<h1>` hilang di semua halaman laporan | `ReportSheet`/`ReportLetterhead` merender `<h1>` | diverifikasi di browser |

## 1. Model tanpa pemakaian kode — **DITARIK: tidak ada**

Dua model yang dulu saya sebut "mati" ternyata **DIPAKAI**, lewat **nested write/read Prisma**
yang menyebut **nama relasi**, bukan nama model:
- `QcInspectionResult` — `results: { … }` di `src/actions/qc.actions.ts:269`,
  `src/lib/services/qc.service.ts:82`, dan halaman detail QC (`inspeksi/[slug]/page.tsx`);
  halaman daftar bahkan menghitungnya (`_count: { select: { results: true } }`) dan form
  inspeksi mengumpulkan hasil per item.
- `ProductionGenealogyMaterial` — `materials: { create: … }` di
  `src/lib/services/production-genealogy.service.ts:55`; **pembacanya belum ada** —
  `materials` tidak pernah di-`include`/`select` di mana pun (laporan Job Order membaca
  induk `productionGenealogy`-nya), jadi barisnya ditulis tetapi belum pernah ditampilkan.

**Kesalahan metodenya**: pemeriksaan saya mencari **nama model** dan **delegate**, sehingga
penggunaan lewat relasi tak terlihat. **Pelajaran**: "tak ada rujukan ke nama model" != "model mati".

**Penjaga yang seharusnya menangkap ini justru mati**: versi pertamanya selalu melaporkan
"dipakai", karena regex nama relasi ikut menangkap **kata kunci `model`** dari baris header
(`model X {` → relasi bernama "model"), dan `model:` hampir pasti ada di suatu objek di kode.
Ditemukan hanya karena saya **memfalsifikasi** penjaganya (menyuntikkan model mati → ia tetap
hijau). Sesudah diperbaiki, falsifikasi itu **memerah** seperti seharusnya.

## 2. (riwayat) Kolom penaut rekonsiliasi yang dulu diduga hilang

Pencocokan rekonsiliasi **sudah mencatat dokumen sumbernya** lewat
`BankReconciliationItem.journalEntryId` (ditulis `matchReconciliationLine()`, terindeks).

> **Koreksi:** draf pertama menyebut empat kolom (`BankStatementLine.matchedJournalId`/
  `matchedPaymentId`, `BankReconciliationItem.relatedJournalId`/`relatedPaymentId`) sebagai
> "jejak audit yang tidak pernah diisi". Itu **salah** — saya belum memeriksa `journalEntryId`.
> Setelah diperiksa: keempatnya **duplikat**, sekelas `amountPaid`, dan sudah **dibuang** (§0).
> `BankStatementLine.matchedType` juga tak ditulis aplikasi — kini 0 rujukan kode (lihat §3).

## 3. (riwayat) Kolom skalar tanpa rujukan — gelombang 1 tuntas, gelombang 2 sisa 4

### Gelombang 1: 11 kolom — **semuanya sudah dibuang**

| Model | Kolom | Nasib |
| --- | --- | --- |
| `UnitOfMeasure` | `conversionFactor` | dibuang (migrasi `20261016230000_drop_uom_conversion_factor`) — setelah data diperiksa, 6 barisnya semuanya bernilai `1.000000` (default tanpa informasi) |
| `WorkSchedule` | `lateToleranceMinutes` | dibuang (migrasi `20261016220000_drop_unused_hook_columns`); keterlambatan kini diatur "Denda Keterlambatan per Menit" di `/pengaturan/ubah` |
| `BankStatementLine` | `valueDate` | dibuang (migrasi yang sama) |
| `Holiday` | `isNationalHoliday` | dibuang (migrasi yang sama) |
| `DepartmentHoliday` | `isRecurring` | dibuang (migrasi yang sama) |
| `OvertimeRequest` | `approvedBySupervisor` | dibuang (migrasi yang sama) |
| `PurchaseRequest` | `requesterId` | dibuang (migrasi yang sama) |
| `ApprovalWorkflow` | `isParallel` | dibuang (migrasi yang sama) |
| `ApprovalWorkflowStep` | `autoApproveAfterTimeout`, `timeoutHours` | dibuang (migrasi yang sama) |
| `Tax` | `displayOrder` | dibuang (migrasi yang sama) |

> **Koreksi yang tetap berlaku:** `conversionFactor` sempat saya pertahankan karena **berisi
> data (6/6 baris)** — *"tak dirujuk kode" ≠ "tak berisi data"* tetap benar. Setelah nilainya
> diperiksa, keenam baris ternyata hanya default `1.000000` (tanpa informasi), jadi kolomnya
> menyusul dibuang. Prinsipnya: periksa datanya dulu sebelum membuang.

Semua di atas sudah hilang dari `schema.prisma` dan tidak lagi muncul di daftar-beku penjaga.

### Gelombang 2: 6 kolom (terdeteksi setelah 11 skrip yatim dibuang) — sisa **4**

| Model | Kolom | Status |
| --- | --- | --- |
| `BankStatement` | `totalDebits`, `totalCredits` | **DITUTUP (2026-10-18)**: dihitung ulang dari barisnya (`recalcBankStatementTotals`, `src/actions/finance.actions.ts`) di dalam transaksi yang sama dengan create/update/delete `BankStatementLine`; dikunci `finance.actions.test.ts` |
| `ApprovalWorkflowStep` | `canSkip` | **DIBUANG (2026-10-19, branch kerja)**: 0 rujukan kode produk — form `/pengaturan/workflow` tak mengeksposnya, `workflowStepSchema` tak punya field itu, engine `approveStep` tak membacanya; mengarang semantik skip = data audit palsu (migrasi `20261019001000_drop_wave2_dead_columns`) |
| `Asset` | `assetBrandModelId` | **DITUTUP (2026-10-19, branch kerja)**: form aset kini punya dropdown "Tipe / Model" berjenjang dari merek (`AssetForm` + query `models` di halaman tambah/ubah), `assetSchema` menerima + `createAsset`/`updateAsset` menulis + MENOLAK model bukan milik merek terpilih; detail aset menampilkan Merek + Tipe; `deleteAssetBrand` menolak bila merek masih dipakai aset langsung/lewat tipe atau masih punya tipe (`assetBrandModelId` bare int tanpa FK — hapus diam-diam = ID yatim); dikunci `asset.actions.test.ts` 9 tes baru + prune `KNOWN_UNUSED` |
| `BankReconciliationItem` | `clearedDate` | **DIBUANG (2026-10-19, branch kerja)**: 0 rujukan kode produk — tak satu pun aksi menulisnya; aksi `match` hanya menulis `matched` boolean di item; `cleared` tetap (matematika outstanding `completeReconciliation`) (migrasi `20261019001000_drop_wave2_dead_columns`) |
| `BankStatementLine` | `matchedType` | **DIBUANG (2026-10-19, branch kerja)**: 0 rujukan kode produk — jenis kecocokan derivable dari `BankReconciliationItem.type` + `journalEntryId` (migrasi `20261019001000_drop_wave2_dead_columns`) |

Gelombang 2 kini **tuntas**: `KNOWN_UNUSED` di `src/__tests__/schema-usage.test.ts` kosong
(tersisa hanya komentar riwayat), dan tak ada lagi kolom mati yang menunggu keputusan.

Keenam kolom gelombang 2 itulah yang PERNAH mengisi `KNOWN_UNUSED` di `src/__tests__/schema-usage.test.ts`
(dua arah: kolom mati baru memerahkan tes, dan menambal/membuang salah satunya juga).

## 4. (riwayat) `updatedBy`

Dulu: 12 model mendeklarasikan `updatedBy`/`updated_by` tetapi **tak ada kode yang menulisnya**
(`createdBy` justru dipakai). Kini **ditulis di semua 16 titik update** — lihat §0.

---

## 5. Aksi transisi server tanpa pemanggil UI

> **⚠ DITARIK (koreksi besar).** Seluruh klaim "celah / gerbang buntu" di §5–§5d **SALAH**, dan
> saya cabut. Rute generik `src/app/api/workflow/[...path]/route.ts` punya jalur **fall-through**:
> bila tak ada workflow aktif, tombol **Setujui** di halaman detail menjalankan
> `updateMany({ where: { id, status: { in: ["pending","draft","sent"] } }, data: { status: "approved" } })`
> — untuk **setiap** modul di `MODULE_MAP` (quotation, salesOrder, purchaseOrder, salesInvoice,
> purchaseRequest, vendorBill, leaveRequest, overtimeRequest, employeeLoan).
> **Dibuktikan di browser**: tiga dokumen `draft` (SO, PO, Penawaran) → setelah klik **Setujui**,
> ketiganya menjadi `approved` di DB. Gerbang "approved" **terjangkau**, sehingga form penerimaan,
> surat jalan, dan uang muka **bisa dipakai**.
>
> **Akar kesalahan saya**: saya mencari rujukan ke nama aksi **spesifik** (`confirmSalesOrder`,
> `acceptQuotation`, …) lalu menyimpulkan "tak ada yang bisa menghasilkan status ini" — tanpa
> bertanya **"apa lagi yang menulis status ini?"**. Saya bahkan sudah melihat `StatusActions` di
> halaman detail SO dan **mengabaikannya** dengan alasan "itu hanya approve/reject, bukan mesin
> status" — padahal `approve` menghasilkan status `approved` yang **justru** diterima gerbang itu.
>
> **Yang tetap berlaku**: `postJournal` dan `confirmVendorPayment` **memang** celah nyata — modul
> jurnal dan pembayaran vendor **tidak** ada di `MODULE_MAP`, jadi tak ada fall-through untuk
> keduanya; keduanya sudah ditutup (§0). Daftar 17 aksi nol-rujukan itu benar sebagai daftar,
> dan sudah **ditindaklanjuti tuntas**: 8 aksi murni pembalik status **dihapus** (`a194d31c`,
> `8f9a9dbe`, `c174a183`), 9 aksi berperilaku nyata **disambungkan** ke UI ([1b-1]/[1b-2]).
> Penjaga `wired-transition-actions` kini menuntut setiap aksi transisi punya pemanggil UI.

**Metode:** memindai 331 aksi (`src/actions/*.ts`) untuk rujukan di luar berkas definisinya.
Helper query murni (`getCronLogs`, `getProjectProgress`, …) dan aksi auth legacy dikecualikan.
Saat audit, guard `wired-transition-actions` mengonfirmasi 17 entri memang nol rujukan; kini
guard itu **dibalik** menjadi tuntutan: `ALLOWED_UNWIRED` kosong dan setiap aksi transisi wajib
punya pemanggil UI.

**Sudah ditutup:** `postJournal`, `confirmVendorPayment` (§0); 8 aksi pembalik status
**dihapus**, 9 aksi berperilaku **disambungkan** (lihat [1b-1], [1b-2], dan keputusan #1).

**Rantai Sales Order — SUDAH DITUTUP (`a194d31c`):** ketiga aksi pembalik status
(`confirmSalesOrder` → `processSalesOrder` → `completeSalesOrder`) **dihapus** karena tak
terjangkau dan digantikan rute generik. Status SO naik lewat tombol **Setujui** di halaman
detail (`StatusActions` → `/api/workflow`; `salesOrder` ada di `MODULE_MAP`), dan halaman
detail pesanan kini punya kartu + tombol "+ Surat Jalan" untuk status yang boleh dikirim.

### §5b. (DITARIK) Pengadilan lanjutan (penawaran, cuti, pengeluaran)

- **Celah — rantai Penawaran**: `sendQuotation`/`acceptQuotation`/`rejectQuotation` tak punya
  tombol; penawaran **tidak** lewat approval-workflow. Akibatnya `convertQuotationToOrder` —
  yang menuntut `accepted`/`approved` — **selalu gagal**; rujukan tunggal ke aksi itu hanyalah
  sebuah **komentar**. Jalur penawaran→SO buntu.
- **Bukan celah (koreksi)**: `approveLeave`/`rejectLeave` **usang** — HR memakai
  `requestApprovalIfConfigured`, jadi `approved` terjangkau. (Kecurigaan awal saya bahwa cuti
  "macet pending" **saya cabut**.)
- **Minor**: `markExpensePaid` — `approveExpense`/`rejectExpense` **sudah tersambung**; `paid`
  hanya menggerbangi penghapusan.
- **Belum diadili dampaknya**: `markPurchaseOrderOrdered`, `cancelPurchaseOrder`,
  `processPurchaseReturn`, `deleteSalesOrder`, `updateProductionCost`.

### §5c. (DITARIK) Penerimaan barang "terblokir"

`createGoodsReceipt` **menuntut PO `approved`/`ordered`** (guard-nya berkomentar *"Lock + validate
the PO status before creating the receipt"*), tetapi PO lahir **`draft`**; penulis `approved`
hanya `approvePurchaseOrder` (nol pemanggil UI) dan approval-workflow (yang **tidak di-seed**);
`markPurchaseOrderOrdered` juga nol pemanggil.

**Bukti browser itu hanya membuktikan PENYARINGAN, bukan ketakterjangkauan** — saya salah
membacanya: dengan 1 PO draft di DB dan tanpa alur
persetujuan, form penerimaan menawarkan **0 opsi**; query-nya
`where: { status: { in: ["ordered","approved"] } }` — jadi peng-exclude-an memang **karena
status**. Baru bisa dipakai bila pengguna mengonfigurasi alur persetujuan `PurchaseOrder` di
`/pengaturan/workflow`.

### §5d. (DITARIK) Sisiran gerbang status

| Form | Menuntut | Status |
| --- | --- | --- |
| `/pembelian/penerimaan/tambah` | PO `approved`/`ordered` | **Buntu bahkan di DB ber-seed** (seed tak membuat PO) — terbukti di browser |
| `/penjualan/surat-jalan/tambah` | SO `approved`/`confirmed` | Buntu bagi SO buatan UI; **tertutupi seed** (§5e) |
| `/penjualan/uang-muka/tambah` | **Quotation** `accepted`/`approved` | Buntu lewat rantai penawaran (§5b) |

Ketiganya kini **menjelaskan syaratnya** alih-alih buntu senyap, dan invariannya dijaga tes
(halaman wajib tetap menyediakan form — sesuai guard `crud-surface` — **dan** menjelaskan bila
pemilihnya kosong). Pesannya **tidak menyebut jalan keluar yang belum terverifikasi**.

**Diperiksa dan tidak berdampak**: `billed` & `partial` tak punya penulis, tetapi tak ada gerbang
yang menuntutnya.

### §5e. Kenapa kelas ini lolos dari 1000+ tes: seed memalsukan status — **SUDAH DITUTUP**

**Sisa yang diperiksa (agar klaim "sudah ditutup" tidak menggantung).** Setelah dua perbaikan di
atas, seed masih menulis beberapa status langsung — dan **semuanya keadaan yang bisa dicapai
aplikasi**: `salesOrder: draft`, `deliveryOrder: draft`, `salesInvoice: posted` (via `postInvoice`
yang tersambung), `vendorBill: draft` (bisa diposting lewat `confirmVendorBill`), `journal: DRAFT`
(kini bisa diposting lewat tombol Posting), dan `expense: approved` (lewat aksi persetujuan
pengeluaran yang **memang tersambung**). Jadi tidak ada lagi status **tak terjangkau** yang
dipalsukan seed.

`scripts/seed-remaining-e2e.ts` dulu membuat entitas **langsung pada status yang tak bisa dicapai
UI**: `salesOrder.create({ status: "confirmed" })` dan `journal` yang di-`update` jadi `POSTED`
secara manual. Lingkungan ber-seed — dev maupun E2E — karena itu **menyembunyikan** gerbang §5d.

**Ditutup.** Kedua fabrikasi itu sudah dibuang (SO kini `draft`, jurnal dibiarkan `DRAFT`), masing-
masing disertai komentar **di tempat kejadian** agar tak dipulihkan tanpa sengaja. Diukur sebelum
memutuskan: dengan kedua perubahan itu, **suite E2E penuh tetap 1063 lulus / 0 gagal** — dan tak
ada spec yang membuat surat jalan, jadi status palsu itu memang tak memberi manfaat apa pun.

> **Koreksi (kekhawatiran saya sendiri):** saya sempat memperingatkan bahwa un-posting jurnal bisa
> membuat tes laporan **lulus hampa**. Itu **tidak terbukti**: spec neraca-saldo sudah punya
> penjaga non-vakum (`expect(totalDebit).toBeGreaterThan(0)`) dan tetap lolos setelah un-posting —
> karena laporan tetap berisi posting otomatis dari hook. Jadi menukar "masking" dengan "vakum"
> tidak terjadi.

**Batas kejujuran yang masih berlaku:**
- Klaim §5d untuk **uang muka** hanya terverifikasi lewat kode (pengukuran browser saya salah
  sasaran: combobox pertama form itu pencari **pelanggan**, bukan penawaran).
- Daftar lengkap pasangan (entitas, status) yang dipalsukan seed **belum** disusun. Pemeriksaan
  kasar ("apakah status X punya penulis?") **tidak memadai** karena tak membedakan entitas
  (`confirmed` punya 2 penulis; untuk `SalesOrder` hanya satu — dan itu aksi tak tersambung).
  Yang terverifikasi baru dua instance: `SalesOrder = "confirmed"`, `Journal` DRAFT→POSTED.

---

## 6. Metode & pemeriksaan ulang (setelah pencabutan §5)

Pencabutan besar di §5 memaksa saya memeriksa **semua** keluarga klaim dengan pertanyaan yang
sama: *"keadaan ini bisa dihasilkan/diakses oleh apa saja?"* — bukan hanya "apakah nama X muncul?".

| Keluarga klaim | Metode | Hasil pemeriksaan ulang |
| --- | --- | --- |
| Gerbang status "buntu" (§5b–§5d) | rujukan ke **aksi spesifik** | **GAGAL** — jalur generik `/api/workflow` (fall-through) menghasilkan `approved`. **Dicabut.** |
| Model tanpa pemakaian (§1) | nama model + delegate **dan** jalur relasi (`include`/`select`) | **Lolos** — `QcInspectionResult`: `results` ditulis nested **dan** dibaca (halaman detail + `_count` di daftar); `ProductionGenealogyMaterial`: ditulis nested, tetapi `include: { materials }` **nol** di seluruh kode — ditulis, belum pernah dibaca. |
| Kolom skalar tanpa rujukan (§3) | nama field **dan** nama kolom `@map`, plus `$queryRaw` | **Lolos** — tak ada SQL mentah yang menyebut kolom-kolom itu; spread `data: x` yang ada tidak berkaitan. |
| `postJournal`/`confirmVendorPayment` (§0) | rujukan aksi **dan** keberadaan rute generik | **Lolos** — modul **jurnal** & **pembayaran vendor** tidak ada di `MODULE_MAP`, jadi tak ada fall-through; sebelum perbaikan, jurnal memang tetap `DRAFT` di DB. |

**Pelajaran**: "tak ada rujukan ke aksi bernama X" **bukan** bukti "alur mati". Untuk menyatakan
sesuatu tak terjangkau, harus diperiksa juga **jalur generik** (rute, registry, dispatch) — dan
lebih baik dibuktikan di browser/database daripada disimpulkan dari bacaan kode.

## Keputusan yang menunggu

1. ~~**Higienitas kode: 17 aksi tanpa pemanggil UI**~~ — **sudah tuntas.** Kelompok
   **(a) 8 aksi murni membalik status** (`confirmSalesOrder`, `processSalesOrder`,
   `completeSalesOrder`, `approvePurchaseRequest`, `approvePurchaseOrder`,
   `markPurchaseOrderOrdered`, `approveLeave`, `rejectLeave`) **dihapus** — statusnya
   digantikan rute generik `/api/workflow` (`a194d31c`, `8f9a9dbe`, `c174a183`). Kelompok
   **(b) 9 aksi berperilaku nyata** (`reviseQuotation`, `send`/`accept`/`rejectQuotation`,
   `cancelPurchaseOrder`, `processPurchaseReturn`, `deleteSalesOrder`, `markExpensePaid`,
   `updateProductionCost`) **disambungkan ke UI** ([1b-1]/[1b-2]). Penjaga
   `wired-transition-actions` kini menuntut setiap aksi transisi punya pemanggil UI
   (`ALLOWED_UNWIRED` kosong + asersi) — jadi "tak terjangkau" tak bisa kembali diam-diam.
2. ~~**Seed memalsukan status** (§5e)~~ — **sudah ditutup** (lihat §5e).
3. **Skema tak terpakai** — ~~11 kolom §3~~ — **gelombang 1 tuntas** (kesebelasnya dibuang
   lewat `20261016220000_drop_unused_hook_columns` + `20261016230000_drop_uom_conversion_factor`).
   Sisa keputusan gelombang 2: **tidak ada** — gelombang 2 tuntas (2026-10-19,
   branch kerja): keempat kolom di bawah sudah ditutup/dibuang, lihat §3.
4. ~~**Usulan `ci.yml`**~~ — **sudah diterapkan** (`db push` → `migrate deploy`, dua job).
   Terbukti: migrasi jalan dari DB kosong, `migrate status` up-to-date, drift 0, seed jalan,
   **suite E2E penuh hijau di skema hasil migrasi** (1063 lulus).

   **Apa yang akan dihancurkan `db push` di produksi** (inventaris dari migrasi; 16 tabel,
   17 kolom): `allocation_rules`, `approval_delegations`, `budgets`, `crm_pipelines`,
   `crm_pipeline_stages`, `currencies`, `exchange_rates`, `fob_terms`, `price_list_items`,
   `price_lists`, `product_vehicle_models`, `role_module_access`, `sales_targets`, `salespersons`,
   `skf_values`, `statistical_key_figures`; kolom termasuk `amount_paid`, `matched_journal_id`,
   `matched_payment_id`, `related_journal_id`, `related_payment_id`, `salesperson_id`, `npkh`… *

   > **Koreksi (peringatan saya sendiri):** saya sempat menyiratkan bahwa `db push` khususnya
   > berbahaya karena akan menghapus `amountPaid` + 4 kolom penaut rekonsiliasi. Itu **tidak
   > akurat**: keduanya **punya migrasi**, jadi `migrate deploy` pun akan menghapusnya.
   >
   > **Koreksi kedua (menurunkan risiko peralihan):** saya juga berspekulasi produksi mungkin
   > menyimpan objek sisa yang tak tercakup migrasi mana pun. Itu **kemungkinan besar tidak
   > berlaku**: karena `Dockerfile` menjalankan `db push` di **setiap boot**, skema produksi
   > **dijaga terus sama dengan `schema.prisma`** — jadi tidak ada objek tersembunyi, dan
   > **kedua jalur (db push ↔ migrate deploy) konvergen ke skema yang sama**. Itu membuat pilihan
   > (a) di atas **aman dari sisi skema**; yang tersisa hanyalah soal tinjauan/jejak, dan satu
   > prasyarat teknis: produksi harus di-**baseline** dulu.
   >
   > **Langkah konkret untuk beralih** (perintah teks — butuh akses produksi, tidak saya jalankan):
   > ```sh
   > # 1) Diff dulu: pastikan produksi == skema (harus KOSONG). Tidak mengubah apa pun.
   > DATABASE_URL=<prod> npx prisma migrate diff --from-config-datasource \
   >     --to-schema prisma/schema.prisma --script
   > # 2) Baseline: tandai migrasi yang belum tercatat di _prisma_migrations sebagai applied
   > DATABASE_URL=<prod> npx prisma migrate resolve --applied <nama-migrasi>   # ulangi per migrasi
   > # 3) Verifikasi
   > DATABASE_URL=<prod> npx prisma migrate status        # harus "up to date"
   > # 4) Baru ubah Dockerfile
   > #    CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
   > ```

   Juga `scripts/ci-local.sh` masih `db push`, sehingga mirror CI lokal kini berbeda dari CI asli
   — menyamakannya **tidak boleh** dilakukan tanpa DB scratch, sebab skrip itu berjalan di DB dev
   yang tak punya `_prisma_migrations` dan pernyataan migrasi yang tak idempoten bisa gagal.
5. ~~**Commit sesi ini**~~ — **sudah dikerjakan**: 15 commit bertema di `main`, **belum
   di-push** (push = keputusan Anda). Artefak yang sengaja dikecualikan: `SS/` (tangkapan
   layar), `.commandcode/taste/taste.md` (dikelola otomatis), `skills-lock.json` +
   `.commandcode/skills/` (belum terlacak).

6. **Provisioning produksi — paling berdampak, dan satu-satunya yang butuh akses di luar
   repo ini.** `Dockerfile` masih menjalankan `prisma db push` di setiap boot, sehingga
   migrasi tidak dipakai produksi. Prosedur 4 langkahnya ada di §5 (mulai dari `migrate diff`,
   yang tidak mengubah apa pun). `docs/AUDIT-REPORT.md` sendiri menyatakan produksi seharusnya
   `migrate deploy` (niat dan kode tidak sepakat), dan baseline `migrate resolve` yang diklaimnya
   untuk **31** migrasi kini basi — migrasinya sudah 52+. Catatan pembaruan bertanggal sudah
   ditambahkan di kepala laporan itu.

### (1b) 9 aksi berperilaku — per fitur, dan dua sudah diukur

Menghapus kelompok ini **menghilangkan kemampuan**, jadi bukan higienitas. Dua yang sudah diperiksa
per halaman menunjukkan **UI memang menuntutnya** — menghapus aksinya akan meninggalkan UI cacat:

- **`markExpensePaid`** — UI pengeluaran **tidak punya affordance "lunas"** sama sekali (0 rujukan);
  yang tersambung hanya `approveExpense`/`rejectExpense`/`deleteExpense`/`updateExpense`. Aksi ini
  juga **memposting jurnal**, jadi tanpa UI-nya pembayaran pengeluaran tak bisa dicatat.
- **`reviseQuotation`** — halaman detail penawaran **sudah merender riwayat revisi**
  (`// 2. Database histories (revisions)`), padahal tak ada yang bisa membuat revisi.

Rekomendasi untuk dua ini: **sambungkan**, bukan hapus (menghapus berarti ikut membuang UI-nya).

Tujuh sisanya kini **sudah diukur per modul** (aksi apa yang disambungkan UI + affordance apa yang ada):

| Aksi | Yang disambungkan UI | Affordance yang ada | Vonis |
| --- | --- | --- | --- |
| `deleteSalesOrder` | — | hanya "Ubah"; `StatusActions` (approve/reject generik) | tak ada jalan menghapus SO, padahal modul lain punya → sambungkan atau buang |
| `send`/`accept`/`rejectQuotation` | `deleteQuotation` | `StatusActions` (generik) | **tergantikan**: rute generik menetapkan `approved`, dan konversi ke SO menerima `approved` → status `sent`/`accepted`/`rejected` tak dipakai siapa pun → paling aman dibuang |
| `cancelPurchaseOrder` | `deletePurchaseOrder` | hanya "Ubah" | tak ada jalan membatalkan PO (menghapus tersedia) → sambungkan atau buang |
| `processPurchaseReturn` | `deletePurchaseReturn` | hanya "Ubah"; `StatusActions` = 0 | tak ada jalan memproses retur (padahal efeknya stok + GL) → sambungkan atau buang |
| `updateProductionCost` | — | bagian biaya produksi **read-only** (`production-cost-section.tsx`) | biaya produksi tak bisa diisi/diubah dari UI (aksinya punya unit test) → sambungkan atau buang |

**Kualifikasi penting (setelah diperiksa lagi)**: klaim "tiga aksi penawaran paling aman dibuang"
tidak sepenuhnya berdiri. Membuang aksinya memang **tidak memblokir apa pun** — efeknya tetap
tercapai lewat rute generik, dan halaman detail **menerima** `approved`
(`["accepted", "approved"].includes(quotation.status)`). **Tetapi UI-nya masih menawarkan filter**
untuk status itu (`statusChips = ["", "draft", "sent", "accepted", "converted", "cancelled"]`),
jadi setelah aksinya dibuang **filter itu menjadi mati** — tak akan pernah cocok.

**[3] 11 kolom hook — kelas yang BERBEDA dari (1b): tanpa jejak UI.** Diperiksa di halaman fiturnya
(karena 0 rujukan kode berarti tak ada form/daftar/filter yang membacanya), dan hasilnya konsisten:
**tidak ada UI yang menunggu kolom-kolom itu**, jadi membuangnya tidak meninggalkan tombol/filter mati.
Contoh yang diperiksa: `WorkSchedule.lateToleranceMinutes` — keterlambatan kini diatur lewat setelan
**lain** ("Denda Keterlambatan per Menit" di `/pengaturan/ubah`), jadi kolom ini sisa desain lama;
`Tax.displayOrder` — 0 rujukan; dan `ApprovalWorkflow.isParallel`/`autoApproveAfterTimeout`/
`timeoutHours` — halaman `/pengaturan/workflow` **tidak mengeksposnya**. Keputusan (3) karena itu
murni soal **niat fitur** ("masih berencana atau tidak"), bukan soal UI — jauh lebih murah dari (1b).

**Tindak lanjut (2026-10-16): diputuskan BUANG** — kesebelasnya sudah hilang dari `schema.prisma`
lewat `20261016220000_drop_unused_hook_columns` (10 kolom) +
`20261016230000_drop_uom_conversion_factor` (`conversionFactor`, setelah 6 barisnya terbukti
hanya default `1.000000`). Gelombang 2 (§3) kini tuntas — tak ada sisa keputusan
di kelompok ini.

**Kesimpulan yang konsisten untuk kesembilannya**: tidak ada satu pun yang bisa "dibuang begitu saja";
selalu ada **jejak UI yang menunggunya** (tombol, filter, label, atau bagian riwayat). Jadi pilihannya
selalu salah satu dari dua, per fitur: **sambungkan**, atau **buang aksi beserta jejak UI-nya**. Itu
keputusan produk — dan itulah kenapa kelompok ini terpisah dari (1a), yang benar-benar higienitas.
Tujuh sisanya **belum diukur per halaman**: `deleteSalesOrder`, `send`/`accept`/`rejectQuotation`,
`cancelPurchaseOrder`, `processPurchaseReturn`, `updateProductionCost`.

### [1b-1] Kelompok penawaran — diputuskan **SAMBUNGKAN** (dilaksanakan)

Tiga aksi (`sendQuotation`, `acceptQuotation`, `rejectQuotation`) diadili sebagai **satu rantai**:
`send` menuntut `draft`, `accept`/`reject` menuntut `sent` (`sales.actions.ts:186,235,280`), jadi
memutus satu simpul meninggalkan status terminal tanpa jalan keluar.

**Alasan memilih sambungkan, bukan buang** — mengikuti preseden `expense-approval-actions.tsx`:
rute generik `/api/workflow` hanya membalik status lewat `updateMany` **tanpa efek domain**,
sedangkan ketiga aksi ini menulis `quotationHistory` (dirender sebagai timeline di halaman detail,
`[slug]/page.tsx:108-116`) dan `acceptQuotation` juga menotifikasi admin. Membuangnya berarti
kehilangan efek itu — bukan higienitas.

**Bukti lain yang diukur sebelum memutuskan**:

- Status terjangkau sebelum perubahan hanya `draft`, `converted`, `approved` → chip `sent`/`accepted` mati.
- `cancelled` **tak pernah ditulis** untuk quotation: satu-satunya tulisan `cancelled` di
  `sales.actions.ts:2206` milik **SalesInvoice** → chip `cancelled` mati sejak awal (bukan akibat aksi mana pun).

**Yang dikerjakan**: komponen `quotation-flow-actions.tsx` (tombol *Tandai Terkirim* / *Terima* / *Tolak*
sesuai status) di area aksi halaman detail; chip daftar disetarakan dengan status yang benar-benar
terjangkau — `["", "draft", "sent", "accepted", "rejected", "converted", "approved"]`; penjaga
`wired-transition-actions` memindahkan ketiganya dari `ALLOWED_UNWIRED` ke `REQUIRED_CALLERS`.

**Verifikasi**: 3 tes unit baru (**difalsifikasi**: melonggarkan syarat `draft` → memerah, karena
tombol muncul pada `accepted`), `tsc` bersih, suite utuh, dan E2E dijalankan **setelah rebuild**.

### [1b-2] Enam sisanya — semuanya **SAMBUNGKAN** (dilaksanakan)

Tata caranya sama seperti [1b-1]: ukur dulu (jejak UI · status yang bisa ditulis · apakah tergantikan),
baru putuskan. Dua kali saya menduga "buang", dan dua kali **pengukuran membalikkannya**:

- **`deleteSalesOrder`** — dugaan: tergantikan bulk delete. **Salah.** `bulk.actions.ts:302-314` menolak
  bulk delete untuk model ber-efek GL/stok (dan `salesOrder` ada di daftar itu), dengan pesan yang
  mengarahkan pengguna ke *"per-row delete action, which handles reversal + guards correctly"* —
  padahal jalan itu tak pernah ada. Jadi UI menyarankan sesuatu yang mustahil dilakukan; dropdown
  tabel SO kini menyediakannya.
- **`updateProductionCost`** — klaim dokumen lama ("bagian biaya produksi read-only") **keliru**:
  `production-cost-section.tsx` sudah memanggil `createProductionCost` dan `deleteProductionCost`.
  Yang hilang hanya kemampuan membetulkan salah input. Aksi itu menulis **semua** field dengan
  `?? null`, sedangkan baris di UI tidak membawa `vendorId` — jadi menyunting sembarangan akan
  menghapus tautan vendor secara senyap. Karena itu `vendorId` kini ikut di baris dan dibawa apa
  adanya lewat field tersembunyi.

Vonis dan buktinya:

| Aksi | Bukti jejak UI | Vonis |
| --- | --- | --- |
| `cancelPurchaseOrder` | chip daftar PO menawarkan `cancelled` (`pembelian/pesanan/page.tsx:60`) | sambungkan (`VoidButton`) |
| `processPurchaseReturn` | chip daftar retur menawarkan `returned`, yang hanya lahir dari aksi ini (stok + jurnal) | sambungkan (`ProcessButton`) |
| `markExpensePaid` | siklus `draft → approved → paid` tak punya jalan ke `paid`; aksinya memposting jurnal kas/bank | sambungkan (+ chip `paid`) |
| `reviseQuotation` | timeline detail sudah merender baris "Revisi" dari `quotationHistory` (butuh alasan; hanya dari `sent`) | sambungkan (dialog ber-alasan) |
| `deleteSalesOrder` | pesan bulk delete mengarahkan ke hapus per-baris yang tak ada | sambungkan (dropdown tabel) |
| `updateProductionCost` | seksi biaya bisa menambah & menghapus, tak bisa membetulkan | sambungkan (sunting per baris) |

**Akibatnya `ALLOWED_UNWIRED` di penjaga `wired-transition-actions` kini KOSONG**, dan itu dijadikan
asersi: "tak ada aksi transisi yang dibiarkan tanpa pemanggil UI". Setiap pengecualian berikutnya harus
disengaja — menghapus asersi itu dan menulis alasannya.

**Verifikasi**: `tsc` bersih · suite 3771 lulus · E2E dijalankan setelah rebuild.

### SonarCloud: check eksternal (GitHub App), BUKAN job di repo ini

`SonarCloud Code Analysis` yang muncul di PR **bukan** job dari
`.github/workflows/ci.yml` — ia check dari SonarCloud GitHub App yang terpasang
di level organisasi/repo (di luar repo; tak ada akses admin SonarCloud dari
sesi kerja repo, jadi keberadaannya hanya bisa dibuktikan dari sisi GitHub).
Buktinya di dalam repo: antrean merge memperlakukannya sebagai gerbang wajib —
`.github/workflows/antrean-merge.yml` menuntut bucket persis `pass`
(absen = "belum selesai", **bukan** lolos), dan `docs/antrean-merge.md`
mencatat "SonarCloud PASS dengan `head_sha`" sebagai syarat merge.

**Keputusan: jangan tambah job Sonar internal ke `ci.yml`.** Alasannya:
(1) job scanner butuh `SONAR_TOKEN` + org/project key yang hanya bisa dibuat
pemilik admin SonarCloud — tanpa itu job hanya akan merah palsu di setiap PR;
(2) dua pemindai untuk proyek yang sama memberi dua sumber kebenaran yang bisa
tidak sepakat; (3) check App sudah terikat ke antrean merge sebagai gerbang,
jadi nilai unik job internal ≈ nol.

**Risiko yang diterima & opsi bila App mati/dinonaktifkan:** check
`SonarCloud Code Analysis` hilang dari PR → `antrean-merge.yml` menunggu
bucket `pass` yang tak pernah datang → antrean timeout (gagal keras, bukan
merge senyap tanpa Sonar) — kegagalannya **terlihat**, bukan senyap. Opsi
pemulihan, urut termurah: (a) aktifkan ulang App di Settings repo →
Integrations; (b) bila App memang dimatikan permanen, lepas tuntutan
`SonarCloud Code Analysis` dari `antrean-merge.yml` + `docs/antrean-merge.md`
dalam satu commit yang menyebut alasannya; (c) baru bila organisasi memilih
self-hosted: tambah job `workflow_dispatch`-only (manual, bukan gerbang PR)
memakai `SonarSource/sonarqube-scan-action` dengan secret `SONAR_TOKEN` —
sengaja **tidak** dibuat sekarang karena secret-nya belum ada dan job yang
tak pernah hijau hanya melatih orang mengabaikan merah. Proteksi branch
tidak diubah oleh catatan ini.

### Status falsifikasi penjaga (kapan terakhir diuji benar-benar menangkap)

| Penjaga / asersi | Difalsifikasi | Catatan |
| --- | --- | --- |
| `schema-usage` — kolom | ✓ | kolom disuntikkan tanpa rujukan → memerah |
| `schema-usage` — model | ✓ | **dulu MATI**: regex nama-relasi ikut menangkap kata kunci `model` (dan `model:` ada di objek lain di kode) sehingga **selalu hijau**; ketahuan justru saat difalsifikasi, kini diperbaiki |
| `navigation-targets` | ✓ | entri nav tanpa halaman → memerah; page tujuan disuntik `export { default } from …` dan `notFound()` tanpa kondisi → memerah (detektor AST, pola sah terukur bersih di 530 page) |
| `silent-failure` — catch kosong | ✓ | disuntikkan → memerah; daftar pengecualian kini **self-pruning** |
| `silent-failure` — promise senyap | ✓ | menangkap pelanggaran **nyata** di `verify-migrations.mjs` |
| `wired-transition-actions` | ✓ | wiring `postJournal` dilepas → memerah ("tidak dipanggil dari mana pun") |
| `check-migrations.mjs` (drift) | ✓ | kolom skema tanpa migrasi → memerah dan menyebut DDL yang kurang |

**Pelajaran**: penjaga yang **tidak pernah difalsifikasi** bisa hampa — dan dua di antaranya
memang hampa saat ditemukan. Falsifikasi bukan formalitas; ia satu-satunya cara membedakan
penjaga yang bekerja dari penjaga yang hanya tampak hijau.
