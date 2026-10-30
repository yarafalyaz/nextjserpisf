# Round 6 — Audit Portal / Self-Service + API Routes Non-Cron

READ-ONLY. Tidak ada file produksi diubah. Baseline anti-duplikat: `BUGHUNT-2026-10-29-sore.md`, `BUGHUNT-2026-10-29-round2.md`, `BUGHUNT-2026-10-30-round3.md`, `ROUND5-SCOPE.md`, `ROUND5-REPORTS.md`, `ROUND5-FINHR.md`, `ROUND5-STOCK.md`.

## Fakta domain (tegas)

**Tidak ada portal eksternal.** Tidak ada `src/app/portal/**`, tidak ada `src/app/(public)/**`. Halaman publik hanya `src/app/(auth)/login`, `ketentuan-layanan`, `kebijakan-privasi`, dan wizard `src/app/setup` (fail-closed sesudah `isInstalled()` — `src/actions/setup.actions.ts:32,52`, race serial sudah dikunci di `src/lib/setup/install.ts:89-103`). Semua route lain dijaga `src/proxy.ts` (sesi aktif wajib).

**Self-service karyawan ADA, di dalam dashboard** (bukan portal terpisah):
- `src/app/(dashboard)/sdm/slip-gaji-saya/` (+`[slug]`) → `src/lib/reports/payslip-self-data.ts`
- `src/app/(dashboard)/sdm/pinjaman-saya/` (+`tambah`) → `createEmployeeLoan` jalur mandiri di `src/actions/hrm.actions.ts:3591`

**Route handler non-cron non-auth yang ada (17 berkas):**

| Route | Metode |
|---|---|
| `src/app/api/activity-logs/route.ts`, `activity-logs/export/route.ts` | GET |
| `src/app/api/address/route.ts` | GET (publik by-design) |
| `src/app/api/attachments/[...path]/route.ts` | GET |
| `src/app/api/backup/download/route.ts` | GET |
| `src/app/api/dashboard/notifications/route.ts` | GET |
| `src/app/api/health/route.ts` | GET (publik by-design) |
| `src/app/api/notifications/route.ts`, `notifications/[id]/read/route.ts` | GET / POST |
| `src/app/api/payroll/late-penalty/route.ts` | GET |
| `src/app/api/pdf/route.ts` | GET |
| `src/app/api/print/route.ts` | GET |
| `src/app/api/system-settings/route.ts` | GET |
| `src/app/api/upload/route.ts`, `upload/avatar`, `upload/items` | POST |
| `src/app/api/upload/attachments/route.ts`, `upload/attachments/[id]/route.ts` | POST/GET / DELETE |
| `src/app/api/vehicle-brands/route.ts`, `vehicle-models/route.ts` | GET |
| `src/app/api/workflow/[...path]/route.ts` | POST |

Ringkasan severity: HIGH 0 · MEDIUM 4 · LOW 2 — klasifikasi: CONFIRMED 5 · PLAUSIBLE 1

---

## R6PA-01 — MEDIUM · CONFIRMED — `/api/print` mengeluarkan dokumen soft-deleted (6 tipe)

- Lokasi: `src/app/api/print/route.ts:134` (invoice), `:173` (quotation), `:260` (order), `:348` (purchase-order), `:729` (vendor-bill), `:511` (vendor-payment). Semua `findUnique({ where: { id } })` polos.
- Bukti:
  ```ts
  const doc = await prisma.salesInvoice.findUnique({
    where: { id },
    include: { customer: { select: PRINT_CUSTOMER_SELECT }, items: true },
  })
  ```
