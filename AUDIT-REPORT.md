# Laporan Audit Bug & Dead Code — Silengkap / YaraERP

Ringkasan lengkap audit bug + dead code pada ERP fabrikasi off-road
(Next.js 15 · TypeScript · Prisma · MariaDB). Semua perbaikan sudah di-commit
di branch `main`. Perubahan WIP asing (~136 file: migrasi `@/lib/table` /
`ErpColumnDef`, `@daypicker/react`, `APPROVAL_REFERENCE_PERMISSIONS`, fitur
serial/batch transfer, `uom-options.ts`) **tidak disentuh dan tidak di-stage**.

- **Baseline commit sesi:** `c67654c5`
- **Total tes:** 3067 lulus · 1 gagal (asing, lihat "Sisa Kegagalan")
- **`tsc --noEmit`:** 0 error
- **`eslint .`:** 0 error (33 warning pra-eksisting)
- **`next build`:** sukses

---

## Daftar Commit Sesi

| Commit | Ringkasan |
| --- | --- |
| `16d3cb44` | fix: jatah cuti (tenure per tahun lapor + klip rentang) & batas tanggal lembur |
| `d50ae912` | fix: biaya rework NCR tak tereset & update PO cek status di dalam transaksi |
| `c11cc7b2` | fix: aset — pelepasan harus via aksi, GL disposal gagal-tertutup, transfer back-date |
| `8b1b2f47` | fix: simetri create/update retur beli, guard edit GR, deskripsi baris penjualan |
| `b4fcbec4` | fix: gaji — net salary tak boleh negatif & angsuran pinjaman dibatasi server |
| `d370295a` | chore: hapus kode mati (hook work-order legacy, metode & simbol tak terpakai) |
| `fb8e0e7e` | test: regresi pembalikan jurnal DP saat quotation dihapus |
| `445994bc` | fix: preservasi field saat edit, guard hapus, gate aset, stok/notifikasi, cron |
| `5dacaa8e` | fix: cron notifikasi harian laporkan jumlah PENUH, bukan sampel |
| `0eceeb3c` | test: sesuaikan mock cron notifikasi harian dengan count penuh |
| `e51da338` | test: buang destructure mati di tes aset (redirectMock/assertApprovedMock) |
| `a06a211d` | chore: buang ekspor mati clientEnv/ClientEnv (jaga efek samping validasi) |

---

## 1. Perbaikan Bug

### 1.1 SDM / Cuti (`16d3cb44`)
- **`getLeaveQuota` menilai `eligible`/`tenureMonths` dari waktu dinding (`now`)**, bukan dari argumen `year` yang dilaporkan. Akibatnya `cuti/saldo?tahun=2024` memberi 12 hari ke karyawan yang belum 1 tahun pada 2024, dan menolak yang sudah. → Tenure kini dinilai per akhir tahun laporan (atau `now` bila tahun laporan = tahun berjalan).
- **Gate jatah cuti** menghitung `requestedDays` dari rentang penuh, sedangkan `used` mengklip per tahun. Cuti lintas Des→Jan ditagih penuh ke tahun mulai → cuti akhir tahun yang sah ditolak. → `requestedDays` kini diklip ke tahun kuota (create + update).
- **Query lembur & apresiasi** memakai `lte: endDate` (batas tertutup) padahal tanggal disimpan UTC-midnight → baris ber-komponen waktu bisa hilang. → Disamakan ke `endOfUtcDayExclusive` di jalur tunggal dan bulk.

### 1.2 Produksi / QC (`d50ae912`)
- **NCR `reworkCost` tereset 0**: form resolve mengosongkan input (default `"0"`) dan tidak pernah diisi nilai tersimpan; `resolveNonconformance` menulis `reworkCost: v.reworkCost` (schema default 0) pada **setiap** perubahan status → biaya rework yang sudah masuk HPP dibalik keluar (WIP dikredit / HPP kurang saji). → Form diisi nilai tersimpan; action mempertahankan nilai tersimpan bila field tak dikirim.
- **`updateProductionOrder` TOCTOU**: status draft/pending diperiksa di luar transaksi, lalu material dihapus + ditulis ulang tanpa cek ulang. Bila pesanan dilepas ke produksi di antara baca & tulis, material nyata terhapus. → Transaksi mengunci baris (`FOR UPDATE`) dan memeriksa ulang status sebelum menulis.

