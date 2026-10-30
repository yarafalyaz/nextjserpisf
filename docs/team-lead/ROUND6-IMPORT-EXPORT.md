# ROUND 6 — Audit Import/Export Massal + Cetak/PDF/Excel

Tanggal: 2026-10-30. Read-only; tidak ada file produksi diubah.

Cakupan dicari: impor CSV/Excel massal (upload/template/bulk create), ekspor laporan
(`src/lib/pdf/**`, `/api/pdf`, builder CSV), generator cetak dokumen
(invoice/kwitansi/surat jalan, `/api/print`), ekspor Coretax, backup/restore.

Catatan cakupan: tidak ditemukan fitur impor CSV/Excel massal user-facing. `createMany`
di repo = penulisan baris internal (jurnal, item dokumen, payroll, seed/setup), bukan
upload. Upload route yang ada = foto/avatar/attachment. Temuan di bawah = ekspor,
cetak, ekspor pajak, restore.

Anti-duplikat: tidak mengulang ROUND5-REPORTS (arus kas PDF vs layar, subledger utang,
stok minimum), ROUND5-SCOPE (6 daftar dokumen gudang, setting stok lintas gudang,
`bulkDelete` appreciation), ROUND5-STOCK STOK-01..20. R6IE-04 = sisa spesifik sesudah
perbaikan ROUND5-SCOPE-02, bukan pengulangan klaim umumnya.

Ringkasan: 9 temuan — HIGH 2, MEDIUM 5, LOW 2.

---

## R6IE-01 — PDF Penawaran mencetak rekening + identitas perusahaan lain (hardcoded)

- Severity: HIGH
- Status: CONFIRMED
- `src/lib/pdf/generator.ts:718-724` — footer default `generateQuotationPDF`:
  ```ts
  const footerText = docInfo.footerNotes || [
    "- Untuk pembayaran dapat di transfer ke",
    "Bank Central Asia (BCA)",
    "No Rekening : 4890310457",
    "Atas Nama : Rosemety Cartariandini",
    "Untuk konfirmasi Pembayaran : WA 0817-6415-303",
  ].join("\n")
  ```
- `src/lib/pdf/generator.ts:745` — blok tanda tangan selalu `doc.text("IRONSMITH FABRICATION", ...)`, bukan `company.name`.
- `src/lib/pdf/generator.ts:768` — `const sigName = docInfo.signatureName || "Wahid Achmad Fauzi"`.
- `src/app/api/print/route.ts:224-225` — route mengirim
  `settings.quotationFooterNotes || ""` dan `settings.quotationSignatureName || ""`;
  setting kosong = fallback hardcoded aktif.

Skenario gagal: tenant/instansi belum mengisi Pengaturan Penawaran → cetak penawaran
apa pun → PDF keluar ke pelanggan memuat nomor rekening BCA, nama pemilik rekening,
nomor WA, nama perusahaan, dan nama penandatangan milik pihak lain. Pelanggan bisa
transfer ke rekening salah. Test `src/lib/pdf/__tests__/generator.test.ts` mencatat
fallback ini sebagai perilaku yang diterima, bukan sebagai cacat.

Arah fix terkecil: fallback kosong → jangan gambar blok rekening/tanda tangan sama
sekali (atau ambil dari `company`); hapus string hardcoded.

## R6IE-02 — Restore database lanjut tanpa snapshot pengaman, sesudah snapshot lama di-prune

- Severity: HIGH
- Status: CONFIRMED
- `src/actions/database.actions.ts:60-70`:
  ```ts
  if (withSnapshot) {
    try {
      await pruneAutoSnapshots()
      const snap = await createBackup("autosnap")
      safetyNet = ` Snapshot otomatis: ${snap.filename}.`
    } catch {
      safetyNet = " (Snapshot otomatis gagal dibuat.)"
    }
  }
  await restoreBackup(safeFilename)
  ```
- Bukti: `pruneAutoSnapshots()` jalan sebelum snapshot baru terbukti berhasil; kegagalan
  `createBackup` hanya mengubah teks pesan, restore destruktif tetap dieksekusi.
- `src/lib/db/backup.ts` (`restoreBackup`) — restore via mysql CLI membaca file SQL;
  tidak ada staging DB / transaksi menyeluruh, jadi kegagalan di tengah file dapat
  meninggalkan DB ter-restore sebagian.

Skenario gagal: disk penuh / mysqldump gagal → snapshot lama terhapus, snapshot baru
tidak ada, restore tetap jalan dan gagal di tengah → tidak ada jalan pulang.

