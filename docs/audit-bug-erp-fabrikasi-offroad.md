# Audit Bug Perilaku Bisnis — ERP Fabrikasi Off-road (YaraERP / Silengkap)

**Tanggal:** 7 Oktober 2026
**Cakupan:** alur penjualan (quotation/DP), pembelian/penerimaan, persediaan/pengeluaran material, produksi/work order, retur, dan akuntansi/HPP.
**Sifat:** audit baca-kode + verifikasi terhadap tes yang ada. **Tidak ada kode maupun data yang diubah.**
**Acuan bisnis:** `docs/prd-erp-fabrikasi-offroad.md` (spesifikasi target). Laporan ini memisahkan **BUG terkonfirmasi**, **RISIKO (perlu keputusan)**, dan **GAP PRD (fitur belum ada)**. Gap arsitektur awal ada di `docs/audit-gap-erp-fabrikasi-offroad.md`.

---

## 1. Ringkasan Eksekutif

Fondasi inti (FIFO per gudang, serial/batch, period lock, jurnal stok, idempotensi hook, klaim atomik pada beberapa aksi) sudah matang dan banyak dilindungi regresi. Namun masih ditemukan beberapa **celah perilaku bisnis nyata** yang dapat menghasilkan data tidak konsisten:

| # | Temuan | Klasifikasi | Dampak | Prioritas |
|---|--------|-------------|--------|-----------|
| B1 | GR item wajib serial bisa diterima **tanpa serial sama sekali** | **BUG — DIPERBAIKI** | Stok tak dapat dilacak; unit hasil tak punya identitas | P0 |
| B2 | Pengeluaran material & retur penjualan **tidak mengelola serial** | **BUG — DIPERBAIKI** | Serial salah status / tidak tercatat | P1 |
| B3 | Penjualan **tidak memblokir stok kurang** (`allowShortfall: true`) | **BUG — DIPERBAIKI** | Qty on hand & FIFO bisa negatif | P1 |
| B4 | Retur pembelian **tidak mencatat serial** yang keluar | **BUG — DIPERBAIKI** | Atribusi serial hilang dari dokumen | P2 |
| R1 | `completeWorkOrder` memanggil helper di luar transaksi | **DIPERBAIKI** | WO "completed" tanpa Delivery Order | P2 |
| R2 | `startWorkOrder` tidak pakai klaim atomik | **DIPERBAIKI** | Dua start paralel | P3 |
| R4 | `completeWorkOrder` menerima status `pending` | Keputusan bisnis (dibiarkan) | Bisa melewati `in_progress` | P3 |
| G1 | Belum ada modul QC/inspection/NCR/rework | **GAP PRD — DIPERBAIKI** | Tidak bisa menandai cacat & pengerjaan ulang | P0 |
| G2 | Belum ada snapshot revisi BOM/order & engineering change | **GAP PRD — SEBAGIAN DIPERBAIKI** | Perubahan BOM memengaruhi order lama | P0 |
| G3 | HPP hanya dari material; tanpa tenaga kerja/overhead/mesin | **GAP PRD — DIPERBAIKI** | Margin kendaraan tidak akurat | P1 |
| G4 | Belum ada biaya jasa/subkontrak ke HPP pekerjaan | **GAP PRD — DIPERBAIKI** | Penawaran jasa tak tercermin di biaya | P1 |

---

## 2. BUG Terkonfirmasi

### B1 — Item wajib serial dapat diterima tanpa nomor seri (P0)

**Lokasi:** `src/lib/hooks/goods-receipt.hook.ts:395–417`

```ts
// Serial tracking: register each received unit's serial number
if (itemMeta?.trackSerial && Array.isArray(item.serialNumbers)) {
  const serials = (item.serialNumbers as unknown[])
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0);
  if (serials.length !== baseQty) {
    throw new Error(...); // hanya dieksekusi bila field serialNumbers ADA (array)
  }
  ...
}
```

