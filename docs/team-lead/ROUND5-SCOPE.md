# Round 5 — Audit Permission / Data Scope / Soft-delete

READ-ONLY. Tidak ada file produk diubah. Baseline duplikasi: `BUGHUNT-2026-10-30-round3.md` (round 3/4), `ROUND5-REPORTS.md`, `ROUND5-FINHR.md`. Setup/auth by-design dan daftar-B dokumen draft sengaja tidak diulang.

Ringkasan severity: HIGH 0 · MED 3 · LOW 1 · PLAUSIBLE 2

---

## 1. MED · CONFIRMED — Warehouse scope tidak diterapkan di 6 halaman daftar dokumen gudang

- Lokasi:
  - `src/app/(dashboard)/inventaris/pengeluaran-material/page.tsx:25,41` (`view_material_issues`, `materialIssue.findMany/count`, `where` hanya search+status)
  - `src/app/(dashboard)/inventaris/penyesuaian/page.tsx:25,41` (`view_stock_adjustments`)
  - `src/app/(dashboard)/inventaris/transfer/page.tsx:27,44` (`view_inventory_transfers`, tanpa filter source/destination)
  - `src/app/(dashboard)/pembelian/penerimaan/page.tsx:25,41` (`view_goods_receipts`)
  - `src/app/(dashboard)/inventaris/mutasi-stok/page.tsx:25,43` (`view_stock_moves`)
  - `src/app/(dashboard)/inventaris/opname/sesi/page.tsx:36,60` (`view_stock_opname`, `take: 50` semua sesi)
- Jalur pemanggilan: keenam page di atas, langsung dari nav inventaris/pembelian.
- Bukti: tidak ada `getWarehouseScope` di file mana pun. Kontras internal kuat: detail+edit dokumen yang sama dijaga `canViewWarehouseScopedDocument` (`src/lib/auth/document-scope.ts`, dikunci `src/__tests__/document-page-scope.test.ts`), action tulis memakai `assertWarehouseAccess`, laporan mutasi/kartu/valuasi memakai `warehouseScopeWhere` (`src/lib/reports/stock-flow-data.ts`). `WAREHOUSE_ALL_ACCESS_ROLES` hanya `super_admin`+`admin` (`src/lib/auth/role-names.ts`), jadi user gudang assigned memang ada dan memang dibatasi di tempat lain.
- Skenario bocor: staf Gudang A (assigned A saja, punya `view_material_issues`) buka `/inventaris/pengeluaran-material` → nomor dokumen, gudang, item semua gudang tampil. Klik detail tertolak — tapi daftar sendiri sudah bocor (dokumen, qty via include items, status).
- Fix terkecil: per page, `const scope = await getWarehouseScope(user)`; assigned → tambah `warehouseId: { in: scope.warehouseIds }` (transfer: `OR` source/destination in scope; none → `in: []`). Pola jadi: `src/app/(dashboard)/laporan/mutasi-stok/[[...segments]]/page.tsx`.
- Regression test: test loader/page dengan user assigned [A] assert query tak mengembalikan dokumen gudang B; atau static guard baru `document-list-page-scope.test.ts` sejajar `document-page-scope.test.ts`.

## 2. MED · CONFIRMED — Laporan stok selain mutasi/valuasi/kartu tidak meneruskan warehouse scope (web + PDF)

- Lokasi: `src/lib/reports/report-registry.ts:513` (`penghitungan-stok`), `:625` (`transfer-terkirim`), `:685` (`stok-minimum`), `:897` (`umur-stok`); `src/app/api/pdf/route.ts` hanya menghitung scope untuk `mutasi-stok|valuasi-stok|kartu-stok`.
- Loader tanpa parameter scope: `loadStockCount` (`src/lib/reports/stock-count-data.ts`), `loadTransferInTransit` (`transfer-in-transit-data.ts`), `loadMinStock` (`min-stock-data.ts`, termasuk `warehouseShortages` semua gudang), `loadSerialBatchStock` (`serial-batch-stock-data.ts`, `warehouseId: null` → semua gudang).
- Jalur pemanggilan: page `/laporan/penghitungan-stok`, `/laporan/transfer-terkirim`, `/laporan/stok-minimum`, `/laporan/nomor-seri-batch`, `/laporan/umur-stok` (hanya `requirePermission("view_reports")`) + PDF via registry key sama.
- Bukti: registry hanya meneruskan `warehouseScope` ke 3 loader stok; loader lain tak menerima user/scope sama sekali. Loader yang benar (`loadStockMovements`, `loadStockValuation`, `loadStockCard`) membuktikan pola penegakan memang dimaksudkan per gudang.
- Skenario bocor: user assigned Gudang A dengan `view_reports` unduh PDF `transfer-terkirim` → nama gudang asal/tujuan, qty sisa, nilai stok semua gudang. `stok-minimum` membocorkan kekurangan per gudang; `nomor-seri-batch` membocorkan serial/batch semua gudang.
- Fix terkecil: samakan pola 3 laporan yang sudah benar — registry terima `warehouseScope` untuk key stok di atas, loader tambah parameter `scopeWarehouseIds?` dan pakai helper `warehouseScopeWhere` yang sudah ada; route PDF hitung scope untuk semua key stok, bukan 3.
- Regression test: unit loader dengan scope [A] assert baris gudang B absen + PDF route test key `transfer-terkirim` user assigned.
- Catatan: loader dengan header penundaan eksplisit (`work-order-reservations-data.ts`, "menunggu vonis Lead") sengaja tidak dimasukkan.