### 1.3 Penjualan / Pembelian (`8b1b2f47`)
- **`updatePurchaseReturn` tanpa faktor UoM**: create mengalikan cost base × faktor; update tidak. Untuk item multi-UoM, edit retur (tanpa ubah qty) memposting jurnal pembebasan Hutang faktor× terlalu kecil → create vs edit identik menghasilkan GL berbeda. → Update memakai faktor yang sama dengan create.
- **`updateGoodsReceipt`** hanya memverifikasi GR draft; tidak memeriksa status PO (bisa dipindah ke PO draft/cancelled) maupun keanggotaan item pada PO → stok tak dipesan diterima. → Kini mengunci PO + menerapkan guard status & keanggotaan yang sama dengan create.
- **`updateSalesOrder`/`updateSalesInvoice`** menulis `description: null` pada tiap baris → deskripsi yang diisi saat create hilang saat edit pertama. → Diteruskan bila payload mengirimnya.

### 1.4 Aset Tetap (`c11cc7b2`)
- **`updateAsset` boleh menandai `disposed`** tanpa aksi `disposeAsset`: nilai buku tetap, GL tak dibalik, cron penyusutan berhenti. → Transisi ke `disposed` ditolak; opsi "Dilepas" dihapus dari form ubah.
- **`disposeAsset`** melewati jurnal diam-diam bila akun disposal tak lengkap padahal aset sudah di-claim & di-nolkan. → Bila ada jurnal akuisisi, akun disposal yang kurang membuat transaksi gagal-tertutup (throw → rollback).
- **`createAssetTransfer` back-date** mengembalikan lokasi aset ke tujuan lama. → Lokasi dihitung ulang dari transfer terbaru (tanggal, id).
- **Cron penyusutan**: kebijakan "menyusutkan penuh di bulan perolehan" didokumentasikan eksplisit.

### 1.5 Penggajian (`b4fcbec4`)
- **`netSalary` bisa negatif**: potongan (absen sebulan penuh + BPJS/PPh21 + denda) bisa melebihi gross; net negatif membuat `onPayrollPaid` mengkredit Bank negatif. → Di-floor ke 0 di ketiga jalur tulis + clamp defensif di `onPayrollPaid`.
- **`loanDeduction` dipercaya dari klien**: menandai `loanDeduction` penuh ke Piutang Karyawan sementara pinjaman hanya berkurang `min(angsuran, sisa)` → piutang bisa negatif. → Dibatasi server-side ke Σ min(angsuran, sisa).

### 1.6 Master / CRM / Aset / Stok / Cron (`445994bc`)
- **`updateTax`** memaksa `isInclusive`/`isCompound` = false (form ubah hanya merender name+rate) → pajak inklusif/compound turun diam-diam. → Dipertahankan bila field tak dikirim (kelas sama dengan perbaikan `account.normalBalance`/`itemCategory.parentId`).
- **`createTax`/`updateTax`** tidak membatasi `rate` → nilai negatif / >100. → Clamp 0..100.
- **`deleteItemCategory`** hapus keras tanpa guard; `items.category_id` & `item_categories.parent_id` ON DELETE SET NULL → barang kehilangan kategori, sub-kategori jadi root. → Menolak bila masih ada sub-kategori/barang.
- **`deleteDepartment`** hanya menjaga karyawan; `positions.department_id` ON DELETE SET NULL → jabatan terlepas. → Menolak bila masih ada jabatan.
- **`convertLead`** hanya butuh `edit_leads` tanpa cek kepemilikan (beda dari `updateLead`). → Menolak bila lead bukan miliknya (kecuali `manage_leads`/super_admin).
- **Gate approval Aset fail-open**: `disposeAsset` memanggil `assertApproved("Asset", …)` tapi tak ada kode memanggil `requestApprovalIfConfigured("Asset", …)`. → `createAsset` meminta approval; "Asset" ditambahkan ke `APPROVAL_MODEL_TYPES`.
- **Notifikasi stok menipis via `setTimeout` di dalam transaksi** (mengabaikan commit/rollback, promise tak di-await, tak idempoten). → Kandidat dikumpulkan di dalam tx, dikirim (await, error-safe) setelah commit via `checkAndNotifyLowStockBatch`.
- **Cron overdue-invoice menghitung faktur CANCELLED** (status "cancelled" ≠ "paid") → angka piutang & alert salah. → Mengecualikan cancelled.
- **`ALLOWED_CRON_TASKS`** (UI) tak memuat `recover-stuck-reversals` → operator tak bisa memicu pemulihan manual. → Ditambahkan.