Karena kondisi memakai `Array.isArray(item.serialNumbers)`, bila field `serialNumbers` bernilai `null`, `undefined`, atau tidak dikirim sama sekali, seluruh blok dilewati. Akibatnya:

- GR **verified** untuk item `trackSerial=true` tanpa satu pun row `ItemSerial`.
- Jumlah serial **tidak wajib** dan **tidak dicek terhadap qty** pada kasus field kosong/absen.
- Ini tidak konsisten dengan jalur lain yang justru ketat:
  - `manufacturing.actions.ts:595–606` (`completeProductionOrder`) menolak bila `serials.length !== qty`.
  - `inventory-fifo.ts:244–254` (`consumeFifoLayers`) menolak bila jumlah serial dipilih != qty.
- Jalur pembuatan GR (`purchase.actions.ts` `createGoodsReceipt`/`updateGoodsReceipt`) meneruskan `serialNumbers: i.serialNumbers?.length > 0 ? i.serialNumbers : undefined` — jadi **field bisa absen** dan masuk ke hook sebagai `undefined`.

**Bukti tes:** `src/lib/hooks/__tests__/goods-receipt-over-receipt.test.ts` menguji (a) serial lengkap dan (b) serial kurang (`["S1"]` untuk qty 2 → throw), **tetapi tidak menguji daftar kosong/absen**. Celah ini lolos dari suite. Suite terkait (94 tes) lulus seluruhnya, memperkuat bahwa tidak ada tes yang menangkap kasus ini.

**Dampak bisnis:** unit yang seharusnya ber-identitas (mis. no. rangka mesin, komponen mahal) masuk gudang tanpa serial; penjualan/pengeluaran material tidak dapat memilih serial yang benar; ketertelusuran off-road custom rusak.

**Perbaikan yang disarankan:** bila `itemMeta?.trackSerial`, wajibkan `Array.isArray(item.serialNumbers)` dan `serials.length === baseQty` (base qty), lalu tolak dengan pesan jelas. Tambahkan regression test untuk kasus `null`/`undefined`/`[]`.

**Status (7 Okt 2026): SUDAH DIPERBAIKI.** `goods-receipt.hook.ts` kini memblokir item `trackSerial` tanpa serial: field absen/`null`/`[]` ditolak, jumlah harus sama dengan qty, dan duplikasi ditolak. Regression test ditambahkan di `src/lib/hooks/__tests__/goods-receipt-over-receipt.test.ts` (field absen, array kosong, duplikat). Verifikasi: 21 tes file tersebut lulus; suite hook+pembelian+manufaktur 379 tes lulus; `tsc --noEmit` bersih.

---

### B2 — Serial tidak dikelola konsisten pada pengeluaran material & retur penjualan (P1)

**Lokasi:**
- `src/lib/hooks/material-issue.hook.ts:78` — mengeluarkan material **tanpa** meneruskan `serialNumbers` ke `consumeFifoLayers`, dan tidak menyimpan serial yang terpakai.
- `src/lib/hooks/sales-return.hook.ts` — **tidak** mengembalikan status `ItemSerial` ke `available` (hanya membuat layer/stok IN), sehingga serial yang diretur tetap berstatus `used`.
- Pembanding yang sudah benar: `src/lib/hooks/inventory-transfer.hook.ts:92–115` menyimpan `consumedSerials` dan mereaktivasi di tujuan.

**Dampak:** serial yang dibeli untuk produksi tidak dapat ditelusuri ke WO; retur penjualan meninggalkan serial `used` (tidak bisa dijual lagi), menimbulkan selisih antara stok fisik, layer FIFO, dan tabel serial.