- Bukti penopang: filter soft-delete global (`src/lib/db/soft-delete.ts:44-55`) **sengaja hanya membungkus `findMany`/`count`** — `findUnique` dibiarkan polos by-design. Model bertanda `deletedAt` di `prisma/schema.prisma`: `Quotation, SalesOrder, SalesInvoice, PurchaseOrder, VendorBill, VendorPayment` (6 dari 15 tipe cetak). Pola benar sudah ada di tempat lain: halaman detail memakai `resolveEntity({ fallbackWhere: { deletedAt: null } })` (`src/app/(dashboard)/penjualan/penawaran/[slug]/page.tsx:76`, `pesanan/[slug]/page.tsx:44`). `bulkDelete` menulis `deletedAt: new Date()` (`src/actions/bulk.actions.ts:164`).
- Skenario gagal konkret: faktur INV-1042 di-soft-delete (hilang dari daftar dan tidak bisa dibuka). User pemegang `view_sales_invoices` memanggil `GET /api/print?tipe=invoice&id=1042` → JSON lengkap (pelanggan, per baris, subtotal, pajak, grand total) kembali, lalu `PrintButton` membuat PDF yang tampak sah. Dokumen yang sudah "dihapus" tetap bisa dicetak dan diserahkan ke pelanggan.
- Klasifikasi: CONFIRMED (kode + batas by-design pada wrapper soft-delete). Tidak dilaporkan round 2/3/5: ROUND5-SCOPE memeriksa print hanya untuk "permission per tipe + `canAccessWarehouseScopedDocument`".
- Fix terkecil: untuk 6 model itu pakai `findFirst({ where: { id, deletedAt: null } })`. Tambah baris tes di `src/app/api/print/__tests__/route.test.ts` (mock `findUnique` saat ini selalu mengembalikan dokumen hidup).

## R6PA-02 — MEDIUM · CONFIRMED — `/api/attachments/<...path>` tetap mengunduh lampiran dokumen soft-deleted

- Lokasi: `src/app/api/attachments/[...path]/route.ts:46-54` → `src/lib/auth/attachment-permissions.ts:75`.
- Bukti:
  ```ts
  // attachment-permissions.ts:75 — cek eksistensi saja, tanpa deletedAt
  const document = await model.findUnique({ where: { id: referenceId }, select: { id: true } })
  if (!document) return false
  ```
  `canAccessAttachment` lalu hanya memeriksa permission + `canAccessWarehouseScopedDocument` (`attachment-permissions.ts:85-107`); tak satu pun menyentuh `deletedAt`. Lampiran itu sendiri (`transactionAttachment`) tidak punya kolom `deletedAt`, jadi tidak ada lapisan lain yang menahan.
- Model induk soft-deletable dalam `ATTACHMENT_MODEL` (`attachment-permissions.ts:18-47`): `sales_invoice, sales_order, quotation, purchase_order, vendor_bill, vendor_payment, journal, stock_adjustment, petty_cash, bank_statement, tax_assessment, EmployeeDisciplinaryRecord` — ditambah jalur GET daftar lampiran `src/app/api/upload/attachments/route.ts:198` yang memakai gerbang sama, sehingga daftar nama berkas + `originalName` juga tetap terbaca.
- Skenario gagal konkret: vendor bill dilampiri scan faktur pemasok (berisi NPWP + nomor rekening), lalu bill di-soft-delete. User `view_vendor_bills` meminta `/api/attachments/vendor_bill/<berkas>` → berkas tetap terunduh walau dokumen induk sudah "dihapus". Berlaku setara untuk jurnal, petty cash, dan rekod disiplin.
- Klasifikasi: CONFIRMED.
- Fix terkecil: di `canAccessAttachmentWithPermission`, tolak bila dokumen induk punya `deletedAt !== null` (muat `deletedAt: true` dalam select bila model memuat kolom itu).

## R6PA-03 — MEDIUM · CONFIRMED — PDF `rekap-borongan` membocorkan upah per teknisi ke pemegang `view_reports` saja

- Lokasi: `src/app/api/pdf/route.ts:51-57` dan `src/lib/reports/report-registry.ts:670-682`; loader `src/lib/reports/labor-recap-data.ts` (`getLaborRecap` memuat `employee: { select: { name: true } }` + `amount` per baris labor).
- Bukti:
  ```ts
  // pdf/route.ts:51 — himpunan payroll fail-closed
  const PAYROLL_PDF_KEYS = new Set(["gaji-karyawan", "pph-21", "porsi-gaji"])
  if (PAYROLL_PDF_KEYS.has(report)) { /* wajib view_payroll_reports */ }
  else if (!(await hasPermission("view_reports"))) { /* cukup view_reports */ }
  ```
  ```ts
  // report-registry.ts:670
  "rekap-borongan": { async load({ period }) {
    const result = await loadLaborRecapReport({ start: period.start, end: period.end })
  ```
  Keluaran `buildLaborRecapTable` memuat `employeeName`, jam, dan **total upah per teknisi**. Halaman web-nya pun sama longgar: `src/app/(dashboard)/laporan/rekap-borongan/[[...segments]]/page.tsx:33` hanya `requirePermission("view_reports")`. Kontras yang membuktikan ini kekeliruan, bukan kebijakan: halaman gaji memakai `loadPayrollPageContext` dengan komentar eksplisit "wajib view_payroll_reports saja (fail-closed). view_reports generik TIDAK cukup" (`src/lib/reports/payroll-page-context.ts:13-16`), dan loader gaji memuat `employee.npwp` + `baseSalary` (`payroll-reports-data.ts:36-54`).