## 3. MED · CONFIRMED — Setting stok per gudang bisa ditulis/dibaca lintas gudang hanya dengan permission item

- Lokasi: `src/actions/item-warehouse-setting.actions.ts:121` `setItemWarehouseMinStock`, `:178` `setItemWarehouseLeadTime`, `:232` `removeItemWarehouseLeadTime`, `:274` `removeItemWarehouseMinStock`, `:328` `listItemWarehouseSettings`. Semua hanya `requirePermission("edit_items"|"view_items")` + `assertItemAndWarehouse` (eksistensi saja); tidak ada `getWarehouseScope`/`assertWarehouseAccess`.
- Jalur pemanggilan: `src/components/items/item-warehouse-min-stock-panel.tsx:113` memanggil `setItemWarehouseMinStock(itemId, row.warehouseId, value)`; panel dirender dari halaman item. Server action tetap bisa dipanggil langsung dengan `warehouseId` gudang mana pun.
- Skenario bocor: user `edit_items` assigned Gudang A ubah min-stock/lead-time Gudang B (mengganggu alert reorder gudang lain); `listItemWarehouseSettings` mengembalikan qty per semua gudang ke pemegang `view_items` mana pun.
- Fix terkecil: sesudah `assertItemAndWarehouse`, `assertWarehouseAccess(await getWarehouseScope(user), warehouseId)`; di list, saring baris ke `scope.warehouseIds` bila assigned.
- Regression test: action test user assigned [A] → set/list gudang B tertolak/kosong.

## 4. LOW · CONFIRMED — `bulkDelete("appreciation")` lewati HR scope per baris

- Lokasi: `src/actions/bulk.actions.ts:104,129`; `src/lib/auth/bulk-delete-models.ts:137` (`appreciation: "delete_appreciations"`) dan `appreciation` tidak ada di `BULK_DELETE_REQUIRES_INDIVIDUAL:150` — padahal komentar daftar itu sendiri menyebut model SDM ditahan demi "cakupan karyawan".
- Jalur pemanggilan: `src/app/(dashboard)/sdm/apresiasi/_components/appreciation-table.tsx` menawarkan hapus massal model `appreciation` (dikunci `src/components/ui/__tests__/data-table-bulk-delete-permissions.test.tsx:158`).
- Bukti: `bulkDelete` hanya `requirePermission("delete_appreciations")` lalu `updateMany({ id: { in: ids } })` — tanpa memuat employee pemilik baris, tanpa `assertHrEmployeeAccess`. Delete tunggal apresiasi sudah diperbaiki round 3 agar scoped; jalur massal tidak.
- Skenario bocor: user `delete_appreciations` scope `self`/`department` hapus massal apresiasi karyawan di luar scope-nya.
- Fix terkecil: tambah `"appreciation"` ke `BULK_DELETE_REQUIRES_INDIVIDUAL` (satu baris, sejajar `leave`/`overtime`/`timesheet`).
- Regression test: `bulkDelete("appreciation", [id])` tertolak dengan pesan hapus-satu-per-satu; prunning daftar pengecualian test bulk-delete yang ada.

## 5. PLAUSIBLE — `getCompetencyGaps(employeeId)` tanpa HR scope

- Lokasi: `src/actions/development.actions.ts:131`. Hanya `requirePermission("view_competencies")`, memuat employee dari ID input, mengembalikan gap kompetensi karyawan itu. Action sibling (`assessEmployeeCompetency`, peserta training) sudah memakai `assertHrEmployeeAccess`.
- Jalur pemanggilan: belum ditemukan caller UI (halaman kompetensi memakai `getCompetencyGapQueue()` yang scoped). Server action terekspor tetap terpanggil dari client ber-session dengan permission itu — tapi tanpa caller terbukti, tidak dinaikkan ke CONFIRMED sesuai aturan antrean.
- Fix bila dikonfirmasi: `assertHrEmployeeAccess(await getHrScope(user), employeeId)`.

## 6. PLAUSIBLE — `getSuccessionOverview()` tanpa HR scope

- Lokasi: `src/actions/succession.actions.ts:114`, hanya `view_succession`, mengembalikan semua posisi kritis + incumbent + kandidat.
- Jalur pemanggilan: `/sdm/suksesi/page.tsx` (terbukti). Belum CONFIRMED: belum ada bukti kebijakan bahwa pemegang `view_succession` harus dibatasi per scope, beda dengan pola HR lain yang eksplisit memakai `getHrScope`. Perlu vonis Lead: overview organisasi by-design, atau saring kandidat/incumbent ke scope.

---

## Diperiksa, bersih (tidak dilaporkan)

- `src/proxy.ts`: bypass publik hanya `/api/auth|cron|health|address` + aset; `/api/address` data referensi publik tervalidasi `/^\d+$/`.
- `src/app/api/print/route.ts`: permission per tipe + `canAccessWarehouseScopedDocument`; PDF payroll digerbang `view_payroll_reports` terpisah.
- Action transisi material-request, salary-adjustment, disciplinary, contract/probation, performance: HR/warehouse scope + klaim status atomik + maker-checker utuh (helper lokal ditelusuri, bukan hanya grep body).
- Soft-delete (`src/lib/db/soft-delete.ts`): filter hanya `findMany`/`count` by-design; sapuan `findUnique`/`findFirst` di action tidak menemukan data terhapus yang lolos ke transaksi/hitung — semua tertahan `isActive`/status/guard FK. Tidak ada temuan soft-delete baru yang terbukti.
