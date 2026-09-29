# Audit & Perbaikan RBAC — 2026-09-29

Ringkasan pekerjaan audit izin (RBAC) pada YaraERP (`silengkap`): temuan,
perbaikan, regression test, bukti verifikasi, dan sisa temuan.

- **Baseline:** `main` di `5bba12f6`; working tree memuat WIP besar yang belum
  di-commit. Pada working tree: `tsc` bersih dan 2678 unit test hijau.
- **Tip setelah pekerjaan:** `fed308d6` (pushed ke `origin/main`).
- **Verifikasi akhir:** `tsc` bersih, `eslint` bersih, **173 file / 2685 test
  lulus**.

---

## 1. Ringkasan commit

| # | Commit | Isi | Alasan |
| - | ------ | --- | ------ |
| 1 | `edbdef07` | `fix(rbac): selaraskan gate izin halaman detail/edit dengan action-nya` — 31 halaman + `updateJournal` + registry SKF | Sebagian halaman tak bisa diakses role yang berhak; sebagian lagi lolos di halaman tapi ditolak action |
| 2 | `5918d60e` | `chore: commit in-flight ERP modules (peran/modul, anggaran, SKF, dashboard per peran)` — 496 file WIP | `main` **tidak bisa di-build** karena kode yang sudah ter-commit mengimpor modul yang masih untracked |
| 3 | `fed308d6` | `fix(rbac): bersihkan izin hantu registry + selaraskan halaman aset/kendaraan/produksi` — 8 izin hantu + 12 halaman | Tombol aksi yang tak akan pernah muncul + drift izin sidebar/action |

Commit #2 bukan perbaikan bug melainkan penyelamatan kondisi build (lihat §5).

---

## 2. Kelas bug yang ditemukan

Sistem memakai satu izin per aksi. `ActionDropdown` (tombol aksi baris) dan
`requirePermission()` (halaman + server action) menyembunyikan/mengalihkan fitur
bila sesi tidak memegang izin yang diminta. Ketika kode meminta izin **X**
sementara halaman/action terkait memakai **Y**, muncul tiga gejala:

1. **Fail-closed.** Pemegang Y dialihkan keluar halaman (fitur mati), padahal
   action-nya menerima.
2. **Fail-open di lapisan halaman.** Pemegang X boleh membuka form, tetapi
   action menolak saat simpan (form yang selalu gagal).
3. **Izin hantu.** X dipakai kode/registry tetapi tidak pernah di-seed, sehingga
   tidak ada role non-super_admin yang bisa memegangnya → tombol tersembunyi
   permanen.

Karena `ActionDropdown` memakai `canEdit = superAdmin || (perm !== undefined &&
userPerms.includes(perm))`, izin `undefined` (rute tak terdaftar) atau izin hantu
sama-sama **menyembunyikan** tombol (bukan "always show" seperti yang tertulis di
komentar lama).

---

## 3. Fix #53 — drift gate halaman detail/edit

### 3.1 Dampak pada role bawaan

Role yang di-seed: `super_admin`, `admin` (ALL), `staff`, `ga`, `kepala_bengkel`,
`karyawan`, `purchasing`, `warehouse`, `finance`.

| Role | Fitur yang terpengaruh | Gejala |
| ---- | ---------------------- | ------ |
| `finance` | edit Faktur, Pembayaran, Penawaran, Retur, Uang Muka | halaman menuntut `edit_sales_orders`; finance hanya punya `edit_sales_*` → dialihkan keluar |
| `finance` | edit Tagihan, Pembayaran Vendor | halaman menuntut `edit_purchase_orders`; finance punya `edit_vendor_bills`/`edit_vendor_payments` |
| `warehouse` | detail + edit Penyesuaian, Transfer, Pengeluaran Material | halaman menuntut `view_inventory`/`edit_inventory` yang **tidak dimiliki role mana pun** |
| `warehouse` | edit Penerimaan Barang | halaman menuntut `edit_purchase_orders`; warehouse punya `edit_goods_receipts` |
| `kepala_bengkel` | edit Perintah Kerja, Perintah Produksi | halaman menuntut `edit_production` yang **tidak dimiliki role mana pun** |
| `purchasing` | form edit Penerimaan / Pembayaran Vendor | halaman membuka (`edit_purchase_orders`), action menolak (`edit_goods_receipts`/`edit_vendor_payments`) |
| semua non-admin | edit Penggajian | halaman menuntut `update_payroll` yang tak dipakai kode lain |

`edit_inventory`, `edit_production`, dan `update_payroll` tidak muncul di
whitelist role mana pun → halaman-halaman itu mati total bagi semua non-admin.

### 3.2 Halaman yang diselaraskan (31 file)