**Status (7 Okt 2026): SUDAH DIPERBAIKI.**
- `material-issue.hook.ts` kini meneruskan serial pilihan pemanggil (bila ada) ke `consumeFifoLayers` — jatuh ke auto-FIFO bila kosong — dan menyimpan `consumedSerials` ke baris `MaterialIssueItem.serialNumbers` (kolom Json baru).
- `sales-return.hook.ts` kini mereaktivasi serial item ber-`trackSerial` menjadi `available` di gudang tujuan (mirror transfer).
- `prisma/schema.prisma`: `MaterialIssueItem` mendapat kolom `serialNumbers Json?`.
- Regression test: `src/lib/hooks/__tests__/material-issue-serial.test.ts` (baru) dan `sales-return-uom.test.ts` (kasus revive serial).
- **Catatan deploy:** migrasi `prisma/migrations/20261007170000_add_material_issue_item_serial_numbers/` sudah **diterapkan ke DB Docker** (`silengkap_dev_db`) dan Prisma client di-regenerate. Untuk DB produksi, jalankan `prisma migrate deploy` / `db push`.

### B4 — Retur pembelian tidak mencatat serial yang keluar (P2)

**Lokasi:** `src/lib/hooks/purchase-return.hook.ts`.

`consumeFifoLayers` memang sudah menandai serial `used` untuk item `trackSerial`, tetapi serial yang terpakai tidak pernah disimpan pada dokumen retur.

**Status (7 Okt 2026): SUDAH DIPERBAIKI.** Hook kini menyimpan `consumedSerials` ke `PurchaseReturnItem.serialNumbers` (kolom Json baru). Migrasi: `prisma/migrations/20261007171000_add_purchase_return_item_serial_numbers/` (sudah diterapkan ke DB Docker). Regression test: `purchase-return-uom.test.ts` (kasus serial tercatat).

---

## 3. RISIKO / Perlu Keputusan Bisnis

### R1 — `completeWorkOrder` memanggil helper di luar transaksi (P2) — DIPERBAIKI

**Lokasi:** `src/actions/manufacturing.actions.ts:825–860`.

`autoCreateDeliveryOrder` dan `syncProjectStatus` kini menerima `txClient` dan dipanggil dengan `tx`, sehingga pembuatan Delivery Order + sinkronisasi proyek ikut dalam transaksi penyelesaian WO. Bila gagal di tengah, klaim WO di-rollback — tidak lagi menyisakan WO `completed` tanpa DO. Regression test lama (`work-order-complete-lock.test.ts`) tetap lulus.

### R2 — `startWorkOrder` tanpa klaim atomik (P3) — DIPERBAIKI

**Lokasi:** `src/actions/manufacturing.actions.ts:710`. Kini memakai `updateMany` kondisional (`WHERE status IN (pending,draft)`) lalu flip item di dalam transaksi yang sama. Regression test baru: `src/actions/__tests__/work-order-start-lock.test.ts`.

### R3 — Penjualan mengizinkan stok kurang (P1) — DIPERBAIKI

**Lokasi:** `src/lib/hooks/accounting.hook.ts` (`onSalesInvoicePosted`).

Ditambahkan **stock guard**: sebelum posting, ketersediaan per gudang (jumlah `InventoryLayer.remaining` untuk item `isProduct`) dibandingkan dengan kebutuhan (dikonversi ke unit dasar). Bila kurang, posting ditolak dengan pesan jelas; `consumeFifoLayers` kini dipanggil `allowShortfall: false`. Item jasa/non-stok dikecualikan. Regression test: `accounting-hook.test.ts` (kasus stok kurang → throw, tanpa StockMove).

### R4 — `completeWorkOrder` menerima status `pending` (P3) — DIBIARKAN

**Lokasi:** `manufacturing.actions.ts:796`. Perilaku ini bisa disengaja (menyelesaikan WO tanpa melewati `in_progress`); tidak diubah karena menyentuh kebijakan bisnis, bukan cacat yang pasti. Mohon keputusan owner.

---

## 4. GAP PRD (Fitur Belum Ada — bukan bug)

Merujuk `docs/prd-erp-fabrikasi-offroad.md`:

- **G1 — QC / Inspeksi / NCR / Rework / Keselamatan (P0) — DIPERBAIKI SEBAGIAN (7 Okt 2026).** Ditambahkan modul QC lengkap: model `QcChecklist` + `QcChecklistItem` (checklist inspeksi ber-versi, draft → released), `QcInspection` + `QcInspectionResult` (inspeksi per dokumen: WorkOrder/ProductionOrder/GoodsReceipt, jenis incoming/in_process/final, hasil pass/fail/na per item, status passed/failed diturunkan dari hasil), dan `Nonconformance`/NCR (cacat, rework, severity, penanggung, biaya/jam rework, status open → rework → rework_done/rejected → closed). Gate serah terima (`assertWorkOrderQcCleared`, PRD FAB-11/FAB-13) memblokir `completeWorkOrder` bila ada NCR terbuka atau inspeksi akhir terakhir bukan `passed`; WO tanpa catatan QC tetap boleh selesai (QC opt-in, agar job sederhana/lama tetap bisa ditutup). UI lengkap: `/produksi/qc` (dasbor statistik), `/produksi/qc/checklist` (list/tambah/detail/ubah + rilis), `/produksi/qc/inspeksi` (list/tambah/detail), `/produksi/qc/ncr` (list/tambah/detail + form penyelesaian). Izin `view_qc`/`manage_qc_checklists`/`manage_qc_inspections`/`manage_nonconformances` (seed + registry + sidebar + ROUTE_PERMS). Aksi: `createQcChecklist`/`updateQcChecklist`/`releaseQcChecklist`/`deleteQcChecklist`, `createQcInspection`, `createNonconformance`/`resolveNonconformance`. Migrasi: `prisma/migrations/20261007190000_add_qc_inspection_nonconformance/` (diterapkan ke DB Docker). Test: `src/actions/__tests__/qc.test.ts` + `src/lib/services/__tests__/qc.service.test.ts` (20 kasus). **Sisa:** checklist keselamatan (safety) terpisah, auto-raise NCR dari inspeksi gagal, dan integrasi HPP rework ke biaya order belum termasuk.
- **G2 — Engineering/BOM & kontrol revisi (P0)** — **DIPERBAIKI SEBAGIAN (7 Okt 2026).** Ditambahkan model `BomRevision` + `BomRevisionMaterial`: snapshot BOM ber-versi per produk (draft → released → superseded). `ProductionOrder` dan `WorkOrder` kini menyimpan `bomRevisionId`, dan `createProductionOrder` memakai `resolveEffectiveBom()` untuk memilih revisi **released** terakhir (fallback ke BOM kerja bila belum ada revisi rilis), sehingga perubahan BOM master tidak lagi mengubah dasar order yang sudah dirilis. UI lengkap: halaman `/produksi/bom-revisi` (list/tambah/detail/ubah), aksi create/update/release/delete, izin `manage_bom_revisions` & `view_bom_revisions`, entri sidebar + registry modul. Migrasi: `prisma/migrations/20261007180000_add_bom_revisions/` (sudah diterapkan ke DB Docker). Regression test: `src/actions/__tests__/bom-revision.test.ts` (14 kasus) + `src/lib/services/__tests__/bom-revision.service.test.ts`. **Sisa:** routing/work-center multi-level BOM, fitment per konfigurasi kendaraan (VEH-07), dan change-order pelanggan (SAL-06/SAL-14) belum termasuk.
- **G3 — HPP non-material (P1) — DIPERBAIKI (7 Okt 2026).** Model `ProductionCost` menambahkan baris biaya non-material (kategori `labor`/`machine`/`overhead`/`subcontract`/`service`/`other`) yang digulirkan ke `ProductionOrder.totalActualCost`, sehingga HPP = material (existing) + tenaga kerja + overhead + mesin + subkontrak (PRD FAB-06/07/08/09). `applyProductionCostDelta()` menjaga gulir tepat (hanya delta non-material yang diterapkan, tidak menghitung ulang porsi material) dan mengunci baris order (`SELECT ... FOR UPDATE`) agar tidak balapan dengan `issueMaterial`. Jalur tenaga kerja mendukung entri manual (jam × tarif → jumlah) **dan** tarik dari timesheet proyek (`pullLaborCostFromTimesheets`, snapshot tarif per baris, idempoten via `sourceTimesheetId`). UI: seksi "Biaya Non-Material" pada detail perintah produksi (tambah/hapus + tombol tarik timesheet). Izin `manage_production_costs`. Aksi `createProductionCost`/`updateProductionCost`/`deleteProductionCost`/`pullLaborCostFromTimesheets`; tolak biaya setelah order `completed`/`cancelled`. Migrasi: `prisma/migrations/20261007200000_add_production_costs/`. Test: `src/actions/__tests__/production-cost.test.ts` + `src/lib/services/__tests__/production-cost.service.test.ts` (16 kasus). **Sisa:** alokasi overhead berbasis driver/SKF otomatis (FAB-07), WIP parsial per ekuivalen (FAB-09), dan applied vs actual overhead absorption (under/over) belum termasuk.
- **G4 — Biaya jasa/subkontrak (P1) — DIPERBAIKI (7 Okt 2026).** Biaya jasa/subkontrak kini masuk HPP pekerjaan melalui baris `ProductionCost` kategori `subcontract`/`service` yang ditautkan ke perintah produksi (dan opsional ke perintah kerja + pemasok + no. referensi tagihan) — menutup celah lama di mana item jasa hanya tercatat sebagai catatan Work Order dan tidak pernah masuk biaya. **Sisa:** penautan otomatis ke PO jasa (PUR-17) dan GRN jasa belum termasuk.
- **G5 — Genealogi produk (P2).** Tidak ada relasi unit hasil → material/serial/operator yang dipakai.
- **G6 — Harga beli multi-sumber dengan landed cost per pembelian (P2).** Landed cost sudah ada (`landed-cost.service.ts` + tes), tetapi analisis "harga listing vs biaya perolehan efektif antar toko" belum terlihat sebagai laporan.