### 1.7 Cron Notifikasi Harian (`5dacaa8e`)
- Query low-stock (LIMIT 20) & overdue (take: 20) melaporkan `length` sebagai angka judul → toko dengan 200 item menipis hanya melihat "20 Barang Stok Menipis". → Angka judul memakai COUNT penuh; daftar sampel tetap dibatasi.

---

## 2. Dead Code yang Dihapus

| Item | Keterangan |
| --- | --- |
| `src/lib/hooks/work-order.hook.ts` | Observer-pattern legacy; `onWorkOrderCompleted` tak pernah dipanggil dari kode produksi (digantikan alur ProductionOrder). |
| `stockJournalService.onWorkOrderCompleted` | Hanya dipanggil oleh hook di atas. |
| `resolveActiveChecklist` (qc.service) | 0 referensi. |
| `NON_MATERIAL_CATEGORIES` (production-cost.service) | 0 referensi. |
| `ACTION_LABELS` (auth/modules) | 0 referensi. |
| `clientEnv` / `ClientEnv` (env.ts) | 0 referensi; efek samping validasi tetap dijaga (`void validateClientEnv()`). |
| `calculateStandardCost` | Sebelumnya tak terjangkau → dipasang tombol "Hitung Ulang HPP Standar" di halaman detail produk. |

---

## 3. Keputusan Desain Penting

- **Mesin approval hanya mengubah status dokumen**; efek domain lewat aksi peran (`approveExpense`, `approveOvertime`, dst.) atau hook domain pada route workflow — bukan `StatusActions` generik.
- **Reversal journal** bertanggal `transactionDate` asli, filter tetap `POSTED+REVERSED`.
- **INVARIANT integritas stok**: `InventoryLayer.remaining` (FIFO) vs `Item.qtyOnHand` (global); laporan Rekonsiliasi Stok memunculkan divergensi.
- **Akun kas** diidentifikasi lewat pemetaan terkonfigurasi, bukan `code startsWith "1-1"`.
- **Logika laporan** dideligasikan ke `computeIncomeStatement` kanonik; helper murni di `src/lib/finance/` & `src/lib/inventory/` dengan unit test.
- **Precedence akun GL aset**: pemetaan per-kategori → `SystemSetting` global → env var (upaya terakhir).
- **Biaya produksi non-material → WIP** (Dr WIP / Cr akun absorpsi), reuse `materialExpenseAccountId` → `materialIssueExpenseAccountId` → `cogs`; gagal-tertutup bila kosong.
- **Retur penjualan tanpa faktur**: posting kaki inventori/biaya saja, lewati harga/AR.
- **Batas tanggal setengah-terbuka** (`lt: endOfUtcDayExclusive(endDate)`) untuk field ber-kunci UTC-midnight (absensi/lembur/apresiasi).

---

## 4. Sisa Kegagalan (Bukan Milik Sesi Ini)

`src/lib/utils/__tests__/uom-options.test.ts` → `"does not duplicate the saved unit when the master still lists it"`
(mengharap label `"BOX — Box"`, implementasi mengembalikan `"BOX"`).

Kedua file (`uom-options.ts` + tesnya) adalah **WIP asing yang belum di-track** —
sengaja tidak disentuh.

---

## 5. Batasan / TODO Lingkungan