Arah fix terkecil: snapshot gagal → batalkan restore (fail-closed); prune hanya sesudah
snapshot baru sukses.

## R6IE-03 — CSV Antrean Penawaran tanpa guard formula injection

- Severity: MEDIUM
- Status: CONFIRMED
- `src/lib/reports/quotation-followup-export.ts:39-41`:
  ```ts
  function escapeCsvCell(cell: string): string {
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  }
  ```
- Sel dari data master yang bisa diawali karakter formula: `customerName`,
  `documentNo`, `salesEmployeeName` (`:27-36`). Tidak ada prefix tab/`'` untuk
  `= + - @ \t | %`.
- Kontras pola baku repo: `statement-csv.ts`, `withholding-certificates.ts:45`,
  `leave-balance.ts`, DOM CSV `export-buttons.tsx` semua memakai guard
  `/^[=+\-@\t|%]/`.
- Reachable: `src/app/(dashboard)/penjualan/antrean-penawaran/page.tsx:33` →
  `QuotationFollowUpExportButton`. Test existing hanya cek phone tidak bocor +
  jumlah kolom; tidak ada uji formula.

Skenario gagal: nama pelanggan `=2+5+cmd|...` atau diawali `+`/`@` → CSV dibuka di
Excel/Sheets → sel dieksekusi sebagai formula.

Arah fix terkecil: pakai `csvCell` pola baku repo.

## R6IE-04 — Scope gudang hilang di 3 key PDF stok (sisa ROUND5-SCOPE-02)

- Severity: MEDIUM
- Status: CONFIRMED
- `src/app/api/pdf/route.ts:74-82` — `STOCK_PDF_KEYS` hanya 7 key; `stok-tidak-bergerak`,
  `ringkasan-stok`, `rekonsiliasi-stok` tidak termasuk → `warehouseScope` tidak pernah
  dihitung untuk ketiganya.
- `src/lib/reports/report-registry.ts:907-934` — `stok-tidak-bergerak` `load({ search })`
  hanya teruskan `thresholdDays`; `ringkasan-stok` dan `rekonsiliasi-stok` `load()`
  tanpa argumen.
- `src/lib/reports/slow-moving-stock-data.ts:41-44` — `loadSlowMovingStock({ asOf,
  thresholdDays })`, tanpa parameter scope; query layer `remaining > 0` semua gudang.
- `src/lib/reports/stock-simple-data.ts:133` `loadStockSummary()` dan `:169`
  `loadStockReconciliation()` — tanpa parameter scope. Kontras `loadStockAging:84-92`
  di file sama sudah benar.
- Halaman web ketiga laporan ini juga tidak meneruskan scope (halaman tidak memanggil
  `getWarehouseScope`), jadi layar dan PDF sama-sama bocor — beda dengan key yang
  sudah diperbaiki ROUND5, di mana layar benar tapi PDF tertinggal.

Skenario gagal: user ter-scope gudang A membuka `/api/pdf?laporan=ringkasan-stok`
(atau stok-tidak-bergerak / rekonsiliasi-stok) → PDF memuat stok semua gudang.

Arah fix terkecil: tambah 3 key ke `STOCK_PDF_KEYS`, teruskan `warehouseScope` ke
loader, filter `warehouseId: { in: scope }` seperti `loadStockAging`.

## R6IE-05 — Cetak dokumen tanpa status: draft/batal terbit sebagai dokumen final

- Severity: MEDIUM
- Status: CONFIRMED (draft/batal) / PLAUSIBLE (soft-deleted)
- `src/app/api/print/route.ts` — semua tipe memakai `findUnique` (`:134` invoice,
  `:173` quotation, `:260` order, `:348` purchase-order, `:396` delivery-order, dst).
  Hanya `work-order` yang mengirim status (`:330` `status: doc.status`); tipe lain
  tidak memilih/mengirim status ke generator.
- `src/lib/pdf/generator.ts` — `DocumentInfo`/`buildTransactionPdf` tidak punya konsep
  status; tidak ada watermark/badge DRAFT/BATAL/void. `PrintButton`
  (`src/components/ui/print-button.tsx`) tidak menonaktifkan cetak berdasar status.
- Soft-delete: `findUnique` sengaja di luar filter extension soft-delete
  (`src/lib/db/soft-delete.ts` hanya membungkus `findMany`/`count`), jadi dokumen
  ter-soft-delete tetap tercetak lewat URL langsung bila ID diketahui dan permission
  view lolos.