Detail memakai izin `view` milik halaman list-nya; edit memakai izin `edit` dari
`ROUTE_PERMS` (registry yang juga dipakai tombol Edit) dan server action-nya.

| Halaman | Sebelum | Sesudah |
| ------- | ------- | ------- |
| `inventaris/penyesuaian/[id]` | `view_inventory` | `view_stock_adjustments` |
| `inventaris/penyesuaian/[id]/ubah` | `edit_inventory` | `edit_stock_adjustments` |
| `inventaris/transfer/[id]` | `view_inventory` | `view_inventory_transfers` |
| `inventaris/transfer/[id]/ubah` | `edit_inventory` | `edit_inventory_transfers` |
| `inventaris/pengeluaran-material/[id]` | `view_inventory` | `view_material_issues` |
| `inventaris/pengeluaran-material/[id]/ubah` | `edit_inventory` | `edit_material_issues` |
| `inventaris/baris-rak/[id]/ubah` | `edit_inventory` | `manage_inventory` |
| `inventaris/baris-rak/tambah` | `edit_inventory` | `manage_inventory` |
| `penjualan/faktur/[id]/ubah` | `edit_sales_orders` | `edit_sales_invoices` |
| `penjualan/penawaran/[id]/ubah` | `edit_sales_orders` | `edit_quotations` |
| `penjualan/pembayaran/[id]` | `view_sales_orders` | `view_sales_payments` |
| `penjualan/pembayaran/[id]/ubah` | `edit_sales_orders` | `edit_sales_payments` |
| `penjualan/surat-jalan/[id]` | `view_sales_orders` | `view_delivery_orders` |
| `penjualan/surat-jalan/[id]/ubah` | `edit_sales_orders` | `edit_delivery_orders` |
| `penjualan/uang-muka/[id]` | `view_sales_orders` | `view_down_payments` |
| `penjualan/uang-muka/[id]/ubah` | `edit_sales_orders` | `edit_down_payments` |
| `penjualan/retur/[id]` | `view_sales_orders` | `view_sales_returns` |
| `penjualan/retur/[id]/ubah` | `edit_sales_orders` | `edit_sales_returns` |
| `pembelian/permintaan/[id]` | `view_purchase_orders` | `view_purchase_requests` |
| `pembelian/permintaan/[id]/ubah` | `edit_purchase_orders` | `edit_purchase_requests` |
| `pembelian/penerimaan/[id]` | `view_purchase_orders` | `view_goods_receipts` |
| `pembelian/penerimaan/[id]/ubah` | `edit_purchase_orders` | `edit_goods_receipts` |
| `pembelian/tagihan/[id]` | `view_purchase_orders` | `view_vendor_bills` |
| `pembelian/tagihan/[id]/ubah` | `edit_purchase_orders` | `edit_vendor_bills` |
| `pembelian/pembayaran-vendor/[id]` | `view_purchase_orders` | `view_vendor_payments` |
| `pembelian/pembayaran-vendor/[id]/ubah` | `edit_purchase_orders` | `edit_vendor_payments` |
| `pembelian/retur/[id]` | `view_purchase_orders` | `view_purchase_returns` |
| `pembelian/retur/[id]/ubah` | `edit_purchase_orders` | `edit_purchase_returns` |
| `produksi/perintah-kerja/[id]/ubah` | `edit_production` | `edit_work_orders` |
| `produksi/production-orders/[id]/ubah` | `edit_production` | `edit_production_orders` |
| `sdm/penggajian/[id]/ubah` | `update_payroll` | `edit_payroll` |

### 3.3 `updateJournal` — escalasi izin

`src/actions/finance.actions.ts` memakai `create_journals`, sedangkan halaman
edit jurnal dan `ROUTE_PERMS` menuntut `edit_journals`.

- Pemegang `create_journals` **tanpa** `edit_journals` bisa menyunting jurnal
  langsung lewat server action (escalation).
- Pemegang `edit_journals` tanpa `create_journals` gagal menyimpan.

Diubah menjadi `requirePermission("edit_journals")`.

### 3.4 Registry SKF

`ROUTE_PERMS /keuangan/angka-kunci-statistik` menunjuk `edit_statistical_key_figures`,
sementara halaman edit dan `updateStatisticalKeyFigure` memakai `edit_accounts`.
Akibatnya tombol Edit di daftar SKF tersembunyi dari akuntan yang justru berhak
membukanya. Registry diubah menjadi `edit_accounts` (Delete tetap
`delete_statistical_key_figures`, sesuai action delete-nya).

---

## 4. Fix #54 — izin hantu & drift lanjutan

### 4.1 Izin hantu (dipakai registry, tak pernah di-seed)