*(Gap-gap ini sudah sebagian tercatat di `docs/audit-gap-erp-fabrikasi-offroad.md`; bagian ini menegaskan statusnya sebagai kebutuhan PRD, bukan regresi.)*

---

## 5. Catatan Positif (Sudah Aman)

Agar tidak salah baca sebagai kelemahan menyeluruh, jalur berikut **sudah terlindungi**:

- `consumeFifoLayers` mengunci layer (`FOR UPDATE`) dan menolak shortfall kecuali diminta.
- Idempotensi hook stok (`findFirst` StockMove per `referenceType/referenceId`).
- Over-receipt guard GR kumulatif + multi-UoM (PCS→BOX), dengan lock baris PO.
- Period lock pada GR, material issue, transfer, retur, dan penjualan.
- Klaim atomik pada `confirmProductionOrder`, `completeWorkOrder`, `confirmVendorBill`, `voidSalesInvoice`, `confirmDownPayment`, dan transfer/adjustment.
- Multi-UoM dikonversi ke unit dasar pada GR dan penjualan menjaga GL = subledger.
- `deleteGoodsReceipt` membersihkan StockMove, layer, dan `ItemSerial` terkait.

---

## 6. Rekomendasi Urutan Penanganan

Semua bug perilaku (B1, B2, B3, B4) dan risiko teknis (R1, R2) **sudah diperbaiki** pada 7 Oktober 2026 beserta regression test. Sisa item:

1. **R4** — keputusan owner soal menyelesaikan WO langsung dari `pending`.
2. **Deploy produksi** — jalankan `prisma migrate deploy` untuk 3 migrasi baru (material issue serial, purchase return serial, dan migrasi terkait lain). DB Docker `silengkap_dev_db` sudah dimigrasikan; DB produksi belum.
3. **G1/G2/G3/G4** — roadmap PRD, di luar perbaikan bug.

Setiap perbaikan bug mengikuti aturan repo: **sertakan regression test** (`src/**/__tests__/*.test.ts`) dan jalankan `npm run ci:quick` dengan `TZ=Asia/Jakarta`.