Skenario gagal: faktur/penawaran/PO masih draft atau sudah dibatalkan dicetak dari
halaman detail atau URL `/api/print?tipe=invoice&id=...` → PDF tampak final, bisa
terkirim ke pelanggan/pemasok sebagai dokumen sah.

Arah fix terkecil: kirim status dari route, gambar badge/watermark non-final di
generator; tolak cetak untuk status batal/void dan `deletedAt != null`.

## R6IE-06 — Ekspor log aktivitas terpotong senyap pada 10.000 baris

- Severity: MEDIUM
- Status: CONFIRMED
- `src/app/api/activity-logs/export/route.ts:21-24` — `take: 10000`, urutan
  `createdAt desc`. Tidak ada hitungan total, tidak ada penanda terpotong di header
  CSV, nama file, atau respons. Header CSV hanya
  `"Waktu,Pengguna,Aksi,Model,ID,Deskripsi,IP\n"` (`:63`).

Skenario gagal: filter menghasilkan >10.000 log → admin menerima CSV yang tampak
lengkap, padahal log tertua hilang tanpa peringatan. Untuk log audit, kehilangan
senyap = bukti kepatuhan tidak utuh.

Arah fix terkecil: hitung total; bila terpotong, tambahkan baris penanda di CSV atau
tolak dengan pesan untuk mempersempit filter.

## R6IE-07 — Ekspor Coretax mencampur master berjalan; ekspor ulang tanpa idempotency yang ditegakkan

- Severity: MEDIUM
- Status: CONFIRMED (master berjalan) / PLAUSIBLE (dobel ekspor)
- `src/lib/tax/coretax-xml-export-data.ts:104-115` — loader membaca master kini:
  `prisma.customer.findMany` dan `prisma.item.findMany({ select: { name,
  unitOfMeasure, isService } })`.
- `:145-157` — snapshot XML memakai `buyerAddress: customer?.address`,
  `buyerEmail: customer?.email`, fallback `line.description ?? item?.name`,
  `line.uom ?? item?.unitOfMeasure`, `isService: item?.isService ?? false`. Komentar
  loader mengklaim snapshot terbekukan; kenyataannya alamat pembeli + nama/satuan/
  status jasa barang mengikuti master saat ekspor.
- `src/lib/tax/coretax-xml-export.ts:477` — `coretaxExportIdempotencyKey(...)` hanya
  membentuk string; tidak ada caller produksi yang memakai/memersistensikannya.
- `src/actions/tax-documents.actions.ts:232-238` — `exportCoretaxOutputXmlAction`
  hanya parse + load + return; tidak mencatat faktur yang sudah diekspor, tidak
  menolak ekspor ulang.

Skenario gagal: (a) alamat customer / satuan barang diubah sesudah faktur terbit →
XML Coretax berbeda dari dokumen asal, atau faktur lama tiba-tiba tertolak builder
(satuan tak terpetakan). (b) Batch sama diekspor dua kali → impor dobel di Coretax
eksternal.

Arah fix terkecil: ambil field dari snapshot TaxInvoice/SalesInvoice tersimpan;
catat hash/idempotency key per faktur dan peringatkan ekspor ulang.

## R6IE-08 — PDF Ringkasan Stok membuang layer tanpa gudang (dan beda cakupan barang dari layar)

- Severity: LOW
- Status: CONFIRMED
- `src/lib/reports/stock-simple-data.ts:141-156` — `aggregateLayersByWarehouse`
  memetakan `warehouseId ?? 0` ke key `0`, lalu loop output hanya mengiterasi
  gudang aktif terdaftar; key `0` tidak pernah dikeluarkan dan tidak masuk
  `totalQty`/`totalValue` baris `Jumlah`.
- Layar `src/app/(dashboard)/laporan/ringkasan-stok/page.tsx:54-62` — baris yatim
  yang sama justru ditampilkan sebagai `Tanpa Gudang / Lainnya`, dan KPI layar
  (`:64-71`) menjumlah semua layer. Jadi total PDF < total layar bila ada layer
  `warehouseId = null` atau gudang nonaktif/terhapus.
- Beda kedua: PDF hanya tabel per gudang; layar punya tabel per kategori + seksi
  Item Kritis yang tidak ada padanannya di `SUMMARY_COLUMNS` (`stock-simple-data.ts:126-131`).

Skenario gagal: stok yatim ada → PDF ringkasan untuk manajemen tidak cocok dengan
layar maupun valuasi; selisih tampak seperti stok hilang.

Arah fix terkecil: keluarkan baris `Tanpa Gudang / Lainnya` seperti layar dan
masukkan ke total.