- Skenario gagal konkret: role kustom non-Finance diberi `view_reports` (mis. untuk laporan stok/penjualan) tanpa `view_payroll_reports`. Ia membuka `/laporan/rekap-borongan/2026` atau `GET /api/pdf?laporan=rekap-borongan&periode=2026` → nama semua teknisi berikut total upah borongannya, padahal gerbang gaji/PPh21 untuk data yang sama-sama nominal upah per orang menolaknya.
- Batas dampak: whitelist seed hanya memberi `view_reports` ke `FINANCE_WHITELIST` (yang juga memegang `view_payroll_reports`); role bawaan lain (`staff`, `ga`, `admin`-whitelist, dll) tidak memegangnya. Bocor muncul pada role kustom — persis kelas yang disebut komentar gerbang PDF ("role kustom hanya-view_reports perlu grant ulang admin").
- Klasifikasi: CONFIRMED dari kode; bukan duplikat round 5 (ROUND5-REPORTS mengaudit isi/angka laporan, ROUND5-SCOPE tidak menyentuh gerbang gaji PDF selain mencatatnya benar).
- Fix terkecil: tambahkan `"rekap-borongan"` ke `PAYROLL_PDF_KEYS`, atau gerbang halamannya naik ke `view_payroll_reports`. Perlu vonis Lead: nominal borongan dianggap data gaji atau data produksi.

## R6PA-04 — MEDIUM · CONFIRMED — PDF `ringkasan-stok`, `rekonsiliasi-stok`, `stok-tidak-bergerak` tidak meneruskan warehouse scope

- Lokasi: `src/lib/reports/report-registry.ts:907` (`stok-tidak-bergerak` → `loadSlowMovingStock({ thresholdDays })` saja), `:919` (`ringkasan-stok` → `loadStockSummary()`), `:927` (`rekonsiliasi-stok` → `loadStockReconciliation()`); `src/app/api/pdf/route.ts:74-91`.
- Bukti:
  ```ts
  async load({ search }) {                       // registry:919
    const report = await loadStockSummary()      // tanpa warehouseScope
  ```
  ```ts
  // stock-simple-data.ts:133 — semua gudang aktif, tanpa saringan scope
  prisma.warehouse.findMany({ where: { isActive: true, deletedAt: null } })
  prisma.inventoryLayer.findMany({ where: { remaining: { gt: 0 } }, select: { warehouseId: true, ... } })
  ```
  `slow-moving-stock-data.ts` (`loadSlowMovingStock`) juga memuat layer semua gudang. `STOCK_PDF_KEYS` di `pdf/route.ts:74-82` memang tidak memuat ketiga key ini, dan loadernya tidak menerima parameter scope untuk diteruskan.
- Ini sisa dari temuan ROUND5-SCOPE #2 yang **sudah diperbaiki untuk 4 key lain** (`penghitungan-stok`, `transfer-terkirim`, `stok-minimum`, `umur-stok` sekarang menerima `warehouseScope` — `report-registry.ts:517,629,689,902`). Tiga key ini tidak disebut di round 5 dan belum ikut.
- Skenario gagal konkret: staf assigned Gudang A dengan `view_reports` (tanpa akses Gudang B) mengunduh PDF `ringkasan-stok` → qty dan nilai stok per gudang termasuk Gudang B. Halaman web setara juga tanpa scope: `src/app/(dashboard)/laporan/ringkasan-stok/page.tsx:20`, `rekonsiliasi-stok/page.tsx:24`, `stok-tidak-bergerak/[[...segments]]/page.tsx:33` hanya `requirePermission('view_reports')`, tanpa `getWarehouseScope`.
- Klasifikasi: CONFIRMED. Severity MEDIUM sejajar ROUND5-SCOPE #2.
- Fix terkecil: tambah ketiga key ke `STOCK_PDF_KEYS`, tambah parameter `scopeWarehouseIds?` pada ketiga loader (saring `warehouseId IN scope`, kosong = tanpa baris), teruskan dari registry, dan terapkan pola yang sama di 3 halaman web.