| Lokasi | Izin bermasalah | Keputusan |
| ------ | --------------- | --------- |
| `ROUTE_PERMS /inventaris/scan` | `edit_inventory`, `delete_inventory` | entri dihapus — hanya ada aksi lihat |
| `ROUTE_PERMS /inventaris/mutasi-stok` | `edit_stock_moves`, `delete_stock_moves` | entri dihapus — hanya ada aksi lihat |
| `ROUTE_PERMS /sdm/penggajian` | `delete_payroll` | dibuang (tidak ada `deletePayroll`) |
| `ROUTE_PERMS /keuangan/laporan-bank` | `edit_bank_statements`, `delete_bank_statements` | entri dihapus — hanya lihat + tambah |
| `ROUTE_PERMS /keuangan/rekonsiliasi-bank` | `edit_bank_reconciliation`, `delete_bank_reconciliation` | edit → `manage_bank_reconciliation` (izin halaman tambah) |
| `ATTACHMENT_WRITE_PERMISSION.bank_statement` | `edit_bank_statements` | → `create_journals` (izin `createBankStatement`) |

Pendukung: `src/app/(dashboard)/sdm/penggajian/page.tsx` tidak lagi memeriksa
`delete_payroll` saat menghitung `showActions`.

### 4.2 Drift izin halaman vs sidebar/action

| Halaman | Sebelum | Sesudah |
| ------- | ------- | ------- |
| `kendaraan/merek/page.tsx` | `view_vehicles` | `view_vehicle_brands` |
| `kendaraan/merek/[id]/page.tsx` | `view_vehicles` | `view_vehicle_brands` |
| `kendaraan/merek/tambah/page.tsx` | `view_vehicles` | `create_vehicle_brands` |
| `aset/kategori/page.tsx` | `view_assets` | `view_asset_categories` |
| `aset/merek/page.tsx` | `view_assets` | `view_asset_brands` |
| `aset/transfer/page.tsx` | `view_assets` | `view_asset_transfers` |
| `aset/kategori/tambah/page.tsx` | `create_assets` | `create_asset_categories` |
| `aset/merek/tambah/page.tsx` | `create_assets` | `create_asset_brands` |
| `aset/transfer/tambah/page.tsx` | `create_assets` | `create_asset_transfers` |
| `produksi/production-orders/page.tsx` | `view_work_orders` | `view_production` |

`kendaraan/model` tetap `view_vehicles` (memang tidak ada izin
`view_vehicle_models`; sidebar juga memakai `view_vehicles`).

### 4.3 Guard halaman client

`inventaris/scan/page.tsx` adalah komponen client sehingga tidak bisa memanggil
`requirePermission` sendiri; sebelumnya halaman itu **tanpa guard** meskipun
sidebar hanya menampilkannya dengan `view_inventory`. Guard ditambahkan di
`inventaris/scan/layout.tsx`:

```tsx
await requirePermission("view_inventory")
```

---

## 5. Commit WIP (`5918d60e`) — kenapa perlu

Saat verifikasi, ditemukan bahwa **`main` yang ter-commit sudah tidak bisa
di-build**:

```
Error: Cannot find package '@/lib/services/transaction-attachment.service'
imported from src/actions/finance.actions.ts
```

`src/actions/finance.actions.ts` (sudah ter-commit) mengimpor
`src/lib/services/transaction-attachment.service.ts` yang **masih untracked**.
Artinya working tree-lah yang membuat proyek hijau. Selain itu, pada tree HEAD
tanpa WIP, test parity baru saya gagal pada 8 halaman SDM/proyek yang
perbaikannya juga masih berupa WIP.

Keputusan: meng-commit seluruh working tree (batch fitur in-flight) agar `main`
konsisten dengan kondisi runtime yang sudah terverifikasi. File lokal/scratch/
vendor sengaja **tidak** di-commit:

- `.commandcode/skills/`, `.commandcode/settings.local.json`,
  `.commandcode/taste/workflow/`, `.mcp.json`
- `QUO.pdf`, `search_oke.ts`, `public/uploads/logos/`
- `scripts/check-*.ts`, `scripts/diag-currencies.ts`

Verifikasi commit ini dilakukan di **worktree bersih** (`git worktree add HEAD`,
tanpa file untracked lokal): `tsc` bersih, 173 file / 2682 test hijau.

---

## 6. Regression test

### 6.1 `src/__tests__/page-action-permission-parity.test.ts` (baru)

Membaca seluruh `page.tsx` di bawah `src/app/(dashboard)` dan memaku invarian:

1. **detail == list** — izin halaman detail sama dengan halaman list-nya, untuk
   modul `/penjualan`, `/pembelian`, `/inventaris`, `/produksi`, `/aset`,
   `/kendaraan`.
