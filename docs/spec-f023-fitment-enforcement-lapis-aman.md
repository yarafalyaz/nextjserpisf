# SPEC BOT 5 — F-2026-10-22-063-S: Fitment ditegakkan sebagai PERINGATAN di Quotation/WO (lapis aman F-2026-10-21-023)

Pemilik spec: BOT 5 (@sales-crm-hr-payroll-business-workflow). TANPA KODE.
ID induk: F-2026-10-21-023 (g) P1. ID spec ini: F-2026-10-22-063-S
(anti-duplikat terverifikasi run ini: grep backlog origin/main ea430e34 +
judul PR open (maks F-2026-10-22-062) + judul kartu kanban <48 jam —
063 bebas; F-023/024/025 belum punya kartu spec BOT 5 sesudah evaluator
merged, lihat §0).

Label bukti wajib di tiap aturan: TERVERIFIKASI-KODE (file:line di
origin/main ea430e34) / BENCHMARK (URL resmi) / USULAN / BUTUH-VONIS.

## 0. Pemilihan topik + anti-duplikat (bukti run ini)

Kandidat yang DITOLAK karena sudah selesai/terspec (TERVERIFIKASI-KODE):
- F-032 customer statement: builder+loader+halaman+kartu SUDAH merged
  (src/lib/reports/customer-statement*.ts, laporan/statement-pelanggan).
- F-037 antrean follow-up lead: builder+kartu SUDAH merged
  (src/lib/reports/lead-followups*.ts).
- F-106/F-107 termin: job-billing-* SUDAH merged.
- F-019 timesheet-WO, F-027 komponen gaji, F-026 TER, F-028 rekap PPh21:
  SUDAH merged (payroll-statutory.service.ts memuat TER PP 58/2023).
- F-035/F-036: kartu BOT 3/BOT 2 done (t_7f31967b, t_faf7d278).
- F-105 status part WO: work-order-part-status* SUDAH merged + konsumen
  di detail WO. F-103 lapis aman: quotation-revision-delta* SUDAH merged.
- F-001 permukaan margin kendaraan: anak t_6f92c0a4 dari t_13dc438c jalan.

Terpilih: **F-2026-10-21-023** — evaluator fitment merged tapi yatim.
Tidak ada PR open / kartu open berjudul F-023 (cek gh pr list + sqlite
kanban run ini). F-024 registri part terpasang SUDAH ada read-modelnya
(installed-parts*), F-025 deteksi konflik SUDAH ada
(findFitmentConflicts/loadFitmentConflicts di vehicle-fitment.service.ts,
dipakai vehicle-fitment.actions.ts) — jadi 023 satu-satunya sisa domain
(g) yang benar-benar terbuka.

## 1. Verifikasi live (TERVERIFIKASI-KODE, origin/main ea430e34)

Sudah ada:
- Evaluator murni: `evaluateFitment(db, {itemId, bomRevisionId?,
  configuration})` → {result: compatible|incompatible|unknown, ruleId,
  source, notes, reason} — aturan aktif saja, most-specific-wins,
  tie-break id terbaru (src/lib/services/vehicle-fitment.service.ts).
  Tanpa aturan cocok → unknown, ruleId null.
- `evaluateProductFitment` (per baris BOM produk) — dipakai checker
  manual di detail Product lewat vehicle-fitment.actions.ts:192,201.
  ITU SATU-SATUNYA pemanggil produksi.
- Pemanggil transaksi = 0: grep evaluateFitment|evaluateProductFitment
  di src/actions (sales/manufacturing) + src/app selain
  vehicle-fitment.actions.ts = 0. Quotation/WO terbit tanpa evaluasi.
- Konfigurasi kendaraan bisa dirakit dari master existing TANPA field
  baru: CustomerVehicle.vehicleId → Vehicle (year, vehicleVariantId) →
  VehicleVariant (vehicleModelId, drivetrain, transmission) →
  VehicleModel (vehicleBrandId). Semua FK existing di schema.prisma
  (CustomerVehicle :3864, Vehicle, VehicleVariant, VehicleModel).
- Dokumen membawa kendaraan: Quotation.customerVehicleId (schema :1206+),
  WorkOrder.customerVehicleId (schema :2624+), keduanya nullable.
- Baris: QuotationItem.itemId NULLABLE (schema :1268+; null = baris
  bebas/jasa), WorkOrderItem.itemId Int dengan konvensi itemId=0 =
  JASA/CUSTOM (komentar AUD-NEXT-07 di schema :2679+).
- Izin katalog nyata: view_quotations/create_quotations/edit_quotations
  (module-catalog.generated.ts:155-156), view_work_orders/
  create_work_orders/edit_work_orders (:253-255). TIDAK ada izin
  fitment transaksi khusus — spec ini tidak menambah izin baru.

Belum ada: helper perakitan konfigurasi dari customerVehicleId, snapshot
hasil evaluasi per baris dokumen, permukaan peringatan di detail
quotation/WO. Semua di bawah = USULAN kecuali ditandai lain.

## 2. Workflow specification

Aktor:
- Sales/admin penawaran: buat/edit Quotation (create/edit_quotations).
- Kepala bengkel/teknisi/admin produksi: buat/edit WorkOrder
  (create/edit_work_orders).
- Penonton detail: view_quotations / view_work_orders sesuai dokumen.
Bukan aktor baru. Evaluasi berjalan DI SERVER saat simpan; tidak ada
aksi "cek fitment" manual baru (checker manual existing tetap).

Dokumen masuk: Quotation/WorkOrder + customerVehicleId (boleh kosong) +
baris item. Dokumen keluar: dokumen SAMA, tetap terbit apa pun hasilnya
(lapis aman = peringatan, BUKAN blokir — BR-FIT-01). Tanpa dokumen
bisnis baru, tanpa jurnal, tanpa stok bergerak.

Alur:
W1 Simpan quotation/WO. Bila customerVehicleId kosong → evaluasi
   DILEWATI seluruhnya, tanpa snapshot
...[truncated 7626 chars]