- DB produksi butuh `prisma migrate deploy` (~31 migrasi, termasuk pemetaan penyusutan); DB dev **tanpa** `_prisma_migrations`.
- `prisma/seed.ts` full run menggantung di Docker DB → seed via `seed-modules.ts` + SQL langsung.
- `prisma generate` di container butuh `-u root`; restart app setelahnya.
- Produksi harus mengonfigurasi pemetaan akun via UI (termasuk WIP + akun absorpsi) atau cross-posting gagal dengan suara.

---

## 6. Lanjutan Sesi (P2/P3 + perbaikan lingkungan)

### 6.1 Sumber tunggal identitas unit kendaraan (`c24ece8c`)
- `Vehicle` = unit fisik (satu baris per plat) menunjuk katalog merek/model/varian;
  `CustomerVehicle` hanya tautan kepemilikan. Kolom `license_plate`/`year`/`color`
  yang terduplikasi di `CustomerVehicle` **dihapus**; migrasi menyalin nilainya ke
  `vehicles` (hanya bila sisi Vehicle NULL) sebelum drop. ~15 pembaca dialihkan
  ke `customerVehicle.vehicle`.
- Aksi create/update menulis identitas **hanya** ke Vehicle, termasuk jalur
  relink ke Vehicle yang sudah ada (sebelumnya diam-diam membuang hasil edit).

### 6.2 Registri kendaraan pelanggan lintas-pelanggan (`c24ece8c`)
- Halaman baru `/kendaraan/pelanggan`: pencarian server-side by plat, rangka,
  mesin, model/varian, dan nama pelanggan; entri navigasi di grup Kendaraan.

### 6.3 DB dev disamakan + baseline migrasi (tidak ada commit kode)
- `prisma migrate diff` mengungkap drift kecil (FK yang hilang, rename index,
  tipe kolom) karena DB dev dibangun via `db push` di skema lama. Drift diterapkan
  → DB dev **identik** dengan `schema.prisma` (diff 0 statement).
- `_prisma_migrations` di-baseline dengan `migrate resolve --applied` untuk 31
  migrasi → `prisma migrate status` = "Database schema is up to date!". Jalur
  `prisma migrate deploy` produksi kini tervalidasi.

### 6.4 Seed tak lagi "menggantung" — ternyata bug destructure (`1c3c74bb`)
- Akar masalah "seed menggantung": `const [existing] = await conn.query("SELECT id
  FROM unit_of_measures ...")` lalu `existing.length`. Driver `mariadb`
  mengembalikan **array baris** (bukan `[rows, fields]`), jadi `existing` = baris
  pertama → `undefined` saat SELECT kosong → `TypeError` menghentikan seluruh
  seed. Diperbaiki (pakai array baris, sesuai pola cek lain di file).
- Guard regresi statis di `permission-seed-parity.test.ts` menolak pola
  `[row] = await conn.query(...)` + `row.length`.
- `scripts/seed.ts` kini berjalan sampai "🎉 Seeding completed!".

### 6.5 Skrip scratch/codemod dibersihkan (`1c3c74bb`)
- Hapus diagnostik ad-hoc (`check-*`, `diag-*`, `tmp-*`) dan codemod yang sudah
  selesai (`add-breadcrumbs`, `add_tests`, `find-target-coverage`, `migrate-css`,
  `migrate-table-wrappers`, `refactor-errors`). `.gitignore` kini pola.

### 6.6 E2E kendaraan diperbaiki + spec registri (`9cdbc40b`)
- `vehicle-crud.spec.ts` mati sejak upgrade `lucide-react`: selector
  `svg.lucide-trash2` tak pernah match (lucide ≥ 1.53 memakai
  `lucide-<kebab-name>`, jadi `lucide-trash-2`). Dialihkan ke accessible name.
- Plat yang dihasilkan selalu `D-0-0E2E` (slice `-retry-parallelIndex`), sehingga
  assert akhir mencocokkan baris sisa run lama. Kini suffix unik per run.
- Spec baru `customer-vehicle-registry.spec.ts` memverifikasi `/kendaraan/pelanggan`
  (list + cari plat/rangka) — bukti E2E untuk 6.1 & 6.2.