## R6PA-05 — LOW · CONFIRMED — Jalur manual `/api/workflow` menolak pinjaman/cuti dari status `draft`, bukan `pending`

- Lokasi: `src/app/api/workflow/[...path]/route.ts:50` (`STATUS_ALLOWED_FROM = ["pending", "draft", "sent"]`), `:269-270` (`newStatus = Status.APPROVED / Status.REJECTED`), `:343-346` (flip umum).
- Bukti:
  ```ts
  } else {
    result = await delegate.updateMany({
      where: { id, status: { in: allowedFrom } },
      data: { status: newStatus },
    })
  }
  ```
  Cabang khusus hanya ada untuk `employeeLoan` approve→`active` (`:323`) dan `OvertimeRequest` approve→`approveOvertime` (`:332`). Untuk **reject** pinjaman/cuti, dan untuk approve cuti, tidak ada klaim domain. Kontras: klaim atomik generik membatasi `LeaveRequest`/`EmployeeLoan` ke `from: ["pending"]` saja (`src/actions/approval.actions.ts:99-101`, `REJECT_CLAIMS:104-107`), dan `rejectStep` menolak di luar itu.
- Status awal dokumen: pinjaman lahir `status: "pending"` (`src/actions/hrm.actions.ts:3663`); cuti/lembur juga `pending`. Maka cela ini hanya terjangkau bila ada baris berstatus `draft`/`sent` — saat ini tidak ada penulis yang membuatnya untuk ketiga model ini.
- Skenario gagal konkret (kondisional): bila suatu saat cuti/pinjaman bisa berstatus `draft` (mis. fitur simpan-draf pengajuan), pemegang `approve_leave_requests`/`approve_loans` dapat menolak draf yang belum pernah diajukan lewat tombol status, dan pinjaman `draft` yang di-reject tidak pernah bisa dihidupkan ulang oleh klaim `pending` generik. Bukan jalur bocor data; ini divergensi kontrak status antar dua jalur persetujuan.
- Klasifikasi: CONFIRMED sebagai divergensi kode, dampak PLAUSIBLE (butuh produsen status `draft`/`sent` yang hari ini tidak ada). Dilaporkan agar penyamaan klaim tidak menunggu produsen itu lahir.
- Fix terkecil: `allowedFrom` per model — HR model hanya `["pending"]`, samakan dengan `APPROVE_CLAIMS`/`REJECT_CLAIMS`.

## R6PA-06 — LOW · PLAUSIBLE — `Employee.userId` tak unik: satu akun login bisa tertaut ke 2 karyawan, permukaan self-service mengambil yang pertama ketemu

- Lokasi: `prisma/schema.prisma` model `Employee` — `userId Int? @map("user_id")` + `@@index([userId])`, **tanpa `@unique`**.
- Bukti rantai: pemetaan self-service selalu `findFirst` tanpa urutan tentu dan tanpa penjaga keunikan:
  ```ts
  // payslip-self-data.ts:56-60 (resolveOwnEmployeeId, scope all)
  const me = await prisma.employee.findFirst({ where: { userId }, select: { id: true } })
  // hrm.actions.ts:3636-3640 (jalur mandiri createEmployeeLoan) — pola sama
  // sdm/pinjaman-saya/page.tsx & tambah/page.tsx — pola sama
  ```
  `getHrScope` (`src/lib/auth/hr-scope.ts:66`) juga `findFirst({ where: { userId } })`. Penulis tautan yang ada membuat User baru tiap kali (`master.actions.ts:1563-1577`) dan menolak bila karyawan sudah punya akun (`:1462`), jadi duplikasi tidak lahir dari jalur UI yang diaudit — tetapi tidak ada constraint DB maupun cek "user ini sudah tertaut ke karyawan lain".
