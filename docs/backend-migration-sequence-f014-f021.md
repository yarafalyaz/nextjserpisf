# Peta Urutan Migrasi Inti Backend — F-014/F-015/F-016/F-019/F-020/F-021

Dokumen usulan (tanpa kode/migrasi). Sesuai vonis Lead-Arch 2026-10-21 12:05:
semua inti di bawah menunggu checkout pajak F-001..006 lepas dari checkout
utama + `scripts/verify-migrations.mjs` hijau di PR pajak. Urutan di bawah
meminimalkan konflik schema dan membuka nilai paling awal dengan risiko
jurnal paling rendah.

## Prinsip urutan

1. Kolom nullable/tambahan murni dulu (tanpa backfill, tanpa perubahan
   perilaku posting) — aman digabung dalam satu PR schema per ID.
2. Model baru tanpa relasi ke jurnal menyusul.
3. Apa pun yang mengubah perilaku menahan dokumen / jurnal menunggu vonis
   tertulis pemilik domain (accountant untuk uang/pajak, Lead untuk
   perilaku) — tidak digabung dengan migrasi struktural.

## Urutan usulan

| Urutan | ID | Perubahan schema | Jenis | Vonis dibutuhkan | Catatan konflik |
|---|---|---|---|---|---|
| 1 | F-2026-10-21-016 tahap 1 | `salesEmployeeId Int?` + relasi Employee di Quotation, SalesOrder, SalesInvoice (snapshot pewarisan di service, bukan migrasi data) | Kolom nullable | Tidak (tahap 1-2 lapis informatif); YA tahap 3 jurnal komisi | Sentuh model penjualan — lakukan sesudah PR pajak merge agar diff schema bersih |
| 2 | F-2026-10-21-019 | `Timesheet.workOrderId Int?` nullable; validasi salah-satu project/WO di service | Kolom nullable | Tidak | projectId saat ini wajib — ubah ke opsional bersyarat di service, bukan drop NOT NULL tanpa vonis perilaku timesheet |
| 3 | F-2026-10-21-015 | `InventoryTransferItem.receivedQty Decimal? @db.Decimal(15,2)` + status parsial di header transfer | Kolom nullable + logika receive | Tidak (kuantitas) | Selisih wajib StockAdjustment alasan "selisih transfer" + approval beda orang (pola stocktake) |
| 4 | F-2026-10-21-014 | Model baru `MaterialRequest` + `MaterialRequestItem` bila perlu banyak baris (status draft→approved→fulfilled/rejected, fulfilledTransferId) | Model baru | Tidak | Nama UI "Permintaan Antar Gudang" bedakan dari PurchaseRequest |
| 5 | F-2026-10-21-020 | Model baru `WorkOrderOperation` (tahap, urutan, status, startedAt/finishedAt, assignedEmployeeId?) | Model baru | Tidak | Bukan routing costing; tidak menjurnal; WorkCenter tetap ditunda |
| 6 | F-2026-10-21-021 tahap 1-2 | `Item.warrantyMonths Int?`, odometer snapshot CustomerVehicle, model `WarrantyCoverage`, lalu `WarrantyClaim` | Kolom + model baru | Tidak tahap 1-2; YA tahap 3 (provisi PSAK 57) | Urutan terakhir: bergantung pola coverage→claim; jurnal provisi ditahan sampai data klaim membuktikan estimasi |

F-2026-10-21-022 (tautan klaim supplier) mengikuti F-021 tahap 2, bukan
migrasi tersendiri yang berdiri dulu. F-2026-10-21-017 inti (menahan
dokumen kredit) DITOLAK Lead 12:05 — paparan read-only merged cukup;
tidak masuk antrean migrasi ini.

## Gerbang tiap PR migrasi

1. `prisma migrate diff` → review manual `migration.sql` baris per baris.
2. `MIGRATION_CHECK_URL=... node scripts/verify-migrations.mjs` hijau.
3. tsc 0, eslint file tersentuh 0, vitest terkait hijau + falsifikasi
   untuk logika non-trivial.
4. Tanpa backfill destruktif; kolom baru nullable atau default aman.
5. PR menyebut ID F-*, urutan ke-berapa di peta ini, dan vonis yang
   sudah ada (atau "tidak dibutuhkan" sesuai backlog).

## Kondisi mulai

- PR pajak F-001..006 merged dan checkout utama bersih dari folder
  migrasi pajak untracked.
- Tidak ada klaim aktif di `docs/autonomous-board.md` atas
  `prisma/schema.prisma`.