### 6.7 Fixture QC + seed E2E (`cb5e8e27`)
- `e2e/crud-surface.spec.ts` menemukan sendiri semua rute `*/tambah` dan
  menuntut form terlihat. `/produksi/qc/inspeksi/tambah` hanya merender
  `QcInspectionForm` bila ada checklist **released**; jika tidak, ia menampilkan
  empty state yang sah. Tidak ada seed yang membuat checklist → rute ini **gagal
  di setiap lingkungan** sejak modul QC mendarat (`693390ee`), laten di CI.
- `scripts/seed-remaining-e2e.ts` (sudah dijalankan CI sebelum shard E2E) kini
  men-seed satu checklist released `E2E-QC-01` + 2 item secara idempoten.

### 6.8 Quick-add master data dari dalam select (`c69a4a79`, fitur)
- Masalah: saat membuat pelanggan, kategori yang belum ada (mis. "DP 20%")
  memaksa keluar form → buka `/master/kategori-pelanggan/tambah` → kembali dan
  isi ulang.
- `Combobox` kini punya prop opsional `onCreateNew(search)`: menampilkan baris
  "＋ Tambah baru..." di bawah opsi dan mengirim kata kunci pencarian untuk
  prefill. **Opt-in** — 87 pemakaian lain tak berubah (`CommandEmpty` tetap).
- Diterapkan ke **Kategori Pelanggan** di form Pelanggan: baris itu membuka
  dialog berisi field entitas sendiri (nama + DP %), memanggil
  `createCustomerCategory`, lalu menambahkan opsi hasil `{id,name}` ke list lokal
  dan memilihnya — tanpa reload, tanpa kehilangan isian. Form dialog diletakkan
  **di luar** `<form>` pelanggan agar tidak nested.
- Spec E2E `customer-category-quick-add.spec.ts` menguji alur penuh + teardown.

**Status akhir:** 3071 unit test lulus, `tsc` 0 error, `eslint` 0 error (33 warning
pra-eksisting), `next build` sukses, E2E chromium **411 hijau** + quick-add,
seluruh halaman laporan render tanpa kegagalan.

### 6.9 Quick-add digulir ke seluruh modul (registry-driven)
- Komponen generik `src/components/ui/quick-add-select.tsx` (`QuickAddSelect`):
  Combobox + dialog yang dirender dari daftar field deklaratif; setelah aksi
  server sukses memanggil `onCreated({ id, label })` sehingga pemanggil
  menambahkan opsi baru dan memilihnya. Menambahkan `__quickAdd=1` ke FormData
  agar aksi yang biasanya `redirect()` (`createTax`, `createBrand`) tetap
  mengembalikan `{ success, id }` bila dipanggil inline.
- Registry `src/lib/quick-add/registry.ts` mendefinisikan 17 entitas: kategori
  pelanggan & barang, satuan, gudang, vendor, departemen, jabatan, bank, syarat
  pembayaran, metode pembayaran/pengiriman, pajak, pusat biaya, merek, pelanggan,
  karyawan, akun (judul + field wajib + aksi server).
- Diterapkan ke **~45 form**: transaksi penjualan/pembelian/inventaris, HR
  (karyawan, cuti, lembur, penggajian, timesheet, pinjaman), keuangan (jurnal,
  anggaran, kas kecil, pengeluaran, pembayaran), proyek, aset, QC, serta master
  (rak, merek, produk, item). Form pelanggan ikut dimigrasikan dari pola
  hand-rolled ke registry ini.
- **Sengaja tidak dikonversi**: picker bernilai `code` (metode pembayaran/
  pengiriman — id tidak bisa dipakai), picker nomor dokumen (SO/PO/PR/faktur),
  item/SKU, merek/model/varian kendaraan (tabel berbeda dari merek produk),
  user/proyek/tugas/aset, enum statis, dan filter laporan read-only.
- Regression guard: `src/lib/quick-add/__tests__/registry.test.ts` (52 kasus)
  memastikan tiap entri punya judul, aksi, field `name` wajib, dan opsi default
  untuk tiap field `select`.

**Status akhir:** 3123 unit test lulus (207→208 file), `tsc` 0 error, `eslint`
0 error, `next build` sukses, E2E chromium 412+ hijau.