## R6IE-09 — Ekspor Riwayat Harga Penawaran kehilangan catatan terpotong 50 kejadian

- Severity: LOW
- Status: CONFIRMED
- `src/lib/reports/quotation-price-history.ts:56` —
  `QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR = 50`; builder memotong kejadian per
  pasangan barang-pelanggan.
- `src/app/(dashboard)/laporan/riwayat-harga-penawaran/[[...segments]]/page.tsx:271-277`
  — layar menampilkan `PriceHistoryTruncatedNote` ("Menampilkan X dari Y kejadian
  terbaru (batas 50 kejadian per pasangan)", `price-history-shared.tsx:76-91`) di
  luar tabel.
- Halaman tanpa `pdfHref` → ekspor jatuh ke scrape DOM `[data-report-table]`
  (`src/components/reports/export-buttons.tsx`); `<p className="doc-lines">` catatan
  itu bukan tabel dan bukan `[data-report-narration]`, jadi CSV/PDF ekspor memuat
  maksimal 50 kejadian per pasangan tanpa penanda apa pun.

Skenario gagal: riwayat harga dibuka di spreadsheet → tampak lengkap, padahal
kejadian lama per pasangan sudah terpotong.

Arah fix terkecil: sisipkan baris penanda terpotong ke data ekspor, atau naikkan/
hilangkan batas untuk jalur ekspor.

---

## Dibuang (kandidat diperiksa, dinyatakan aman / tidak terbukti)

- Setup awal (`installBaseData`): satu transaksi Serializable + lock baris
  `system_settings FOR UPDATE` + hitung ulang user di dalam transaksi. Atomik, aman.
- `statement-csv.ts`, `leave-balance.ts`, `withholding-certificates.ts:44-47`: guard
  formula baku `/^[=+\-@\t|%]/` + quoting benar + BOM. Total CSV dan tabel dari input
  sama. Aman.
- Ekspor saldo cuti (`exportLeaveBalancesCsv`, `hrm.actions.ts`): `getHrScope`
  ditegakkan, filter departemen hanya menyempitkan. Aman.
- CSV antrean penawaran dari sisi filter: halaman menyaring
  `filterQuotationFollowUpQueue(allRows, mode)` sebelum `buildQuotationFollowUpCsv`.
  Filter tidak hilang (cacatnya hanya R6IE-03).
- Permission `/api/pdf` (payroll wajib `view_payroll_reports`, fail-closed) dan
  permission/scope `/api/print` (`PRINT_PERMISSION` per tipe + cek scope gudang
  dokumen): aman, konsisten dengan vonis ROUND5-SCOPE.
- Builder inti `buildCoretaxOutputXml`: fail-closed untuk arah, status batal/
  replaced, chain asal+pengganti satu batch, line-sum mismatch, satuan tak
  terpetakan, batch >100. Kelemahan hanya di loader/action sekitarnya (R6IE-07).
- Mayoritas loader PDF registry meneruskan filter halaman dengan benar (akun, pihak,
  pelanggan, gudang, barang, ambang, pembanding, costCenter, rentang tanggal) —
  hasil scan parameter halaman vs `buildReportPdfHref`. Pengecualian spesifik =
  R6IE-04.
- `take: 25` di `customer-statement-data.ts` = jejak klik tautan WhatsApp/email,
  bukan baris statement. Bukan pemotongan data.
- `take: 500` di analisis-harga-beli = opsi dropdown filter barang, bukan baris
  laporan. Bukan pemotongan ekspor.
- Stok Nomor Seri/Batch: halaman sudah menerapkan `getWarehouseScope` →
  `scopeWarehouseIds` ke loader; ekspor DOM membawa data ter-scope yang sama. Aman.
- PPh21 CSV (`pph21-export.ts:81` `csvField` tanpa guard formula untuk nama
  karyawan): laten saja — `loadPph21Export` tidak punya caller UI/action produksi
  (halaman `/laporan/pph-21` memakai `ExportButtons` PDF/DOM). Bukan temuan sampai
  builder itu dihubungkan ke permukaan unduhan.
- Cap waktu cetak `generator.ts:392` memakai zona perangkat
  (`toLocaleString("id-ID")` tanpa `timeZone`): dampak kosmetik pada stempel
  "Dicetak:", bukan angka dokumen. Dicatat, tidak dinaikkan jadi temuan.
- CSV antrean penawaran tanpa BOM (`quotation-followup-export-button.tsx`): risiko
  mojibake Excel lama saja; data tidak berubah. Tidak dinaikkan jadi temuan.