2. **edit == ROUTE_PERMS** — setiap halaman `[id]/ubah` memakai izin dari
   `resolveEditPerm(route)` (izin yang sama dengan action + tombol Edit).
3. **tambah == action create** — tabel eksplisit untuk
   `aset/kategori|merek|transfer/tambah` dan `kendaraan/merek/tambah`.
4. **layout client** — tabel eksplisit untuk `inventaris/scan/layout.tsx`.

Test ini juga menjaga dirinya agar tidak vakum (`checked > 20`, `PAGES > 200`).

### 6.2 `src/__tests__/permission-seed-parity.test.ts` (diperluas)

Test baru: **setiap** izin yang direferensikan `ROUTE_PERMS`,
`ATTACHMENT_PERMISSION`, dan `ATTACHMENT_WRITE_PERMISSION` wajib ada di
`prisma/seed.ts`. Ini menutup kelas "izin hantu" secara menyeluruh.

### 6.3 `src/actions/__tests__/finance.actions.test.ts` (diperluas)

`updateJournal` wajib memanggil `requirePermission("edit_journals")` dan bukan
`create_journals`.

### 6.4 Bukti RED → GREEN

- Revert `updateJournal` ke `create_journals` → test gagal
  (`expected "vi.fn()" to be called with [ 'edit_journals' ]`), dikembalikan →
  hijau.
- Kembalikan gate Faktur ke `edit_sales_orders` → test parity gagal
  (`/penjualan/faktur/ubah: page=edit_sales_orders registry=edit_sales_invoices`),
  dikembalikan → hijau.
- Kembalikan `ATTACHMENT_WRITE_PERMISSION.bank_statement` ke
  `edit_bank_statements` → test seed-parity gagal
  (`edit_bank_statements (ATTACHMENT_WRITE_PERMISSION bank_statement)`),
  dikembalikan → hijau.

---

## 7. Verifikasi

| Perintah | Hasil |
| -------- | ----- |
| `npm run typecheck` (`tsc --noEmit`) | bersih |
| `npm run lint` (`eslint`) | bersih |
| `npx vitest run` | 173 file / 2685 test lulus (baseline 2678; +7 dari Fix #53 dan #54) |
| `git worktree` @ HEAD (tanpa file untracked lokal) | tsc bersih, 173 file / 2682 test lulus |

Audit ulang setelah perbaikan (skrip ad-hoc, semuanya bersih):

- `ROUTE_PERMS` → izin yang tidak di-seed: **0** (sebelumnya 8).
- `ATTACHMENT_PERMISSION` + `ATTACHMENT_WRITE_PERMISSION` → tidak di-seed: **0**
  (sebelumnya 1).
- `bulk.actions` map permission: 59/59 ada di seed.
- detail-page vs list-page: **0 mismatch**.
- halaman `[id]/ubah` vs `ROUTE_PERMS`: **0 mismatch**.

---

## 8. Sisa temuan (belum diubah)

1. **9 halaman hub modul tanpa guard**: `/master`, `/penjualan`, `/pembelian`,
   `/inventaris`, `/produksi`, `/sdm`, `/keuangan`, `/crm`, `/laporan`. Semua
   berupa grid navigasi statis; seluruh link tujuannya sudah dijaga. Gerbang yang
   tepat adalah "punya salah satu izin modul", bukan satu izin tunggal, sehingga
   perlu helper khusus bila ingin ditutup.
2. **Komentar lama di `ActionDropdown`** menyebut rute tanpa `ROUTE_PERMS` akan
   "always show", padahal implementasinya menyembunyikan tombol. Nama/konsistensi
   komentar bisa diperbaiki agar tidak menyesatkan.
3. `ROUTE_PERMS` untuk `/inventaris/rak` memakai `create_warehouses` (bukan
   `edit_warehouses`) — konsisten dengan action `updateRack`, tetapi secara
   semantik perlu ditinjau ulang bila kelak rak dikelola lebih luas.

---

## 9. Cara mengulang audit

Audit otomatis kini melekat di test suite:

```bash
# invarian izin halaman (detail/list/edit/tambah/layout)
npx vitest run src/__tests__/page-action-permission-parity.test.ts

# paritas izin kode + registry terhadap seed
npx vitest run src/__tests__/permission-seed-parity.test.ts

# guard form "tambah" (layout)
npx vitest run src/__tests__/create-form-guards.test.ts

# regresi updateJournal
npx vitest run src/actions/__tests__/finance.actions.test.ts
```

Pipeline lengkap: `npm run ci` (lint → tsc → unit → build → E2E), jalankan dengan
`TZ=Asia/Jakarta`.