- Skenario gagal konkret: data hasil impor/migrasi/`db push` manual membuat 2 baris `Employee` menunjuk `userId` yang sama. Salah satu karyawan itu membuka `/sdm/slip-gaji-saya` → server memilih baris `findFirst` yang urutannya tidak dijamin; bila yang terpilih karyawan lain, slip gaji (termasuk komponen dan PPh21) orang lain tampil sebagai "milik saya", dan pengajuan pinjaman mandiri tercatat atas karyawan yang salah.
- Klasifikasi: PLAUSIBLE — prasyaratnya data ganda yang belum terbukti ada. Nilai auditnya: satu `@unique` pada `Employee.userId` menutup seluruh kelas ini sekaligus untuk 4 permukaan.
- Fix terkecil: audit data duplikat lalu tambah `userId Int? @unique` lewat migrasi; sementara itu tambah `orderBy: { id: "asc" }` tidak menyelesaikan — constraint yang benar.

---

## Dibuang (sudah dicek, aman — jangan diaudit ulang)

- `src/app/api/notifications/route.ts` + `[id]/read/route.ts`: query ter-scope `userId` sesi, `markAsRead` memakai `updateMany({ where: { id, userId } })` atomik dan 404 menyamar untuk milik orang lain (`notification.service.ts:399`). Aman.
- `src/app/api/dashboard/notifications/route.ts`: notifikasi ter-scope sesi; total approval/antrian hanya untuk role/permission yang berhak; aktivitas hanya admin. Aman.
- `src/app/api/payroll/late-penalty/route.ts`: `view_payroll` + `assertHrEmployeeAccess` + regex ID/tanggal ketat + cap rentang 90 hari. Aman.
- `src/app/api/activity-logs/route.ts` + `export/route.ts`: `manage_settings`, `buildActivityLogWhere` tervalidasi, `oldValues/newValues` hanya jadi flag `hasChanges` (tidak membocorkan isi gaji/hash), CSV lolos injeksi formula. Aman.
- `src/app/api/backup/download/route.ts`: `manage_settings` + `isValidBackupName` allowlist + audit log wajib sebelum unduh. Aman.
- `src/app/api/system-settings/route.ts`: gerbang `view_dashboard`, hanya field identitas perusahaan + `printedBy` milik pemanggil sendiri. Aman.
- `src/app/api/vehicle-brands|vehicle-models/route.ts`: permission khusus, `parsePagination` ter-cap 500, `brandId` regex digit. Aman.
- `src/app/api/pdf/route.ts` selain R6PA-03/04: key divalidasi `isReportPdfKey`, payroll fail-closed, scope stok untuk 7 key. Aman pada bagian itu.
- `src/app/api/upload/route.ts`, `upload/avatar`, `upload/items`: CSRF, permission per kategori, `uploadToStorage` cek magic-byte + ekstensi dari MIME (anti stored-XSS), avatar hanya menulis baris user sendiri. Aman.
- `src/app/api/upload/attachments/route.ts` POST/GET: signature wajib cocok MIME, whitelist `ATTACHMENT_REFERENCE_TYPES`, `canModifyAttachment`/`canAccessAttachment` per dokumen. Aman selain warisan R6PA-02.
- `src/app/api/upload/attachments/[id]/route.ts` DELETE: hanya pengunggah + `canModifyAttachment`, hapus DB atomik `deleteMany({ id, uploadedBy })`. Aman.
- Self-service slip gaji (`payslip-self-data.ts`): `employeeId = self persis`, status final saja, scope `department`/`all` tidak memperluas, fail-closed `employeeId -1`. Aman.
- Self-service pinjaman (`hrm.actions.ts:3591` `createEmployeeLoan`): dua pintu izin, jalur mandiri dipaksa `employeeId === milik sendiri`, `assertHrEmployeeAccess` tetap jalan. Aman.
- `src/app/api/address/route.ts` dan `src/app/api/health/route.ts`: publik by-design, `kodeInduk` regex digit (anti traversal), health hanya `SELECT 1` + status rate-limit. Aman.
- `src/app/api/workflow/[...path]/route.ts` selain R6PA-05: permission dari `APPROVAL_REFERENCE_PERMISSIONS`, HR scope dicek **sebelum** mutasi di cabang workflow-aktif (perbaikan round 3 utuh), maker-checker jalur manual, klaim `updateMany` bersyarat status. Aman.
- `src/actions/setup.actions.ts` + `install.ts`: `isInstalled()` + CSRF + serialisasi `FOR UPDATE` dan hitung-ulang user di dalam transaksi. Aman.

