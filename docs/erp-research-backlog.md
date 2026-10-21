# ERP Research Backlog — Silengkap (Fabrikasi Offroad)

Catatan riset read-only. Jangan dianggap spesifikasi final; angka prioritas dari analis.

---

## 2026-10-20 — Fokus: (e) penjadwalan bengkel/kapasitas + (f) garansi & after-sales

### Inventarisasi terverifikasi (2026-10-20)

Sudah ada:
- Produksi: Product/ProductMaterial, BomRevision(+Material) berversi draft→released→superseded, ProductionOrder(+Material, partial release/WIP, releasedCost, genealogy+material serial/batch), ProductionCost (labor/overhead driver/subkontrak, sourceTimesheetId, nonconformanceId, purchaseOrderId), WorkOrder(+Item) tertaut CustomerVehicle/Quotation/Project/BomRevision, MaterialIssue dari WO, QC checklist berversi + QcInspection(referenceType/referenceId) + Nonconformance (reworkCost/Hours) pemblokir serah terima, Remnant, StocktakeSession.
- Kendaraan: VehicleBrand/Model/Variant, Vehicle, CustomerVehicle (plat, chassis, engine), VehicleFitmentRule (item/BOM × brand/model/variant/tahun/drivetrain/transmisi → compatible/incompatible/unknown, most-specific-wins).
- Penjualan: Quotataion berversi + DownPayment + gate DP (PRD SAL-09), SalesOrder/Invoice/Payment/Return, DeliveryOrder.
- Pendukung jadwal parsial: Project/ProjectStage/ProjectStageProgress/Task(assignedTo Employee, start/due)/Timesheet(employee×project×task), WorkSchedule/Holiday/Attendance, kalender = tenggat dokumen keuangan (SalesInvoice/VendorBill/SO/PO/Recurring), BUKAN jadwal lantai.
- Lampiran generik: TransactionAttachment(referenceType, referenceId) + komponen transaction-attachments.tsx — dipakai keuangan/penjualan/pembelian, TIDAK dipakai di produksi/proyek/kendaraan (grep kosong).

Belum ada (bukti):
- Tidak ada model WorkCenter/Bay/Resource: `grep work_center|WorkCenter prisma/schema.prisma` = 0.
- WorkOrder tanpa field penugasan/kapasitas: hanya startDate/endDate; tidak ada assignedTo/assignee/estimatedHours/priority/workCenterId (schema baris 2278-2316). WorkOrderItem hanya item/qty/cost/status — bukan operasi/routing.
- Tidak ada model Warranty/WarrantyClaim: `grep -i warranty|garansi prisma/schema.prisma` = 0 field; satu-satunya kata "warranty" di kode = komentar di manufacturing.actions.ts:1460. CrmTicket generik (customerId nullable, tanpa customerVehicle/workOrder/invoice/serial, tanpa eligibility) — bukan klaim garansi.
- CustomerVehicle & Vehicle tanpa odometer (grep odometer|kilometer di schema = 0) → eligibility garansi berbasis km tidak mungkin.
- ProjectStageProgress hanya percentage+notes, tanpa foto; foto progres per kendaraan tidak terstruktur.

### Gap

#### P0-1 (f) Garansi & after-sales modifikasi tidak ada sama sekali
- Masalah nyata: bumper/rollcage/lift kit gagal di lapangan → klaim ditangani lisan/CRM generik; tidak bisa buktikan kendaraan/WO/serial/umur pasang, biaya rework garansi tercampur biaya produksi biasa, tidak bisa tagih balik supplier part cacat. PRD WAR-01 & MOD-12 belum terimplementasi sama sekali.
- Bukti repo: tidak ada model Warranty/WarrantyClaim/WarrantyCoverage; Item/Product tanpa field masa garansi (Item baris 557-602, Product 1912-1937); CrmTicket (3065-3097) tanpa FK kendaraan/dokumen asal.
- Referensi: klaim wajib intake → cek eligibility (periode/serial/invoice) → inspeksi/diagnosis → keputusan cover/tolak → repair/replacement → closure, terhubung WO, part, biaya. https://antmyerp.com/en/blogs/the-ultimate-guide-to-warranty-management-best-practices/ ; cakupan per item terpasang + masa berlaku per serial/invoice: https://www.xfatora.com/en/modules/warranty-management/detailed.php ; model garansi otomotif mengikat sale + lot/serial terpasang + odometer kendaraan + syarat, auto-buat record garansi saat WO selesai: https://octurasolutions.com/resources/odoo-19-for-automotive-parts-catalog-service-scheduling-and-warranty-management
- Usulan (tanpa kode): model `WarrantyCoverage` (customerVehicleId, workOrderId/salesInvoiceId, itemId, serialNumber, installedAt, expiresAt, mileageLimitKm, termsSnapshot, status) dibuat otomatis saat completeWorkOrder/serah terima dari baris terpasang; model `WarrantyClaim` (coverageId, customerVehicleId, reportedAt, odometerKm, keluhan, foto via TransactionAttachment referenceType=WarrantyClaim, status intake→eligibility→approved/rejected→in_repair→closed, decisionBy/At, resolutionType repair/replace/reject, repairWorkOrderId, supplierClaimVendorId, claimCost). Biaya klaim masuk ProductionCost kategori warranty pada WO perbaikan (Nonconformance sudah punya pola serupa) agar margin lifetime job asal terlihat. Tambah `warrantyMonths`/`warrantyKm` di Item/Product sebagai default terms. Halaman: produksi/garansi (daftar klaim + detail), kartu garansi di detail CustomerVehicle.
- Effort: L. Risiko: eligibility salah → tagih pelanggan yang harusnya cover (perselisihan); mitigasi: termsSnapshot saat pasang, keputusan manual ber-approval, jangan auto-reject. Juga tambah field odometer ke CustomerVehicle + snapshot odometer saat check-in/serah terima.
- Urutan: odometer+terms → coverage auto-create → claim CRUD+approval → biaya+link supplier claim → laporan biaya garansi per produk/kendaraan.

#### P0-2 (e) Tidak ada work center/bay, kapasitas, maupun penugasan operasi — jadwal bengkel tidak bisa dibuat
- Masalah nyata: WO hanya punya startDate/endDate bebas; dua job bisa dijanjikan selesai bersamaan di bay/las yang sama; janji tanggal ke pelanggan ditebak. Kepala bengkel tidak punya antrian per stasiun (cutting/welding/finishing/assembly) maupun beban jam vs jam tersedia.
- Bukti repo: WorkOrder (2278-2316) tanpa assignee/workCenter/estimasi jam/prioritas; tidak ada routing/operation model (WorkOrderItem = baris item, bukan operasi); kalender page.tsx:62-78 hanya menampilkan due date invoice/bill/SO/PO/recurring — nol WorkOrder/ProductionOrder; Timesheet tertaut Project/Task, bukan WO/operasi, jadi beban aktual per stasiun tidak teragregasi.
- Referensi: finite capacity butuh work center + jam tersedia per shift + routing (operasi, urutan, run/setup time) + due date, lalu load vs available dan overload terlihat per work center: https://oneplanify.com/feeds/blog/finite-capacity-planning ; langkah praktis job shop: definisikan work center & jam/shift, impor open order + routing, load per mesin, atasi overload (geser/lembur/alternatif): https://usersolutions.com/blog/job-shop-capacity-planning ; jadwal finite harus ringan & dispatch list per work center terlihat di lantai (EDD/CR), kapasitas riil = jam kalender dikurangi setup/maintenance: https://www.cleverence.com/articles/for-business/job-shop-operations-management-4729/
- Usulan bertahap (hindari APS penuh):
  1. (S) Master `WorkCenter` (nama: Potong/Las/Bubut/Finishing/Perakitan/Pasang, kapasitas jam/hari, jumlah stasiun/bay, aktif) + `WorkOrderOperation` (workOrderId, workCenterId, nama operasi, urutan, estimatedHours, plannedStart/End, assignedEmployeeId, status) dibuat dari template routing per Product/BomRevision. Prioritas + dueDate eksplisit di WorkOrder.
  2. (M) Halaman produksi/jadwal: papan beban per work center per minggu (Σ estimatedHours vs kapasitas×hari kerja dari WorkSchedule/Holiday) + daftar dispatch urut dueDate; overload ditandai, geser manual (drag/tanggal) — tanpa optimizer otomatis.
  3. (M) Hubungkan Timesheet ke WorkOrderOperation (tambah workOrderOperationId opsional) supaya aktual vs estimasi per operasi terbaca; ProductionCost labor mengambil dari sini.
- Risiko: estimasi jam awal tidak akurat → jadwal tampak presisi palsu; mitigasi: tampilkan juga aktual historis per operasi, mulai dari template kasar, kalibrasi dari timesheet. Jangan bangun solver APS (over-engineering untuk skala bengkel).
- Urutan: master+operasi → papan beban read-only → penjadwalan manual → timesheet link.

#### P1-1 (g) Foto/dokumentasi progres per kendaraan tidak terstruktur
- Masalah: TransactionAttachment generik sudah ada tapi tidak dirender di produksi/proyek/kendaraan; ProjectStageProgress (3427-3440) hanya persen+catatan. Bukti progres (bongkar→las→finishing→pasang) untuk pelanggan & pembuktian kondisi awal/akhir (PRD VEH-02A/FAB-13) tidak melekat ke tahap/WO.
- Usulan (S): pakai TransactionAttachment apa adanya (referenceType=WorkOrder/ProjectStage/CustomerVehicle) + render TransactionAttachments di detail WO & kendaraan + kolom stage pada lampiran; checklist inspeksi awal/akhir memakai QcInspection yang sudah generik (referenceType=WorkOrder) — tinggal seed checklist type incoming/final & tautan dari detail WO. Tanpa model baru.
- Referensi pola klaim/dokumentasi berfoto terhubung WO: https://www.xfatora.com/en/modules/warranty-management/detailed.php

#### P1-2 (e/f susulan) Task/Timesheet terpisah dari WorkOrder
- Task wajib projectId; pekerjaan WO non-proyek tidak bisa ditugasi/di-timesheet per operasi. Digabung ke P0-2 tahap 3; jangan buat sistem tugas kedua.

### Yang TIDAK diusulkan run ini
- APS/optimizer otomatis, portal pelanggan, e-sign — P2, sesudah P0-2/P0-1 jalan.

---

## 2026-10-20 — Fokus: (a) akuntansi & pajak Indonesia (PPN/e-Faktur Coretax, faktur masukan, e-Bupot Unifikasi, setor/lapor)

Rotasi: run sebelumnya (e) penjadwalan bengkel + (f) garansi/after-sales. Run ini (a). Berikutnya: (b) manufaktur & job costing.

Benchmark resmi dipakai run ini:
- Accurate Online Smartlink Tax (penomoran faktur pajak otomatis, e-Faktur, email faktur pajak, integrasi PJAP): https://accurate.id/online/fitur/smartlink-tax/
- Accurate e-Faktur CTAS/Coretax via Pajak.io (upload faktur keluaran langsung ke Coretax DJP, penandatangan/pembuat faktur): https://help.accurate.id/product/accurate-online/fitur-aol/smartlink-tax/e-faktur-ctas/efaktur-ctas/
- Accurate SPT Masa PPN (tipe Pajak Masukan/Keluaran/gabungan + ekspor CSV e-Faktur): https://help.accurate.id/product/accurate-online/fitur-aol/laporan/spt-masa-ppn-ppnbm/cara-membuat-SPT-masa-PPN-PPNbm/
- Accurate Bukti Potong PPh 23 + SPT (modul Laporan → SPT PPh Ps.23, tab Bukti Pemotongan, cetak/unduh): https://help.accurate.id/product/accurate-online/fitur-aol/laporan/cara-membuat-SPT-Ps.23-dan-pemotongan/
- Mekari Klikpajak × Jurnal (faktur keluaran otomatis dari faktur penjualan, rekonsiliasi faktur pajak, validasi NPWP/NITKU, lapor SPT ke Coretax): https://inapp.mekari.com/klikpajak-x-jurnal/
- Mekari Klikpajak e-Bupot Unifikasi (PPh 4(2)/15/22/23/26 satu format, satu SPT Masa, kalkulasi otomatis, penomoran DJP, kirim ke lawan transaksi): https://klikpajak.id/aplikasi-pajak-online/e-bupot-unifikasi/ dan https://klikpajak.id/fitur-pajak/
- Zahir (standar pasar: laporan memuat Faktur Pajak; penjualan cetak faktur pajak standar/sederhana): https://zahiraccounting.com/id/product/ dan https://zahiraccounting.com/id/produk-5/features-dan-keunggulan-zahir/transaksi-realtime-full-otomatis/

### Inventarisasi terverifikasi (2026-10-20, domain pajak)

Sudah ada (kuat di pembukuan, lemah di dokumen pajak resmi):
- Master pajak generik: `Tax` (rate/type/scope/isInclusive/isCompound/accountId/effectiveFrom-To), `TaxGroup`+`TaxGroupTax`, halaman `master/pajak`, `master/kelompok-pajak`; `WithholdingTaxType` (code/name/rate, akun utang PPh + akun PPh dibayar dimuka), halaman `pengaturan/pajak-potong`.
- PPN dokumen: `SalesInvoice.tax/taxAmount` (header saja; `SalesInvoiceItem` tanpa taxRate/taxAmount per baris), `VendorBill.tax` + `VendorBillItem.taxPercent/taxAmount`; jurnal PPN via mapping `salesTaxAccountId`/`purchaseTaxAccountId` di `SystemSetting` (`accounting.hook.ts`).
- Laporan: `/laporan/faktur-ppn` "Faktur SPT Masa PPN" (`vat-invoices.ts`: DPP=subtotal−diskon, keluaran dari `SalesInvoice.taxAmount`, masukan dari `VendorBill.tax`, posisi kurang/lebih bayar), `/laporan/rekonsiliasi-ppn`, `/laporan/pajak`, `/laporan/bukti-potong-pph`, `/laporan/penyetoran-pajak`, `/laporan/pph-21`.
- PPh potong: `VendorBill.withholdingTypeId/withholdingAmount` (utang neto grandTotal−withholding sudah benar), `SalesPayment.withholding*` + `withholdingCertificateNo/Date` manual; laporan Bukti Potong PPh dari tagihan vendor posted/partial/paid.
- Setor pajak: `TaxPayment` (period string bebas, reference=SSP/MPN, journalId) + `tax-payment.actions.ts` (Dr utang pajak / Cr kas-bank) + halaman `keuangan/penyetoran-pajak`.

Belum ada (bukti pencarian dijalankan):
- Nol model/field faktur pajak: `grep -i "efaktur|coretax|ebupot|nsfp|nomorSeriFaktur" prisma/schema.prisma src/actions src/lib` = hanya 2 komentar pengakuan di `src/lib/reports/vat-invoices.ts:32,152-153` ("nomor faktur pajak (e-Faktur) belum disimpan pada dokumen, jadi laporan ini tidak bisa dipakai untuk mengunggah e-Faktur secara langsung"). `SalesInvoice`/`VendorBill` tanpa nomor faktur pajak, kode transaksi, tanggal faktur pajak, status DJP, pengganti/pembatalan, PDF/QR e-Faktur. `VendorBill.vendorInvoiceNumber` = nomor faktur komersial pemasok, bukan nomor faktur pajak masukan.
- Nol ekspor pajak machine-readable: tidak ada generator CSV e-Faktur/XML Coretax (`grep xml src` hanya SVG/storage blocklist); ekspor laporan hanya CSV tabel tampilan generik + PDF.
- Nol identitas pajak lawan transaksi terstruktur: `Customer.taxId` string bebas max 50, `Vendor.npwp` string bebas; tanpa NITKU, nama wajib pajak, alamat pajak, status PKP, validasi format/online. `Item`/`Product` tanpa kode pajak/DPP default per barang-jasa.
- Nol e-Bupot sebagai dokumen: bukti potong hanya field lepas; tanpa nomor bukti potong terbitan sendiri, kode objek pajak, masa terstruktur, status kirim, file bukti potong. `TaxPayment.reference` teks bebas; tanpa kode billing/NTPN terstruktur dan tanpa tautan ke dokumen masa bersangkutan.
- Retur (`SalesReturn`/`PurchaseReturn`) tanpa kaitan faktur pajak/nota retur dan tanpa field PPN retur (grep pajak di jalur retur = 0).

### Gap

#### P0-1 (a) Faktur pajak keluaran tidak eksis sebagai dokumen — e-Faktur/Coretax mustahil, SPT PPN memakai nomor internal
- Kompetitor: Accurate penomoran faktur pajak otomatis + e-Faktur via PJAP + email pelanggan https://accurate.id/online/fitur/smartlink-tax/ ; upload Coretax CTAS https://help.accurate.id/product/accurate-online/fitur-aol/smartlink-tax/e-faktur-ctas/efaktur-ctas/ ; Mekari faktur keluaran otomatis dari faktur penjualan + rekonsiliasi https://inapp.mekari.com/klikpajak-x-jurnal/ ; Zahir cetak Faktur Pajak dari penjualan https://zahiraccounting.com/id/produk-5/features-dan-keunggulan-zahir/transaksi-realtime-full-otomatis/
- Status Silengkap: ABSEN (dokumen), parsial (nominal PPN). Bukti: `vat-invoices.ts:152-153`; `SalesInvoice` schema baris 1135-1188 tanpa field faktur pajak; laporan SPT menampilkan `documentNo` internal.
- Relevansi: penjualan bumper/rollcage/lift kit + jasa pasang ke pelanggan PKP (fleet/rental 4x4/tambang/perkebunan) wajib faktur pajak agar PPN masukan pelanggan dapat dikreditkan; faktur termin DP/progres/pelunasan kini input ulang manual di Coretax, rawan selisih DPP vs jurnal dan faktur dobel.
- Adaptasi (bukan copy PJAP penuh): model `TaxInvoice` (arah keluaran/masukan, salesInvoiceId/vendorBillId, nomorFakturPajak, kodeTransaksi, tanggalFaktur, masaPajak YYYY-MM, dpp, ppn, status draft→siap→terunggah→disetujui_djp→diganti→dibatalkan, replacesTaxInvoiceId, attachmentId, qrPayload, catatanError) + ekspor XML Coretax dari TaxInvoice terpilih; PJAP host-to-host fase berikut. Buat otomatis saat posting faktur penjualan ber-PPN (snapshot DPP/PPN header), satu faktur aktif per invoice. Tambah `Customer`: nitku, namaWajibPajak, alamatPajak, statusPkp + validasi format NPWP 16 digit.
- Modul disentuh: `prisma/schema.prisma`, `src/actions/sales.actions.ts`, `src/lib/reports/vat-invoices*.ts`, detail faktur penjualan, `src/lib/reports/report-registry.ts`. Effort: L (XML saja M). Risiko: format XML Coretax berubah (uji lawan template DJP per rilis); kode transaksi/DPP nilai lain salah → ditolak DJP; mitigasi status manual dulu, jangan klaim terkirim otomatis.


#### P0-2 (a) Faktur pajak masukan tidak dicatat — PPN masukan SPT hanya menebak dari `VendorBill.tax`
- Kompetitor: Accurate SPT Masa PPN tipe Masukan/Keluaran/gabungan + ekspor https://help.accurate.id/product/accurate-online/fitur-aol/laporan/spt-masa-ppn-ppnbm/cara-membuat-SPT-masa-PPN-PPNbm/ ; Mekari rekonsiliasi faktur pajak otomatis https://inapp.mekari.com/klikpajak-x-jurnal/
- Status Silengkap: ABSEN sebagai dokumen. Bukti: sisi masukan `loadVatInvoices` = semua `VendorBill` posted/partial/paid ber-`tax>0` pada tanggal tagihan; tanpa nomor faktur pajak pemasok, tanggal faktur pajak, masa pengkreditan, flag dapat-dikreditkan. Tagihan maklon tanpa faktur pajak ikut terhitung masukan.
- Relevansi: beli plat baja/pipa/shock/winch/ban dari distributor PKP — PPN masukan besar, menentukan kurang/lebih bayar; faktur pajak sering menyusul barang dan masa kredit beda bulan dari tanggal tagihan. Salah masa = pembetulan SPT.
- Adaptasi: pakai `TaxInvoice` arah masukan P0-1 (vendorBillId, nomorFakturPajak unik per vendor, tanggalFaktur, masaKredit YYYY-MM, dapatDikreditkan + alasan, status diterima/terverifikasi). Form tagihan vendor tambah blok Faktur Pajak Masukan (boleh menyusul; menahan pengkreditan, bukan jurnal pembelian). SPT masukan beralih ke `TaxInvoice.masaKredit`; selisih GL PPN masukan vs faktur tercatat tampil sebagai pengecualian di Rekonsiliasi PPN.
- Modul: `prisma/schema.prisma`, `src/components/forms/vendor-bill-form.tsx`, `src/actions/purchase.actions.ts`, `src/lib/reports/vat-invoices-data.ts`, `src/lib/reports/tax-summary-data.ts`. Effort: M (sesudah P0-1). Risiko: dobel kredit → unik (vendorId, nomorFakturPajak) + SPT hanya baca TaxInvoice; data lama tampil "belum ada faktur pajak", jangan auto-kredit.

#### P1-1 (a) e-Bupot Unifikasi absen — bukti potong hanya angka lepas
- Kompetitor: Mekari e-Bupot Unifikasi PPh 4(2)/15/22/23/26 satu format + satu SPT Masa + kirim lawan transaksi https://klikpajak.id/aplikasi-pajak-online/e-bupot-unifikasi/ ; Accurate SPT + Bukti Pemotongan PPh 23 https://help.accurate.id/product/accurate-online/fitur-aol/laporan/cara-membuat-SPT-Ps.23-dan-pemotongan/
- Status Silengkap: PARSIAL. Bukti: `WithholdingTaxType` hanya code/name/rate (tanpa pasal/kode objek pajak); `VendorBill.withholdingAmount` tanpa nomor bukti potong; `loadWithholdingSummary` hanya daftar tagihan; sisi pelanggan hanya `SalesPayment.withholdingCertificateNo` manual. Tanpa status terbit/terkirim/terlapor, PDF bukti potong, rekap SPT Unifikasi.
- Relevansi: potong PPh 23 jasa maklon/coating/subkon, 4(2) sewa; sebaliknya jasa fabrikasi Silengkap dipotong PPh 23 pelanggan korporat — bukti potong = kredit pajak, hilang bila tidak tertagih per nomor.
- Adaptasi: model `WithholdingCertificate` (arah, withholdingTypeId, pasal, kodeObjekPajak, counterpartyId, sourceBillId/sourcePaymentId, nomorBupot, tanggalPotong, masaPajak, dpp, tarifSnapshot, jumlahPotong, status, attachmentId) dari confirm tagihan vendor + pembayaran pelanggan ber-withholding; halaman keuangan/bukti-potong per masa (cetak PDF, tandai terkirim, ekspor rekap). Nomor e-Bupot Coretax diimpor manual dulu; integrasi DJP di luar scope.
- Modul: skema, `src/actions/purchase.actions.ts`, `src/actions/sales.actions.ts`, `src/lib/reports/tax-summary-data.ts`, `report-registry.ts`/`report-catalog.ts`, form pajak-potong. Effort: M. Risiko: regulasi tarif/kode objek berubah → snapshot di sertifikat; sertifikat immutable, koreksi = batal + terbit baru.

#### P1-2 (a) Retur tidak terhubung pajak — nota retur & koreksi PPN tidak tercatat
- Status Silengkap: ABSEN pajak. Bukti: `SalesReturn` schema 1289-1311 hanya invoice/customer/date/reason/status, item tanpa DPP/PPN retur; grep notaRetur/faktur pengganti = 0.
- Relevansi: part salah fitment (ban/shock tidak cocok variant) dikembalikan sesudah faktur pajak terbit; tanpa nota retur pajak, PPN keluaran kelebihan dan pelanggan tetap kredit penuh.
- Adaptasi: `SalesReturn`/`PurchaseReturn` tambah taxInvoiceId, nomorNotaRetur, tanggalNotaRetur, dppRetur, ppnRetur (proporsional snapshot faktur, guard kumulatif ≤ DPP asal); SPT kurangi pada masa nota retur, bukan masa faktur asal; faktur asal tampil terdampak sebagian/penuh.
- Modul: skema, retur di `src/actions/sales.actions.ts`/`purchase.actions.ts`, `vat-invoices-data.ts`. Effort: S–M (sesudah P0-1).

#### P2-1 (a) Setor pajak tidak terikat masa/dokumen sumber — billing/NTPN teks bebas
- Kompetitor: Accurate e-Billing/e-Filing Smartlink Tax https://accurate.id/online/fitur/smartlink-tax/ ; Mekari bayar+lapor terpusat https://klikpajak.id/fitur-pajak/
- Status Silengkap: PARSIAL. Bukti: `TaxPayment.period` string bebas, `reference` teks bebas, tanpa kodeBilling/ntpn/masa terstruktur/relasi dokumen; laporan Penyetoran Pajak tidak membandingkan kewajiban masa vs setor.
- Adaptasi: `TaxPayment` tambah jenisKewajiban, masaPajak, kodeBilling, ntpn, jatuhTempo; rekap per masa kewajiban−setor=belum disetor (peringatan saja). Buat kode billing via PJAP di luar scope.
- Modul: skema, `src/actions/tax-payment.actions.ts`, `src/lib/reports/tax-payments-data.ts`, `keuangan/penyetoran-pajak`. Effort: S. Risiko rendah.

### Yang TIDAK diusulkan run ini
- Integrasi langsung Coretax/PJAP host-to-host, tanda tangan elektronik, validasi NPWP/NITKU online: butuh kontrak PJAP + sertifikat; sesudah P0-1 terbukti dipakai.
- SPT Tahunan Badan; e-Bupot PPh 21 1721-A1: domain (h) SDM, payroll sudah punya laporan PPh 21 dasar.
- Faktur pajak digunggung/gabungan ritel: tidak relevan, transaksi bengkel per kendaraan bernilai besar.

Run berikutnya: (b) manufaktur & job costing.

---

## 2026-10-20 — Fokus: (b) manufaktur & job costing (aktual vs standar/estimasi per WorkOrder)

Rotasi: run sebelumnya (a) akuntansi & pajak. Run ini (b). Berikutnya: (c) perubahan part/material & BOM revisi saat job berjalan.

Benchmark dipakai run ini:
- Jalur A: Accurate Pekerjaan Pesanan (bahan+biaya lain -> WIP -> penyelesaian -> HPP per order, akun selisih biaya pekerjaan): https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pekerjaan-pesanan/mencatat-pekerjaan-pesanan/ dan selisih pekerjaan pesanan: https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pekerjaan-pesanan/selisih-pekerjaan-pesanan/ ; Accurate Manufaktur standard costing & variance + Laporan HPP Produksi: https://www.doniirvan.id/accurate-online/manufaktur/fitur/ ; Zahir standard cost vs actual + waste allowance/yield di formula: https://zahirerp.com/id/all-features-of-zahir-products/ dan https://zahirerp.com/id/zahir-manufacturing/ ; HashMicro variance (material price/usage, labor rate/efficiency, overhead spending/volume): https://www.hashmicro.com/id/blog/memahami-biaya-standar/
- Jalur B (job-shop): QT9 quote-to-job, real-time job costing, gross margin by job, cost variance analysis, scrap/rework cost per job: https://qt9software.com/erp/industry/job-shop ; Cetec: live actual vs estimate tracking + feed variance back into quoting: https://cetecerp.com/blog/erp-implementation/why-generic-erps-break-down-in-job-shop-environments/ ; scrap/yield: BOM process loss + scrap warehouse + scrap rate by reason code: https://mith.tech/blog/erpnext-scrap-wastage-byproduct-bom dan https://www.cleverence.com/articles/for-business/raw-material-cost-calculation-5384/

### Inventarisasi terverifikasi (2026-10-20, domain manufaktur/job costing)

Sudah ada (mesin biaya aktual kuat):
- `ProductionOrder`: totalStandardCost/totalActualCost/variance/releasedCost/completedQty; variance dihitung per release (releaseCost - releasedStandardCost proporsional) dan diakumulasi (`manufacturing.actions.ts:1089-1118`). `ProductionOrderMaterial`: qty rencana, actualQty, standardCost, actualCost, serial/batch.
- `ProductionCost` (labor/machine/overhead/subcontract/service/rework/other; driverType+isAppliedOverhead; sourceTimesheetId; nonconformanceId unik; purchaseOrderId) roll-up ke totalActualCost + jurnal WIP (`production-cost.service.ts`); subkon dari PO jasa WO (`syncServicePurchaseOrderCost`), rework dari NCR (`syncReworkCostToOrder`), labor dari timesheet (`pullLaborCostFromTimesheets`), overhead driver (`applyOverheadToProductionOrder`).
- Jurnal WIP lengkap (akun 110404): material issue -> WIP, cost absorbed -> WIP, completion Cr WIP, rounding variance (`stock-journal.service.ts:464-660`).
- Laporan: biaya-pekerjaan (bahan MaterialIssue completed + ProductionCost per WO, biaya/unit), penyelesaian-pekerjaan, jurnal-pekerjaan, serapan-overhead (applied vs actual GL, variance), laba-rugi-proyek, profitabilitas (revenue vs COGS per item dari faktur).
- Remnant (sisa potong usable/scrap + scrapReason, `schema.prisma:2487-2520`), BomRevision berversi immutable, genealogy agregat semua release.

Belum ada / parsial (bukti pencarian dijalankan):
- PARSIAL kritis: `completeProductionOrder` menghitung variance (aktual vs standar BOM) tetapi varians itu TIDAK dibukukan ke akun selisih dan TIDAK tampil di laporan mana pun — hanya tersimpan di kolom `ProductionOrder.variance`. Jurnal completion memakai biaya aktual penuh; satu-satunya jurnal "variance" adalah selisih pembulatan sub-sen (`onProductionOrderCostRoundingVariance`). Accurate membukukan selisih ke akun Selisih Biaya Pekerjaan; Zahir/HashMicro menampilkan variance per komponen. Di Silengkap angka variance mati di kolom.
- ABSEN: estimasi job vs aktual di level WorkOrder. `job-order-cost.ts:10-12` sengaja menolak memakai `WorkOrderItem.cost` sebagai pembanding (itu harga jual penawaran, bukan estimasi biaya) — benar secara akuntansi, tapi akibatnya tidak ada laporan estimasi-vs-aktual per job sama sekali. Tidak ada field estimatedCost/budget di WorkOrder/ProductionOrder selain totalStandardCost (standar BOM produk katalog, bukan estimasi job custom sekali-buat). Grep `estimatedCost|budgetCost|plannedCost` = 0.
- ABSEN: margin per WorkOrder. Tidak ada kolom revenue di laporan biaya-pekerjaan; `SalesInvoice` tidak punya `workOrderId` (hanya projectId/salesOrderId/quotationId, schema 1139-1143), jadi pendapatan job hanya bisa ditebak via quotation/project. Profitabilitas per item faktur tidak bisa menjawab "job plat B xxxx untung/rugi berapa".
- ABSEN: scrap/yield terstruktur per job. `BomRevisionMaterial` hanya qty (tanpa scrapPercent/processLoss/wasteAllowance); `MaterialIssueItem` hanya qty+cost (tanpa qty direncanakan vs terpakai vs sisa/scrap per baris); Remnant ada tapi `sourceType/sourceId` generik tanpa tautan wajib ke MaterialIssue/ProductionOrder dan tanpa reason code terstruktur (scrapReason teks bebas) — scrap rate per material/job tidak bisa dihitung. Pemakaian baja plat/pipa selalu melebihi BOM (potongan, gagal las, salah ukur) dan selisihnya kini tenggelam sebagai actualQty.
- PARSIAL: biaya bisa ditambah ke ProductionOrder completed ditolak (`production-cost.actions.ts:45-52`), tetapi tidak ada proses tutup job (job close-out): tidak ada status closed/terkunci biaya, tidak ada disposisi variance saat tutup, tidak ada snapshot margin final per job. WorkOrder complete tidak memeriksa biaya menggantung (ProductionCost tanpa PO, MaterialIssue draft, WIP residual != 0 per job tidak dilaporkan per job — hanya agregat akun WIP di neraca).

### Gap

#### P0-1 (b) Variance produksi dihitung lalu dibuang — tidak dibukukan, tidak dilaporkan per komponen
- Skenario: bumper custom selesai; aktual Rp18,4jt vs standar BOM Rp15,1jt. Selisih Rp3,3jt kini hanya angka di kolom tersembunyi. Akuntan tidak bisa bedakan: harga baja naik (price variance), pemakaian boros (usage variance), atau jam las molor (labor). Estimator mengulang kesalahan sama di quotation berikutnya.
- Pembanding: Accurate akun Selisih Biaya Pekerjaan Pesanan https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pekerjaan-pesanan/selisih-pekerjaan-pesanan/ ; HashMicro dekomposisi price/usage/rate/efficiency https://www.hashmicro.com/id/blog/memahami-biaya-standar/ ; Cetec feed variance back into quoting https://cetecerp.com/blog/erp-implementation/why-generic-erps-break-down-in-job-shop-environments/
- Status Silengkap: PARSIAL. Bukti: `manufacturing.actions.ts:1105-1112` (variance diakumulasi), `stock-journal.service.ts:617-660` (jurnal hanya rounding), grep variance di `src/lib/reports/` = hanya period-comparison & rekonsiliasi stok.
- Adaptasi (tanpa kode): (1) Laporan baru `laporan/varians-produksi/<periode>` per ProductionOrder/WO: standar vs aktual dipecah material-price ((aktual/unit - standar/unit) x actualQty dari ProductionOrderMaterial), material-usage ((actualQty - qty rencana) x standardCost), labor (ProductionCost labor aktual vs standar implisit), total variance + % terhadap standar; drill ke detail order. Semua data sudah ada — murni read model. (2) Saat order completed, jurnal disposisi opsional: Dr/Cr akun Selisih Biaya Produksi (setting baru, pola wipAccountId) sebesar variance final, hanya bila mode standard-costing diaktifkan per setting; default mati (aktual penuh ke persediaan seperti sekarang) supaya tidak mengubah HPP berjalan. (3) Di detail ProductionOrder tampilkan kartu variance (kini kolom tak terlihat di UI daftar mana pun — verifikasi: grep variance di komponen production-orders = hanya data laporan jurnal).
- Modul disentuh: `src/lib/reports/` (baru: production-variance.ts + -data.ts), `report-registry.ts`, `src/lib/services/stock-journal.service.ts`, `src/actions/manufacturing.actions.ts` (disposisi saat final), settings (akun selisih). Effort: M (laporan S-M, jurnal disposisi M). Risiko: standar BOM dari `Item.standardCost` bisa basi/nol -> variance raksasa palsu; mitigasi: tandai baris "standar tidak terkalibrasi" bila standardCost=0, jangan jurnalkan disposisi untuk order itu.

#### P0-2 (b) Tidak ada estimasi biaya per job dan margin per WorkOrder (plat kendaraan)
- Skenario: quotation lift kit Rp42jt disetujui. Aktual: material 19jt + labor 6jt + subkon powder coating 3jt + rework 1,5jt = 29,5jt. Tidak ada satu layar pun menjawab margin job ini; laba-rugi-proyek hanya bila job memakai Project (banyak WO langsung quotation tanpa project), dan pendapatan tak tertaut WO.
- Pembanding: QT9 gross margin by job + quoted vs actual https://qt9software.com/erp/industry/job-shop ; Accurate HPP per order dibandingkan harga jual penawaran + Laba Rugi per Proyek https://www.doniirvan.id/accurate-online/solusi/aplikasi-akuntansi-percetakan/
- Status Silengkap: ABSEN. Bukti: `job-order-cost.ts:10-12` (sengaja tanpa pembanding), SalesInvoice tanpa workOrderId (schema 1139-1163), grep estimatedCost = 0.
- Adaptasi khas offroad: (1) Snapshot estimasi saat WO dibuat dari quotation yang disetujui: model `WorkOrderCostEstimate` (workOrderId unik, materialEstimate, laborEstimate, subcontractEstimate, overheadEstimate, totalEstimate, quotationId, quotationRevision/versi, dibuatOtomatis, notes) — disalin dari rincian quotation (item stok -> estimasi material dari standardCost/FIFO terakhir; jasa -> estimasi labor/subkon), bisa disunting estimator sebelum WO start; immutable sesudah start (perubahan = change order, domain (c)). (2) Laporan/detail WO "Estimasi vs Aktual vs Pendapatan": estimasi vs aktual per kategori (material/labor/subkon/overhead/rework dari jalur biaya yang sudah ada), pendapatan = grandTotal invoice tertaut via rantai quotation->salesOrder->invoice WO ini (tanpa FK baru: WO.quotationId + invoice.quotationId/salesOrder), margin Rp + %, status lampu (aktual > estimasi per kategori). Tampilkan per plat (CustomerVehicle) di detail WO dan kartu kendaraan.
- Modul disentuh: `prisma/schema.prisma` (model estimasi), `src/actions/manufacturing.actions.ts` (buat snapshot saat create/start WO), detail WO (`produksi/perintah-kerja/[slug]`), `src/lib/reports/job-order-cost.ts` diperluas atau builder baru estimate-vs-actual, laporan `biaya-pekerjaan` tambah kolom estimasi/margin. Effort: L. Risiko: rantai pendapatan quotation->invoice tidak selalu 1:1 (invoice gabungan/parsial) -> atribusi proporsional dinyatakan eksplisit di UI sebagai estimasi atribusi, bukan angka jurnal; jangan pakai untuk posting akuntansi, hanya analitis.

#### P1-1 (b) Scrap/yield baja tidak terstruktur — pemakaian berlebih tak terpisah dari pemakaian sah
- Skenario: BOM bumper butuh plat 1,2 lembar; aktual keluar 2 lembar: 0,5 sisa potong usable, 0,3 scrap gagal potong. Sekarang actualQty=2 tercatat polos; sisa usable bergantung operator ingat buat Remnant manual; scrap tak berkode alasan, tak bisa jawab "material apa paling boros per bulan".
- Pembanding: ERPNext BOM process loss + scrap items ber-rate ke gudang scrap https://mith.tech/blog/erpnext-scrap-wastage-byproduct-bom ; scrap rate by reason code + build scrap into standard https://www.cleverence.com/articles/for-business/raw-material-cost-calculation-5384/ ; Zahir waste allowance di BOM https://zahirerp.com/id/zahir-manufacturing/
- Status Silengkap: PARSIAL. Bukti: `BomRevisionMaterial` tanpa scrapPercent; `MaterialIssueItem` (1898-1910) tanpa plannedQty/scrapQty; Remnant tanpa FK issue/order wajib.
- Adaptasi: (1) `BomRevisionMaterial.scrapPercent` (allowance normal, masuk qty rencana issue = qty x (1+scrap%)); (2) saat complete MaterialIssue/issueMaterial, per baris catat `scrapQty` + `scrapReasonCode` (salah_potong/gagal_las/rusak_material/sisa_tak_terpakai/lain) dan sisa usable diarahkan buat Remnant tertaut (sourceType=MaterialIssue, sourceId wajib); (3) laporan tambahan di biaya-pekerjaan atau laporan baru `laporan/scrap-material`: scrap rate per item/job/bulan + nilai Rp scrap, normal (<= allowance) vs abnormal. Dampak stok/jurnal: scrap tetap biaya job (sudah keluar ke WIP), tidak ada movement baru; Remnant usable tidak menambah qtyOnHand (konvensi existing dipertahankan).
- Modul: skema (BomRevisionMaterial, MaterialIssueItem), `manufacturing.actions.ts` issueMaterial, `material-issue.hook.ts`, form issue, laporan. Effort: M. Risiko: beban input operator — buat scrapQty default 0 dan hanya wajib alasan bila > allowance.

#### P1-2 (b) Tidak ada tutup job (close-out) — biaya menggantung & WIP residual per job tak terkunci
- Skenario: WO dinyatakan completed, kendaraan diserahkan; dua minggu kemudian tagihan bubut datang dan ProductionCost baru tak bisa masuk PO completed tapi bisa menggantung di WO; margin final berubah diam-diam sesudah invoice final terbit.
- Pembanding: praktik job costing standar — job ditutup setelah semua biaya masuk, variance didisposisi, lalu terkunci (QT9 job costing/close https://qt9software.com/erp/industry/job-shop ; Accurate penyelesaian pekerjaan pesanan mengalokasikan WIP ke barang jadi https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pekerjaan-pesanan/mencatat-pekerjaan-pesanan/).
- Status Silengkap: PARSIAL. Bukti: guard completed hanya di createProductionCost per production order; tidak ada field closedAt/closedBy di WorkOrder/ProductionOrder (schema 1996-2033, 2278-2314); tidak ada laporan WIP per job terbuka.
- Adaptasi: status `closed` sesudah completed untuk WorkOrder (dan PO-nya): prasyarat cek — tidak ada MaterialIssue draft untuk WO, semua ProductionCost berkategori ter-posting, tidak ada NCR open, variance terdisposisi (P0-1) atau dinyatakan diterima; sesudah closed, create/update/delete ProductionCost & issue baru ditolak (pola guard existing diperluas), reopen butuh izin + alasan (audit log). Laporan pengecualian "job selesai belum ditutup" + umur WIP per job dari akun 110404 direkonsiliasi per referensi jurnal.
- Modul: skema (closedAt/closedBy/reopenReason), `manufacturing.actions.ts`, `production-cost.actions.ts`, laporan biaya-pekerjaan. Effort: M. Risiko: job legacy menggantung — tutup massal administratif dengan penanda, jangan paksa jurnal koreksi.

#### P2-1 (b) Kalibrasi standar tidak pernah diberi makan balik
- Estimator memakai `Item.standardCost`/`Product.standardCost` yang statis; variance (P0-1) tidak pernah mengusulkan pembaruan standar. Adaptasi ringan: laporan varians menandai item dengan |usage/price variance| > ambang 3 periode beruntun sebagai kandidat re-cost (aksi manual `calculateStandardCost` sudah ada). Tanpa model baru. Effort: S (sesudah P0-1).

### Yang TIDAK diusulkan run ini
- Standard costing penuh menggantikan aktual (persediaan dinilai standar + variance periodik): perubahan metode akuntansi, butuh keputusan akuntan; cukup disposisi opsional P0-1.
- Multi-level BOM/sub-assembly costing & process costing per departemen: job fabrikasi Silengkap satu tingkat per kendaraan; tidak relevan sekarang.
- Timesheet per operasi/routing: domain penjadwalan (run 2026-10-20 P0-2), jangan duplikasi di sini.

Run berikutnya: (c) perubahan part/material & BOM revisi saat job berjalan.

---

## 2026-10-20 22:35 WIB — Domain (c) perubahan part/material & BOM revisi saat job berjalan (Jalur B prioritas)

Rotasi: run sebelumnya domain (a) putaran 2 F-100/F-101 (tergabung PR #266/#267/#261, verifikasi Qila 22:31 SELESAI). Run ini domain (c). Berikutnya: domain (d) DP/termin mengikuti perubahan nilai job.

Sumber eksternal run ini (ledger sitasi):
- Cetec ERP: ganti revisi BOM pada WO terbuka wajib unpick material revisi lama lalu re-pick ke suborder revisi baru, peringatan eksplisit sebelum konfirmasi [1].
- ERPNext: Work Order mengambil BOM default dan BOM dapat diganti di dokumen WO; item alternatif sah bila material BOM tidak tersedia saat produksi [2].
- Accurate: persetujuan transaksi memakai syarat nilai minimal + minimal diskon dengan logika DAN untuk menahan proses [3] — pola ambang dipakai ulang untuk change order bernilai besar.

### Inventarisasi terverifikasi run ini (bukti grep/read live)

Sudah ada:
- Quotation berversi: `Quotation.revisionNumber` (schema.prisma:987), `QuotationHistory` snapshot+changeReason (schema.prisma:1061-1078), `reviseQuotation` hanya dari status `sent`, snapshot sebelum increment, status kembali `draft` (sales.actions.ts:324-388). Faktur selisih revisi naik `createDifferenceInvoice` (sales.actions.ts:1123), kredit revisi turun pasif `createRevisionDownCredit` (sales.actions.ts:1274), faktur progres `createProgressInvoice` (sales.actions.ts:1203).
- Laporan estimasi vs aktual per pekerjaan sudah ada: `src/lib/reports/job-estimate-vs-actual.ts` + `-data.ts`, route `/laporan/estimasi-vs-aktual` (report-catalog.ts:179, report-registry.ts:409).
- WorkOrder tertaut quotation/project/bomRevision/customerVehicle (schema.prisma:2322-2358); `WorkOrder.bomRevisionId` di-pin saat ProductionOrder dibuat dari revisi released (manufacturing.actions.ts:633-714), bukan saat WO dibuat.
- BomRevision berversi immutable draft→released→superseded per Product (schema.prisma:1994-2026).

Belum ada / parsial (bukti pencarian dijalankan):
- Nol model change order: `grep -ri changeOrder src/ prisma/schema.prisma` = 0. Perubahan di tengah job tidak punya dokumen, nomor, status, atau approval tersendiri.
- Revisi quotation tidak terhubung WorkOrder berjalan: `reviseQuotation` menolak selain status `sent` (sales.actions.ts:342-344), jadi penawaran yang sudah accepted dan sudah melahirkan WO/SO tidak bisa direvisi lewat jalur ini; perubahan nilai job sesudah WO jalan tidak punya jalur resmi selain edit dokumen turunan satu-satu.
- Penggantian revisi BOM pada WO/ProductionOrder berjalan tidak ada: tidak ada aksi change-revision yang membekukan material sudah ter-issue, menghitung selisih kebutuhan revisi baru vs lama, dan mencatat alasan. Cetec mewajibkan unpick/re-pick eksplisit [1]; Silengkap hanya pin revisi saat PO lahir.
- Status part per baris WO tidak ada: `WorkOrderItem.status` hanya string default `pending` (schema.prisma:2364-2378) tanpa transisi dipesan/datang/terpasang/diganti/dikembalikan; `MaterialIssueItem.workOrderItemId` nullable (schema.prisma:1927-1935) sehingga telusur part terpasang per baris WO tidak wajib.
- Persetujuan pelanggan per revisi tidak tercatat sebagai bukti terpisah: `acceptQuotation` mencatat keputusan user internal via QuotationHistory (sales.actions.ts:241-271), tanpa timestamp persetujuan pelanggan per nomor revisi, tanpa ambang selisih harga yang memaksa re-approval (helper ambang F-100 `evaluateQuotationApprovalGate` read-only, tidak menahan dokumen per PUTUSAN 21:16).

### Gap (maks 5, P0 dulu)

#### F-2026-10-20-103 (c) P0 — Change order resmi terhubung WorkOrder tidak ada; perubahan tengah job tanpa dokumen persetujuan
- Skenario drama: bumper sudah terpasang, pelanggan ganti winch dari 4,5 ton ke 6 ton + tambah lampu. Selisih harga dan part berubah saat kendaraan sudah dibongkar. Kini perubahan hanya bisa diakali edit quotation (ditolak bila bukan `sent`) atau edit WO/SO manual tanpa jejak persetujuan.
- Pembanding: Cetec Change Rev pada WO terbuka dengan unpick/re-pick material [1]; ERPNext BOM dapat diganti di Work Order + item alternatif [2]; Accurate ambang persetujuan DAN [3].
- Status Silengkap: ABSEN. Bukti: grep changeOrder=0; reviseQuotation status-guard sales.actions.ts:342-344.
- Usulan adaptasi: model `JobChangeOrder` (workOrderId, quotationId, nomor dokumen urut, alasan perubahan, selisihNilai sen Decimal, status draft→menunggu_pelanggan→disetujui→ditolak→diterapkan, disetujuiOlehPelangganAt timestamp, baris perubahan item lama→baru qty/harga). Lapis aman tanpa migrasi: read-model selisih revisi quotation terakhir vs nilai WO berjalan dari QuotationHistory snapshot existing. Inti (model + aksi terapkan: revisi WorkOrderItem + pin ulang bomRevisionId + picu faktur selisih/kredit existing) wajib PUTUSAN team-lead.
- File disentuh inti: prisma/schema.prisma (model baru), src/actions/manufacturing.actions.ts, src/actions/sales.actions.ts, detail WO produksi/perintah-kerja/[slug].
- Approval/dampak: selisih di atas ambang (pola F-100) wajib status menunggu_pelanggan sebelum diterapkan; penerapan menaikkan nilai tagih lewat createDifferenceInvoice existing, penurunan lewat createRevisionDownCredit existing — jangan jurnal baru.
- Effort: L inti, S lapis aman read-model. Risiko: menerapkan perubahan sesudah material ter-issue tanpa membekukan baris terpasang mengacaukan HPP; mitigasi baris sudah ter-issue dikunci, perubahan hanya baris belum terpasang.

#### F-2026-10-20-104 (c) P1 — Ganti revisi BOM pada order berjalan tanpa unpick/re-pick tercatat
- Skenario: revisi BOM bumper v2 ganti plat 3mm ke 4mm sesudah sebagian material v1 keluar. Tanpa prosedur, stok keluar tetap tercatat atas kebutuhan lama dan kebutuhan baru tidak terhitung.
- Pembanding: Cetec unpick revisi lama + re-pick revisi baru dengan peringatan [1]; ERPNext ganti BOM di Work Order [2].
- Status Silengkap: PARSIAL. Bukti: pin bomRevisionId hanya saat ProductionOrder lahir (manufacturing.actions.ts:633-714); tidak ada aksi ganti revisi pada order in_progress.
- Usulan: aksi ASSESS dulu — hitung material sudah ter-issue per revisi lama (MaterialIssueItem.workOrderItemId), bekukan, selisih kebutuhan revisi baru tampil sebagai kebutuhan tambahan/kembali. Tanpa model baru; inti mengubah bomRevisionId order berjalan ditunda-teknis.
- Effort: M. Risiko: re-pick menggandakan pengeluaran stok; mitigasi selisih saja, bukan pengeluaran ulang penuh.

#### F-2026-10-20-105 (c) P1 — Status part per baris WO tidak bertransisi (dipesan/datang/terpasang/diganti/dikembalikan)
- Skenario: shock dipesan, datang, terpasang, lalu diganti karena bocor dan part lama dikembalikan. Status baris tetap `pending` sehingga tidak ada jawaban per part tanpa membuka banyak dokumen.
- Status Silengkap: PARSIAL. Bukti: WorkOrderItem.status default pending tanpa transisi di manufacturing.actions.ts; MaterialIssueItem.workOrderItemId nullable.
- Usulan lapis aman: builder read-model status turunan per baris WO dari dokumen existing (PO diterima, MaterialIssue completed, retur) tanpa kolom baru; inti kolom status terkelola ditunda migrasi.
- Effort: S read-model. Risiko: status turunan salah bila workOrderItemId kosong; tampilkan tak-tertaut, jangan tebak.

### Yang TIDAK diusulkan run ini
- Portal pelanggan tanda tangan digital: butuh kanal eksternal; timestamp persetujuan internal per revisi cukup dulu.
- Item alternatif otomatis: ERPNext [2] relevan hanya sesudah F-105 status part terbaca.

Run berikutnya: domain (d) DP/termin/invoice progres mengikuti perubahan nilai job.

---

## 2026-10-20 22:48 WIB — Domain (d) DP/termin/invoice progres mengikuti perubahan nilai job (Jalur B prioritas)

Rotasi: run sebelumnya domain (c) F-103..F-105. Run ini domain (d). Berikutnya: domain (e) akuntansi & pajak Indonesia lanjutan / (f) bukti foto & garansi.

Sumber eksternal run ini (ledger sitasi):
- Accurate: DP penjualan dipakai sebagian per faktur, saldo DP terpantau dan memotong tagihan [4].
- Praktik progress billing: change order aditif/deduktif wajib menghitung ulang nilai kontrak dan sisa jadwal bayar secara proporsional, didokumentasikan tertulis [5].
- Sage X3: milestone billing vs progress billing (persen progres) sebagai dua mode jadwal tagihan proyek [6].

### Inventarisasi terverifikasi run ini (bukti grep/read live)

Sudah ada (kuat):
- `DownPayment` per quotation nominal bebas (schema.prisma:1080-1104); `createDownPayment` draft murni + cap kumulatif ≤ grandTotal berjalan dalam tx FOR UPDATE (sales.actions.ts:578-660); `confirmDownPayment` atomik jurnal kas + WO/SO/Project + invoice saat kumulatif CONFIRMED ≥50% grandTotal sen-integer (down-payment.hook.ts:551-569).
- Faktur progres persen target `createProgressInvoice` (sales.actions.ts:1203), faktur selisih revisi naik `createDifferenceInvoice` (:1123), kredit revisi turun pasif `createRevisionDownCredit` (:1274), `CustomerCredit` + alokasi/refund (schema.prisma:345-364), ringkasan tagihan job read-model `job-billing-summary(-data).ts` + `job-billing-progress.ts` (DP terkonfirmasi, tertagih tiga jembatan dedup, kredit terbuka).

Belum ada / parsial (bukti pencarian dijalankan):
- Nol jadwal termin terstruktur: `grep PaymentSchedule|paymentScheduleId|billingKind` di schema+src produksi = 0 (hanya komentar "inti termin tetap ditunda-teknis" job-billing-summary-data.ts:12). Termin hanya muncul sebagai DP nominal bebas berurutan + satu ambang 50% hardcoded; tidak ada rencana termin (persen/tanggal/milestone) yang bisa dibandingkan rencana vs aktual.
- Nilai kontrak berubah (F-103 change order / revisi) tidak menghitung ulang sisa termin: cap DP membaca grandTotal berjalan (benar), tetapi tidak ada tampilan "sisa jadwal sesudah perubahan nilai" — sisa = grandTotal baru − tertagih − DP confirmed hanya terbaca implisit dari ringkasan, tanpa jadwal termin bernama (Termin 1/2/Final) dan tanpa peringatan termin berikutnya jatuh tempo.
- Kelebihan bayar atas nilai turun ditangani kredit pasif existing (F-59), tetapi tidak ada penghubung eksplisit "perubahan nilai → jadwal termin direvisi" yang tercatat sebagai dokumen/amendemen jadwal.

### Gap (maks 5, P0 dulu)

#### F-2026-10-20-106 (d) P1 — Jadwal termin terstruktur per job tidak ada; termin hanya DP nominal bebas + ambang 50% hardcoded
- Skenario drama: kesepakatan awal DP 30% — termin 40% saat rangka selesai — pelunasan 30% saat serah terima. Kini admin menebak nominal tiap DP dari persen kontrak secara manual; tidak ada daftar termin bernama dengan target persen/tanggal sehingga termin terlewat atau dobel tidak terlihat.
- Pembanding: Sage X3 milestone vs progress billing [6]; Accurate DP bertahap terpantau saldonya per faktur [4].
- Status Silengkap: PARSIAL. Bukti: DownPayment nominal bebas; ambang 50% hardcoded down-payment.hook.ts:565-566; grep PaymentSchedule=0.
- Usulan lapis aman (tanpa migrasi): builder read-model "rencana termin turunan" dari pola existing — tampilkan posisi kumulatif (DP confirmed %, tertagih %, sisa ke grandTotal) di kartu ringkasan tagihan job existing sebagai progres bar bertahap, tanpa kolom jadwal baru. Inti (model `JobPaymentSchedule`: quotationId/workOrderId, nama termin, targetPercent/targetAmount, dueDate/milestoneLabel, status) ditunda-teknis sampai PUTUSAN team-lead.
- Effort: S lapis aman, M inti. Risiko: jadwal turunan disalahbaca sebagai janji kontrak; labeli "turunan posisi berjalan, bukan jadwal kontraktual".

#### F-2026-10-20-107 (d) P1 — Perubahan nilai job tidak memicu hitung-ulang sisa termin yang terlihat
- Skenario: nilai job naik via change order sesudah progres 80% tertagih; sisa tagih seharusnya hanya selisih ke nilai baru, dan termin final berubah nominalnya. Mekanik faktur selisih sudah benar (vonis Salsa F-103), tetapi tidak ada satu tampilan yang menyatakan sisa termin baru vs lama sesudah perubahan.
- Pembanding: change order menghitung ulang sisa jadwal secara proporsional dan didokumentasikan [5].
- Status Silengkap: PARSIAL. Bukti: createDifferenceInvoice/createRevisionDownCredit existing; ringkasan job-billing tidak membandingkan nilai kontrak sebelum vs sesudah revisi terakhir (QuotationHistory snapshot ada, belum dibaca builder tagihan).
- Usulan lapis aman: builder read-model bandingkan grandTotal berjalan vs snapshot QuotationHistory revisi sebelumnya, tampilkan delta nilai + sisa tagih baru di kartu tagihan job; tanpa menulis jadwal/jurnal baru. Inti amendemen jadwal mengikuti F-103 inti.
- Effort: S. Risiko: snapshot histori tidak lengkap untuk penawaran lama; tampilkan "tidak tercatat", jangan tebak.

#### F-2026-10-20-108 (d) P2 — Ambang invoice otomatis 50% hardcoded, tidak per kesepakatan job
- Skenario: pelanggan korporat sepakat invoice pertama terbit pada DP 30%; ambang 50% hardcoded membuat invoice (dan stok keluar saat posting) terlambat dari kesepakatan.
- Status Silengkap: PARSIAL. Bukti: down-payment.hook.ts:551-569 ambang 50% tetap, dibulatkan ke atas ke sen.
- Usulan: inti saja — kolom ambang per quotation (persen) dengan default 50 mempertahankan perilaku berjalan; jangan bangun sebelum ada kebutuhan tercatat. Ditunda-teknis, bukan cacat berjalan.
- Effort: S inti. Risiko: mengubah ambang mengubah saat stok/revenue lahir; wajib vonis accountant sebelum inti dibuka.

### Yang TIDAK diusulkan run ini
- Jadwal termin kontraktual penuh + amendemen bertanda tangan: mengikuti inti F-103/F-106, jangan dibangun mendahului change order.
- Pengingat termin otomatis ke pelanggan: domain (k) notifikasi, sesudah jadwal terbaca.

Run berikutnya: domain (e) akuntansi & pajak Indonesia lanjutan.

---

## 2026-10-21 — Charter Lead ERP Research (patokan Zahir & Accurate)

Profil `lead-erp-research` kini permanen sebagai pemimpin riset ERP
Silengkap. Patokan benchmark: Accurate Online (accurate.id, help.accurate.id)
dan Zahir Accounting (zahiraccounting.com, help.zahironline.com), regulasi
DJP/Coretax untuk pajak. Metode, format entri, rotasi domain (a)-(j), dan
larangan tercatat di skill `erp-research-lead` + `references/benchmark-zahir-accurate.md`.
Riset menghasilkan gap terverifikasi + handoff; implementasi oleh
leadbackend/leadfrontend, vonis uang/pajak oleh lead-accountantax.

Fokus berikutnya: domain (e) akuntansi & pajak Indonesia lanjutan —
kelanjutan P0 faktur pajak keluaran/masukan + e-Bupot dari run (a)
2026-10-20; cek status implementasi item (a) terbuka sebelum gap baru.

---

## 2026-10-21 — Status item terbuka run (a) 2026-10-20 (verifikasi lead-erp-research)

Verifikasi grep/schema live 2026-10-21 09:21 WIB. Item run (a) lama memakai
label P0-1/P0-2/P1-1/P1-2/P2-1 tanpa ID F-*; ID diberikan sekarang agar bisa
di-handoff per kontrak leadbackend.

- **P0-1 → F-2026-10-21-001**: TERIMPLEMENTASI PARSIAL lapis nomor.
  `SalesInvoice.taxInvoiceNumber` (schema:1163-1165) + validasi bersama
  `src/lib/validations/tax-invoice.schemas.ts` + laporan SPT menampilkan nomor
  e-Faktur bila ada, fallback nomor internal (`vat-invoices.ts:141-147`).
  Tetap ABSEN: model `TaxInvoice` (grep `^model TaxInvoice` = 0), kode
  transaksi, tanggal faktur pajak, masa pajak, status DJP, pengganti/batal,
  ekspor XML Coretax (grep = 0), identitas pajak terstruktur Customer
  (nitku/statusPkp grep = 0). Butuh putusan accountant: YA (kode transaksi,
  perlakuan faktur pengganti/batal, DPP nilai lain).
- **P0-2 → F-2026-10-21-002**: TERIMPLEMENTASI PARSIAL lapis nomor.
  `VendorBill.taxInvoiceNumber` (schema:1563-1565) terpisah dari
  `vendorInvoiceNumber`. Tetap ABSEN: masa kredit terpisah dari tanggal
  tagihan, flag dapat-dikreditkan, keunikan (vendorId, nomor) — SPT masukan
  masih membaca dokumen tagihan, bukan dokumen faktur pajak. Butuh putusan
  accountant: YA (aturan masa pengkreditan + flag tidak dapat dikreditkan).
- **P1-1 → F-2026-10-21-003**: PARSIAL. Read-model rekap bukti potong +
  ekspor CSV sudah ada (`withholding-certificates-data.ts`, tes berlabel
  F-35a); model `WithholdingCertificate` tetap ABSEN (grep = 0), nomor bupot
  masih field manual `SalesPayment.withholdingCertificateNo`. Butuh putusan
  accountant: YA (pasal + kode objek pajak + tarif snapshot per jenis).
- **P1-2 (retur pajak) → F-2026-10-21-004**: belum terverifikasi ulang run
  ini; status terakhir ABSEN pajak. Verifikasi masuk run (a) lanjutan.
- **P2-1 (setor pajak) → F-2026-10-21-005**: belum terverifikasi ulang run
  ini; status terakhir PARSIAL. Verifikasi masuk run (a) lanjutan.

Fokus berikutnya tetap: (a) akuntansi & pajak Indonesia lanjutan —
selesaikan desain inti F-2026-10-21-001/002/003 sesudah vonis accountant,
bukan tambah gap baru dulu.

---

## VONIS ACCOUNTANT 2026-10-21 — F-2026-10-21-001/002/003 (FINAL)

Pemutus: `lead-accountantax`. Sifat: final untuk desain angka/pajak; backend
eksekusi mesin/Prisma/API, frontend tampil. Bukti repo live: model
`TaxInvoice`/`WithholdingCertificate` = 0; `SalesInvoice.taxInvoiceNumber`
schema:1165, `VendorBill.taxInvoiceNumber` schema:1565,
`SalesPayment.withholdingCertificateNo` schema:1293; SPT fallback nomor
internal `vat-invoices.ts:140-147`; rekap bupot read-model
`withholding-certificates-data.ts` memakai tarif master berjalan.
Sumber: UU PPN Pasal 9(2),(8),(9) & 13(5)(6); PMK-131/2024; PER-1/PJ/2025;
PER-11/PJ/2025; siaran DJP KT-08_2025 (kredit beda masa).

### F-001 Faktur pajak keluaran (TaxInvoice)

**Model wajib.** `TaxInvoice` satu dokumen pajak, bukan field tempel:
arah (`out`/`in`), `transactionCode` (string 2 digit simpan `01`..`10`;
Coretax tampil `010` hanya pad untuk kode 10 — simpan nilai kanonik `10`),
nomor seri penuh, tanggal faktur, masa pajak terbit (`YYYY-MM` dari
tanggal faktur), DPP faktur, tarif PPN efektif, jumlah PPN, status DJP
enum (`draft|approved|rejected|replaced|cancelled`), tautan dokumen
sumber (`salesInvoiceId` keluaran / `vendorBillId` masukan), tautan
pengganti (`replacesId` self-FK nullable, unik), alasan
pengganti/batal, snapshot NPWP/NIK + nama lawan + NITKU bila ada,
payload XML Coretax + hasil impor (hash file, waktu impor, pesan DJP).
Unik: `(direction, taxInvoiceNumber)` global untuk nomor terbit DJP
non-null. Tanggal faktur BUKAN tanggal invoice komersial; masa SPT
DITURUNKAN dari tanggal faktur, tidak diinput bebas.

**Kode transaksi yang didukung Silengkap** (PER-11/PJ/2025, 10 kode).
Default sistem untuk penjualan normal ERP: `04` — sejak PMK-131/2024
penyerahan BKP non-mewah + semua JKP memakai DPP nilai lain 11/12 ×
tarif nominal 12% (efektif 11%). Aturan pilih, urut prioritas pertama
cocok menang: (1) pemungut instansi pemerintah → `02`; pemungut lain /
Pasal 32A UU KUP → `03`. (2) fasilitas dibebaskan → `08`; tidak dipungut
/DTP → `07`. (3) aktiva Pasal 16D → `09` (hanya dari modul disposal
aset, bukan invoice penjualan biasa). (4) besaran tertentu Pasal 9A →
`05` hanya bila jenis usaha/transaksi tenant terdaftar PMK besaran
tertentu. (5) VAT-refund turis → `06` hanya tenant toko retail peserta.
(6) tarif selain Pasal 7(1) UU PPN → `10`. (7) DPP nilai lain PMK
tersendiri (termasuk PMK-131) → `04`. (8) sisanya DPP penuh tarif umum
(BKP mewah objek PPnBM) → `01`. Kode `01` BUKAN default lagi; `04`
BUKAN untuk BKP mewah.
DPP nilai lain berlaku: SEMUA penyerahan BKP selain tergolong mewah +
semua JKP kena PPN (PMK-131), dan DPP nilai lain lain yang diatur PMK
tersendiri (mis. LPG tertentu PMK-62/2022). Jurnal tetap dari DPP
FAKTUR × tarif nominal: Dr Piutang (DPP faktur + PPN), Cr Pendapatan
sebesar harga jual/penggantian PENUH (bukan DPP 11/12), Cr PPN Keluaran
= 12% × DPP faktur. Selisih harga jual vs DPP adalah mekanisme tarif,
bukan diskon/pembulatan — jangan jurnal akun selisih.

**Pengganti & batal.** Jurnal komersial asal TIDAK diubah/dihapus.
Faktur pengganti: dokumen TaxInvoice baru, nomor seri sama dengan
digit status pengganti sesuai Coretax, `replacesId` menunjuk faktur
diganti; faktur lama status `replaced`. SPT: pengganti dilaporkan pada
MASA FAKTUR DIGANTI (PER-11/PJ/2025) — read-model SPT mengelompokkan
efektif per rantai: hanya faktur kepala rantai terakhir yang bernilai,
yang diganti tampil sebagai referensi nol-efek; BUKAN baris DPP/PPN baru
di masa terbit pengganti. Pembatalan: hanya bila transaksi penyerahan
batal (bukan salah tulis — itu pengganti); faktur status `cancelled`,
nomor TIDAK dipakai ulang; efek SPT masa faktur asal dikoreksi lewat
mekanisme pembetulan masa asal, bukan jurnal baru di masa batal.
Akuntansi: perubahan DPP/PPN karena pengganti/batal TIDAK menjurnal
selisih otomatis ke periode berjalan. Bila nilai komersial invoice ikut
berubah, koreksi lewat dokumen komersial sah (retur/nota kredit/
reversal jurnal di periode terbuka, `assertPeriodOpen` dalam tx);
selisih PPN saja dicatat jurnal koreksi PPN di periode terbuka dengan
memo merujuk nomor faktur pengganti/batal. Pengganti/batal DITOLAK
sistem bila masa asal sudah terkunci tanpa jalur pembetulan — paksa
jurnal koreksi, bukan edit faktur lama. Retur BKP/nota pembatalan JKP
tetap dokumen sendiri; pengganti yang lahir sesudah nota retur
memperhitungkan nota itu (nilai neto), jangan dobel-kurang di SPT.

### F-002 Faktur pajak masukan

**Masa kredit.** Tambah ke TaxInvoice masukan: `creditPeriod`
(`YYYY-MM`, masa pengkreditan dipilih), `creditedAt`, enum
`creditStatus` (`uncredited|credited|not_creditable|expired`).
Aturan final (UU PPN 9(2) + 9(9), KT-08_2025): default masa kredit =
masa TANGGAL FAKTUR pemasok; boleh digeser ke masa berikutnya, maks
**3 masa pajak sesudah masa faktur** (faktur Jan → terakhir Apr),
sepanjang PPN belum dibebankan sebagai biaya/HPP. Lewat batas →
`expired`, tidak boleh masuk SPT; klaim hanya lewat jalur restitusi/
pembetulan sesuai aturan, bukan kredit masa berjalan. Masa kredit
TIDAK diturunkan dari tanggal VendorBill/tanggal terima barang; tanggal
terima hanya bukti pendukung. Faktur menyusul sesudah SPT masa faktur
terbit: kreditkan pada masa terima-faktur bila masih dalam jendela
(di atas) — JANGAN paksa pembetulan masa faktur hanya karena faktur
telat diterima; pembetulan masa asal hanya bila faktur memang
dilaporkan/diganti/dibatalkan pemasok (rantai pengganti ikut F-001).
VendorBill tanpa nomor faktur pajak valid: PPN vendor TIDAK masuk
akun PPN Masukan — gabung ke harga perolehan/HPP (Dr persediaan/beban
termasuk PPN), bukan Dr PPN Masukan.

**Flag tidak dapat dikreditkan.** Enum alasan wajib bila
`not_creditable` (UU PPN 9(8)): `PRE_PKP` perolehan sebelum pengukuhan
PKP; `NO_DIRECT_RELATION` tak berhubungan langsung kegiatan usaha;
`VEHICLE_SEDAN_SW` perolehan/pemeliharaan sedan & station wagon
(kecuali barang dagangan/disewakan — itu kreditabel); `FOREIGN_USE_PRE_PKP`
pemanfaatan luar daerah pabean sebelum PKP; `INVALID_INVOICE` faktur
tak memenuhi Pasal 13(5)(9)/tanpa identitas pembeli; `FOREIGN_INVALID`
dokumen luar pabean tak memenuhi 13(6); `ASSESSED` ditagih ketetapan
pajak; `UNREPORTED_FOUND_ON_AUDIT` tak dilaporkan & ditemukan saat
pemeriksaan (status retrospektif, hanya koreksi); `PRE_PRODUCTION_NON_CAPITAL`
perolehan selain barang modal sebelum berproduksi (9(2a)); plus
`BY_POLICY_EXEMPT_OUTPUT` alokasi penyerahan dibebaskan/tidak terutang
(dihitung pedoman pengkreditan, bukan tebak per faktur).
Perlakuan GL: `not_creditable` → PPN masuk harga perolehan aset/
persediaan atau beban periode berjalan (sesuai sifat perolehan), TIDAK
pernah Dr PPN Masukan. Sebagian kreditabel (campur kena+bebas): simpan
`creditablePercent Decimal(5,2)` + dasar pedoman; hanya porsi itu Dr
PPN Masukan, sisa kapitalisasi/beban. Unik `(vendorId, nomor faktur)`
pada TaxInvoice masukan non-batal; nomor sama vendor beda = faktur
beda sah. Duplikat kredit (faktur sama dikreditkan 2 masa) = tolak
keras di service, bukan peringatan.

### F-003 Bukti potong / e-Bupot Unifikasi

**Model.** `WithholdingCertificate` dokumen sendiri: arah (`we_withhold`
kita potong / `withheld_from_us` dipotong pelanggan), nomor bupot DJP,
tanggal bupot, masa pajak (`YYYY-MM` dari tanggal potong), identitas
pihak dipotong (NPWP/NIK + nama snapshot), `withholdingTypeId`, pasal
enum snapshot (`PPh21|PPh22|PPh23|PPh4(2)|PPh26|PPh15`), `objectCode`
string (kode objek e-Bupot, mis. seri `24-104-xx` untuk jasa PPh 23,
`28-409-xx` konstruksi final), DPP bruto snapshot `Decimal(15,2)`,
tarif snapshot `Decimal(5,2)`, jumlah dipotong, status
(`draft|issued|revoked`), dokumen sumber (VendorBill/SalesPayment),
fasilitas (SKB/PP23/DTP + nomor fasilitas nullable).
`WithholdingTaxType` diperluas: tambah `article`, `objectCode`,
`accountPayableId` tetap utang PPh, `prepaidAccountId` tetap PPh
dibayar dimuka. Seed bawaan hanya 2 pasal terbukti dipakai repo
sekarang: PPh 23 jasa umum tarif 2% (objek per-jenis-jasa PMK-141/2015,
kode dipilih per jasa — JANGAN satu kode keras untuk semua jasa) dan
PPh 4(2) konstruksi/final (tarif per kualifikasi 1,75%/2,65%/3,5%/4%/6%
per kode objek konstruksi berlaku; wajib pilih kode, tarif mengikuti
kode terpilih). PPh 21 tetap domain payroll (TER), PPh 22/26/15 hanya
aktif bila tenant aktifkan jenisnya — jangan seed mati.

**Snapshot final.** Bupot lahir menyalin pasal+kode objek+tarif+DPP dari
jenis terpilih ke dokumen; edit tarif master SESUDAH itu tidak mengubah
bupot terbit maupun jurnalnya (tarif master berjalan yang dibaca
`withholding-certificates-data.ts` sekarang = cacat untuk bupot
terbit — sesudah model ada, rekap membaca snapshot; baris legacy tanpa
dokumen tetap fallback master dengan label `legacy`). Jurnal tidak
berubah dari pola berjalan: kita potong vendor Dr Hutang / Cr Utang
PPh, setor Dr Utang PPh / Cr Kas (`TaxPayment` wajib taut
`withholdingTypeId`+masa); dipotong pelanggan Dr Kas neto + Dr PPh
dibayar dimuka / Cr Piutang penuh. Bupot batal = status `revoked` +
jurnal reversal dokumen sumber, bukan hapus baris. Rekap SPT Masa
Unifikasi per masa dari `withholdingDate`, bukan tanggal bayar kas.

### Batasan eksekusi backend (mengikat)

1. Migrasi Prisma = skema baru; jalankan jalur migrasi repo, verifikasi
   `prisma validate` + tidak mengubah kolom berjalan. Field lama
   `taxInvoiceNumber` dipertahankan sebagai cermin nomor kepala rantai
   (backfill dari TaxInvoice pertama), bukan sumber kebenaran baru.
2. Semua mutasi TaxInvoice/WithholdingCertificate: `assertPeriodOpen`
   dalam tx + idempotency key; akun dari setting/COA aktif, gagal keras.
3. Uang `Decimal(15,2)`, tarif `Decimal(5,2)`, persen kreditabel
   `Decimal(5,2)`; tak ada `Number()` mentah di hitung DPP/PPN/PPh.
4. Test falsifikasi minimum: (a) kode 04 harga 12.000.000 → DPP
   11.000.000 PPN 1.320.000, pendapatan tetap 12.000.000; (b) pengganti
   mengubah PPN — SPT masa asal berubah, masa terbit pengganti tidak
   dobel; (c) faktur masukan bulan ke-4 ditolak `expired`; (d) duplikat
   (vendor,nomor) ditolak; (e) non-kredit sedan → PPN kapitalisasi,
   PPN Masukan nol; (f) edit tarif master tidak mengubah bupot terbit.
5. XML Coretax: impor/ekspor mengikuti skema DJP berjalan; Silengkap
   TIDAK menerbitkan nomor seri faktur sendiri.

PEMILIK BERIKUTNYA: leadbackend (migrasi+service+test), lalu leadfrontend.

### Verifikasi ulang 004/005 — 2026-10-21 09:33 WIB (lead-erp-research)

- **F-2026-10-21-004 (retur–pajak): naik status ABSEN → PARSIAL, lebih maju
  dari catatan 2026-10-20.** Potongan PPN retur SUDAH mengurangi SPT pada masa
  tanggal retur dengan proporsi faktur asal (`vat-invoices-data.ts:182-215`,
  label F-2026-10-20-61, `computeReturnDeduction`; PPN-retur 0 bila faktur asal
  tanpa PPN). Tetap ABSEN: dokumen nota retur pajak — `SalesReturn`
  (schema:1315-1334) & `PurchaseReturn` (schema:1523-1541) tanpa
  taxInvoiceId/nomorNotaRetur/tanggalNotaRetur; item retur tanpa DPP/PPN
  snapshot (dihitung ulang dari faktur asal saat laporan dibaca, bukan
  snapshot saat retur). Risiko SALAH potensial: harga/qty item retur berubah
  sesudah retur → potongan masa lalu ikut berubah diam-diam saat laporan
  dibaca ulang. Butuh putusan accountant: YA (snapshot wajib vs hitung-ulang
  sah; guard kumulatif potongan ≤ DPP/PPN faktur asal; nota retur untuk
  retur tanpa faktur pajak asal).
- **F-2026-10-21-005 (setor pajak): tetap PARSIAL, satu koreksi catatan.**
  `TaxPayment.taxTypeId` → `WithholdingTaxType` SUDAH ada (schema:910-936) —
  catatan lama "tanpa tautan dokumen masa" tidak tepat untuk jenis potong.
  Tetap ABSEN: kodeBilling/NTPN terstruktur (grep kodeBilling|ntpn = 0 hasil
  kode; `reference` teks bebas "SSP/MPN"), masa terstruktur (period string
  "2026-09" bebas), jenisKewajiban PPN/PPh badan di luar tipe potong,
  kewajiban−setor per masa. Effort S. Butuh putusan accountant: TIDAK untuk
  kolom billing/NTPN; YA hanya untuk definisi kewajiban per masa (sumber
  angka kewajiban: SPT vs jurnal).

---

## 2026-10-21 09:35 WIB — Status domain (b) manufaktur & job costing (verifikasi ulang)

Run 2026-10-20 (b) memakai label P0-1/P0-2/P1-1/P1-2/P2-1 tanpa ID F-*.
ID diberikan sekarang; status diverifikasi grep live 2026-10-21:

- **(b) P0-1 → F-2026-10-21-006** Variance produksi: TERIMPLEMENTASI laporan.
  `src/lib/reports/production-variance.ts` + `production-variance-data.ts`
  ADA (memecah ProductionOrder.variance per komponen). Sisa belum
  terverifikasi: jurnal disposisi akun selisih saat completed + kartu
  variance di detail ProductionOrder — cek run (b) berikutnya. Butuh putusan
  accountant: YA untuk jurnal disposisi (mode standard-costing).
- **(b) P0-2 → F-2026-10-21-007** Estimasi biaya per job + margin WO:
  ABSEN terverifikasi — grep `WorkOrderCostEstimate|estimatedCost|budgetCost`
  di schema+src = 0 model/field (satu-satunya estimatedCost = parameter
  `warranty-accounting.ts:194`, bukan estimasi job); `SalesInvoice` tetap
  tanpa workOrderId (hanya projectId/salesOrderId/quotationId). Gap tetap
  terbuka penuh. Butuh putusan accountant: TIDAK untuk snapshot analitis;
  YA bila angka dipakai posting.
- **(b) P1-1 → F-2026-10-21-008** Scrap/yield terstruktur: belum
  terverifikasi ulang run ini.
- **(b) P1-2 → F-2026-10-21-009** Tutup job (close-out): belum
  terverifikasi ulang run ini; berkaitan prasyarat F-2026-10-21-006
  (disposisi variance).
- **(b) P2-1 → F-2026-10-21-010** Makan-balik kalibrasi standar: turunan
  F-2026-10-21-006, sesudah laporan varian terbukti dipakai.

Fokus berikutnya: (c) persediaan & gudang — verifikasi F-2026-10-21-008 +
inventarisasi opname/transfer/multi-gudang vs Accurate/Zahir.

---

## VONIS ACCOUNTANT 2026-10-21 — F-2026-10-21-004/005/006 (FINAL)

Pemutus: `lead-accountantax`. Final angka/pajak; backend eksekusi
mesin/Prisma, frontend tampil. Bukti live run ini: `computeReturnDeduction`
`vat-invoices.ts:83-94` (DPP=qty×price item retur, PPN=DPP×taxAmount/(subtotal−discount)
faktur asal, tanpa snapshot); loader `vat-invoices-data.ts:182-215` baca ulang
faktur asal tiap laporan; `SalesReturn` schema:1315 / `PurchaseReturn`
schema:1523 tanpa kolom nota retur/snapshot; jurnal retur
`accounting.hook.ts:1169-1172` Dr Retur/Cr Piutang TANPA kaki PPN;
`TaxPayment` schema:910-936 (taxTypeId ADA, period teks bebas, reference
teks bebas, billing/NTPN=0); `production-variance.ts` laporan read-only ADA
+ peringatan baris `uncalibrated` tidak boleh ikut jurnal disposisi;
disposisi berjalan hanya selisih PEMBULATAN `stock-journal.service.ts:650-686`
(materialExpense ?? cogs, ambang 0,005); `ProductionOrder.variance`
akumulasi rilis `manufacturing.actions.ts:1246-1269` tanpa jurnal disposisi.

### F-004 Retur–pajak: snapshot WAJIB, hitung-ulang hanya legacy

1. **Snapshot saat retur completed/returned, bukan hitung ulang saat baca.**
   Di `SalesReturnItem`/`PurchaseReturnItem` bekukan: `returnDpp`,
   `returnVat` (Decimal 15,2), `sourceTaxRate` efektif (Decimal 5,2),
   `sourceTaxInvoiceId` (FK TaxInvoice asal bila ada). Rumus snapshot =
   rumus berjalan: DPP = qty × price beku item; PPN = DPP ×
   taxAmount/(subtotal−discount) faktur asal, `safeRound` sen; faktur asal
   taxAmount=0 → PPN-retur 0. Sesudah snapshot, edit harga/qty/master TIDAK
   mengubah potongan masa lalu. Baris legacy tanpa snapshot: fallback
   hitung-ulang berjalan DIIZINKAN dengan label `legacy` di read-model,
   bukan diam-diam dianggap snapshot.
2. **Guard kumulatif keras.** Σ DPP/PPN snapshot semua retur completed atas
   satu faktur asal ≤ DPP/PPN faktur asal, per item maupun total faktur.
   Retur yang membuat kumulatif lewat → ditolak saat complete (dalam tx,
   lock baris faktur asal), bukan dipotong diam-diam di laporan.
3. **Nota retur dokumen.** Tambah di header retur: `taxReturnNoteNumber`
   (nomor nota retur Coretax, dicatat apa adanya — sistem tidak menerbitkan
   nomor pajak sendiri), `taxReturnNoteDate`, tautan TaxInvoice asal
   (`sourceTaxInvoiceId`). Masa pengurang = masa TANGGAL NOTA RETUR; tanpa
   nota (retur komersial murni) masa = tanggal retur — konsisten vonis
   F-61 Salsa 2026-10-20 18:41. Retur tanpa faktur asal: nota retur tetap
   boleh dicatat, PPN-retur = 0 (tidak ada PPN asal yang dikurangi).
4. **Jurnal GL tidak berubah.** `onSalesReturnCompleted` tetap tanpa kaki
   PPN; pengurang SPT = lapisan laporan dari snapshot. Dr PPN Keluaran di
   jurnal hanya lewat dokumen nota kredit terpisah (inti F-59, tetap
   ditunda-teknis). Builder SPT wajib abaikan retur yang sudah masuk nota
   kredit berjurnal (anti dobel-kurang).
5. Sisi beli simetris: snapshot dari VendorBill/TaxInvoice masukan tertaut
   eksplisit; `PurchaseReturnItem.cost` DILARANG jadi DPP (vonis F-61 tetap).

### F-005 Setor pajak: kewajiban per masa dari jurnal, setor melunasi

1. **Sumber kewajiban = JURNAL, bukan SPT saja, bukan input bebas.** Saldo
   kewajiban masa = Σ kredit − debit POSTED per akun pajak (PPN Keluaran −
   PPN Masukan untuk PPN; akun Utang PPh per jenis untuk potong) dari
   `JournalEntry`, direkonsiliasi ke posisi SPT (`vat-invoices` neto,
   rekap bupot). Selisih jurnal vs SPT = temuan ditampilkan, bukan dipilih
   salah satu diam-diam. Read-model kewajiban menampilkan: kewajiban masa,
   sudah disetor, sisa — per (jenis pajak, masa).
2. **Struktur TaxPayment (lapis kolom, effort S, BOLEH backend langsung):**
   `billingCode` (15 digit MPN), `ntpn` (16 karakter), `period` divalidasi
   format `YYYY-MM` (bukan teks bebas), `taxKind` enum
   (`ppn|pph21|pph23|pph4_2|pph_badan|other`) agar PPN/PPh badan di luar
   tipe potong terwakili; `reference` lama dipertahankan cermin legacy.
   Jurnal tetap Dr akun utang pajak / Cr kas-bank; setor > sisa kewajiban
   masa → peringatan keras di read-model (bukan blokir: setor lebih sah
   sebagai pembayaran dimuka, wajib tampil sebagai saldo lebih-bayar).
3. Masa setor diturunkan dari `period` terstruktur, bukan tanggal bayar.

### F-006 Jurnal disposisi varians: mode standar MATI default

1. **Default: jurnal disposisi varians produksi MATI.** Sistem berjalan =
   aktual penuh: FG masuk sebesar biaya rilis aktual
   (`onProductionOrderCompleted` Dr Persediaan/Cr WIP nilai aktual),
   `ProductionOrder.variance` adalah angka ANALITIS standar-vs-aktual,
   bukan saldo yang menunggu dijurnal. Menjurnalnya ke beban = mengubah
   HPP retroaktif atas FG yang sudah tercatat aktual — DITOLAK sebagai
   perilaku bawaan.
2. Jurnal disposisi HANYA sah bila tenant mengaktifkan mode standard-costing
   secara eksplisit (setting baru `standardCostingEnabled`, default false)
   DAN FG dinilai standar. Tanpa mode itu, tombol/aksi disposisi tidak ada.
3. Bila kelak aktif: akun selisih = setting `productionVarianceAccountId`
   fail-closed (kosong = posting ditolak berisik; JANGAN fallback
   materialExpense/cogs — fallback berjalan hanya untuk selisih PEMBULATAN
   < ambang di `onProductionOrderCostRoundingVariance`, itu bukan disposisi
   varians). Arah: varians tak menguntungkan Dr Beban Selisih Biaya
   Produksi / Cr WIP; menguntungkan sebaliknya. Hanya baris terkalibrasi —
   baris `uncalibrated` (standar 0) DILARANG ikut disposisi. Satu disposisi
   per ProductionOrder saat completed, `referenceType=ProductionVariance_<id>`
   anti-dobel, `assertPeriodOpen` dalam tx, idempotency key wajib.
4. Selisih pembulatan existing TIDAK diubah vonis ini.

PEMILIK BERIKUTNYA: leadbackend (F-004 snapshot+guard+kolom nota,
F-005 kolom+read-model kewajiban, F-006 setting+gerbang mati default);
leadfrontend sesudah model stabil. Falsifikasi wajib: edit harga item
retur sesudah completed tidak mengubah potongan; retur kumulatif > faktur
ditolak; setor tampil sisa per masa dari jurnal; mode standar mati →
tidak ada jurnal varians walau order completed.

---

## 2026-10-21 09:55 WIB — Domain (c) persediaan & gudang

Rotasi: run sebelumnya (b) manufaktur (status F-2026-10-21-006..010 tercatat
09:35). Run ini (c). Berikutnya: (d) penjualan/pembelian & CRM.

Benchmark resmi (akses 2026-10-21):
- Accurate Persediaan: Permintaan Barang, Pemindahan Barang, Penyesuaian,
  Perintah+Hasil Stok Opname, Gudang multi-lokasi, Satuan bertingkat,
  Barang per Gudang, Barang Stok Minimum:
  https://accurate.id/online/fitur/persediaan/
- Accurate Pemindahan Barang antar gudang (Kirim Barang → Terima Barang,
  dua pencatatan):
  https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pemindahan-barang/mencatat-pemindahan-barang-antar-gudang/
- Accurate Permintaan Barang (antar gudang/cabang + dari stok minimum):
  https://help.accurate.id/product/permintaan-barang/
- Zahir fasilitas: Inventory, Serial Number, Lot Number, FIFO/LIFO,
  Multi-Warehouse:
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
- Zahir Stock Opname:
  https://help.zahironline.com/portal/id/kb/articles/stock-opname-zahir-online-v2

### Inventarisasi terverifikasi (2026-10-21, domain c)

Sudah ada (kuat):
- Multi-gudang + rak/baris: `Warehouse` (schema:643), `Rack`/`RackRow`,
  `UserWarehouse` (akses per user). Lapisan FIFO per (item,warehouse):
  `InventoryLayer.warehouseId` + `availableQty(tx,itemId,warehouseId)`
  (`inventory-fifo.ts:39-60`); konsumsi warehouse-scoped + kunci FOR UPDATE;
  guard stok negatif `allowShortfall:false` (accounting.hook.ts:598,
  purchase-return.hook.ts:145).
- Transfer 2 tahap: `InventoryTransfer` draft→processed→received
  (inventory-transfer.hook.ts:22-23) + re-create lot/serial tujuan +
  laporan `transfer-terkirim` (report-registry.ts:559).
- Batch/serial: `ItemBatch` (expiryDate, schema:3732), `ItemSerial` status
  per warehouse (schema:3753); FEFO fisik + tolak lot kedaluwarsa opt-in
  `documentDate` (inventory-fifo.ts, F-2026-10-20-79).
- Opname penuh: `StocktakeSession` snapshot→count1/2→review→approved
  (approval independen) →posted adjustment, koreksi live + delta concurrent
  di notes (inventory.actions.ts:1674-1927). `StockAdjustment` ber-journal.
- Penilaian: FIFO/Average per item/kategori/global
  (costing-method.service.ts; stock-valuation.ts:65-90); laporan kartu-stok,
  mutasi-stok, ringkasan-stok per gudang, valuasi-stok, rekonsiliasi-stok,
  umur-stok (report-registry.ts:812), nomor-seri-batch, stok-minimum +
  tombol Buat Permintaan (min-stock-request.ts), selisih-persediaan.
- Multi-satuan: `UomConversion` per item dipakai goods-receipt
  (goods-receipt.hook.ts:150-156). `PurchaseRequest` ADA — permintaan
  PEMBELIAN (schema:1355), bukan permintaan antar gudang.
- Peringatan ATP read-only kebutuhan material WO + committed WO lain
  (work-order-material-needs.ts:25-52, F-2026-10-20-19/51/52).

Belum ada / parsial (bukti grep run ini):
- ABSEN: reservasi stok mengikat. `grep StockReservation|reservedQty|
  qtyReserved` = 0 model/field; komentar eksplisit `work-order-material-
  needs.ts:25-30,51-52`: "BUKAN reservasi mengikat — inti StockReservation
  (F-07) tetap ditunda". ATP hanya peringatan global, bukan per gudang.
- PARSIAL (SALAH potensial): guard kedaluwarsa batch hanya 1 dari 5 jalur
  keluar. `grep documentDate src --include=*.ts` non-test, non-definisi:
  hanya `material-issue.hook.ts:99`. Penjualan (accounting.hook.ts),
  transfer (inventory-transfer.hook.ts:98), adjustment OUT
  (stock-adjustment.hook.ts:127), retur pembelian
  (purchase-return.hook.ts) memanggil consumeFifoLayers TANPA tanggal
  dokumen → lot kedaluwarsa bisa terjual/tertransfer dan jadi HPP.
- PARSIAL: `Item.minStock` global tunggal (schema:595); laporan stok-
  minimum membandingkan `Item.qtyOnHand` total semua gudang
  (min-stock.ts:23-27 dinyatakan sendiri). Min per gudang ABSEN; lead time
  / safety stock / reorder point ABSEN (`grep reorderPoint|safetyStock|
  leadTime` = 0); `VendorItemPrice` tanpa leadTimeDays.
- ABSEN: permintaan barang antar gudang sebagai dokumen (Accurate
  Permintaan Barang). `grep MaterialRequest|ItemRequest` = 0; bengkel
  minta part ke gudang pusat = lisan/telepon; `InventoryTransfer` lahir
  tanpa dokumen permintaan/approval sumber.
- PARSIAL: transfer terima selalu qty penuh baris; qty rusak/kurang di
  perjalanan hanya bisa ditolak/diabaikan (inventory-transfer.hook.ts:
  197-378 menjumlah qty terkirim penuh); tidak ada receivedQty per baris
  transfer / akun in-transit (status processed sudah mengurangi sumber,
  penerimaan menambah tujuan — selisih perjalanan tak tercatat).

### F-2026-10-21-008 (b→c) verifikasi — scrap/yield terstruktur: TETAP PARSIAL

- Bukti: `BomRevisionMaterial` hanya qty (tanpa scrapPercent);
  `MaterialIssueItem` (schema:1927-1945) tanpa plannedQty/scrapQty/
  scrapReasonCode; `Remnant` (schema:2540+) `sourceType/sourceId` String
  generik nullable, tanpa FK wajib MaterialIssue/ProductionOrder;
  `scrapReason` teks bebas VarChar(500). Sesuai catatan asal (b) P1-1.
  Status: TERBUKA, effort M, pemilik backend (schema+issue), tanpa vonis
  accountant (tidak mengubah posting; scrap tetap biaya job).

### F-2026-10-21-009 (b→c) verifikasi — tutup job: TETAP ABSEN

- Bukti: `WorkOrder` (schema:2322+) dan `ProductionOrder` tanpa
  closedAt/closedBy/reopenReason (`grep closedAt` hanya Nonconformance:
  2258 dan CrmTicket:3126 — bukan job); status WO string bebas tanpa
  status `closed`. Konfirmasi backlog lama tetap berlaku.
  Status: TERBUKA, effort M, pemilik backend; prasyarat analitis
  F-2026-10-21-006 sudah divonis accountant (disposisi MATI default).

### Gap baru domain (c)

#### F-2026-10-21-011 (c) P0 — Lot kedaluwarsa lolos di 4 dari 5 jalur keluar stok (SALAH)
- Kompetitor: Zahir Lot Number + FIFO/LIFO per produk
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang ;
  Accurate Barang per Gudang + penyesuaian persediaan
  https://accurate.id/online/fitur/persediaan/
- Status Silengkap: SALAH (parsial). Bukti: guard `documentDate` hanya
  material-issue.hook.ts:99; 4 pemanggil lain tanpa tanggal (di atas).
  Oli/adhesive/sealant/ban kedaluwarsa terpasang ke kendaraan pelanggan =
  risiko keselamatan + klaim garansi; HPP tercatat dari lot tak layak.
- Relevansi: bengkel offroad menyimpan oli, gemuk, sealant, ban, aki —
  semua berumur simpan. Jalur penjualan langsung (sparepart counter) jalan
  paling ramai justru tanpa guard.
- Adaptasi: teruskan `documentDate` (tanggal dokumen masing-masing) ke
  consumeFifoLayers di accounting.hook (invoice), inventory-transfer,
  stock-adjustment OUT, purchase-return; urutan dekremen lot fisik FEFO
  sama seperti material issue. Tanpa model baru, tanpa ubah posting
  (biaya tetap lapisan FIFO). Item tanpa ItemBatch = perilaku lama.
- Modul disentuh: src/lib/hooks/accounting.hook.ts,
  src/lib/hooks/inventory-transfer.hook.ts,
  src/lib/hooks/stock-adjustment.hook.ts,
  src/lib/hooks/purchase-return.hook.ts, tes hooks terkait.
- Effort: S. Risiko: dokumen backdate ditolak padahal stok fisik belum
  kedaluwarsa saat kejadian — mitigasi: pakai tanggal dokumen (bukan
  hari ini), pesan error menyebut nomor lot + tanggal kedaluwarsa.
- Urutan: purchase-return+transfer (dampak internal) → adjustment →
  penjualan (dampak pelanggan, terakhir).
- Pemilik usulan: backend. Butuh putusan accountant: TIDAK (guard fisik,
  bukan perlakuan jurnal).

#### F-2026-10-21-012 (c) P1 — Reservasi stok mengikat per WO/gudang tidak ada; ATP hanya peringatan global
- Kompetitor: Accurate Pemenuhan Pesanan (ketersediaan vs pesanan)
  https://accurate.id/online/fitur/persediaan/ ; Zahir Multi-Warehouse
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
- Status Silengkap: ABSEN (mengikat), PARSIAL (peringatan). Bukti:
  work-order-material-needs.ts:25-52; grep StockReservation = 0.
  Dua WO bersamaan bisa sama-sama membaca stok cukup; yang jalan kedua
  kehabisan di tengah bongkar.
- Relevansi: shock/ban/winch stok satuan mahal; kendaraan terlanjur
  dibongkar menunggu part = bay terblokir (gabung domain e).
- Adaptasi bertahap: (1) lapis aman: ATP per gudang WO (warehouseId WO/
  MaterialIssue) di builder existing, bukan global Item.qtyOnHand;
  (2) inti: model `StockReservation` (workOrderId, itemId, warehouseId,
  qty, status active/released/consumed/expired, expiresAt) dibuat saat WO
  start, dikonsumsi MaterialIssue, dilepas saat WO cancel/complete.
  Konsumsi FIFO wajib kurangi reservasi aktif pihak lain.
- Modul disentuh: prisma/schema.prisma, src/lib/services/inventory-fifo.ts,
  src/lib/reports/work-order-material-needs*.ts,
  src/actions/manufacturing.actions.ts.
- Effort: S lapis aman, M-L inti. Risiko: reservasi menggantung mengunci
  stok selamanya — mitigasi expiresAt + lepas otomatis di transisi WO.
- Urutan: ATP per gudang → reservasi saat start → konsumsi/lepas otomatis.
- Pemilik usulan: backend. Butuh putusan accountant: TIDAK.

#### F-2026-10-21-013 (c) P1 — Stok minimum hanya global; tanpa lead time / titik pesan-ulang per gudang
- Kompetitor: Accurate Barang Stok Minimum + Permintaan Barang dari stok
  minimum https://accurate.id/online/fitur/persediaan/ ;
  https://help.accurate.id/product/permintaan-barang/
- Status Silengkap: PARSIAL. Bukti: Item.minStock schema:595 global;
  min-stock.ts:23-27 total semua gudang; grep reorder/leadTime/safety = 0.
  Gudang bengkel kosong sementara gudang pusat penuh terbaca "aman".
- Relevansi: plat besi/pipa/fastener habis di gudang kerja menghentikan
  job; stok minimum pusat vs bengkel beda kebutuhan.
- Adaptasi: (1) lapis aman: laporan stok-minimum per gudang dari
  InventoryLayer remaining per warehouse vs minStock global yang sama
  (label "minimum masih global"); (2) inti: model `ItemWarehouseSetting`
  (itemId, warehouseId, minStock, safetyStock, leadTimeDays,
  reorderPoint turunan tampil) + `VendorItemPrice.leadTimeDays`;
  saran qty pesan = kebutuhan lead time + safety − tersedia − incoming PO.
- Modul disentuh: prisma/schema.prisma, src/lib/reports/min-stock*.ts,
  src/lib/services/notification.service.ts:136-167 (peringatan ikut per
  gudang).
- Effort: S lapis aman, M inti. Risiko: minimum per gudang dikali jumlah
  gudang menggelembungkan stok — mitigasi: default warisi global, edit
  per gudang eksplisit.
- Pemilik usulan: backend (model+data), frontend (tampil per gudang).
  Butuh putusan accountant: TIDAK.

#### F-2026-10-21-014 (c) P1 — Permintaan barang antar gudang tidak ada sebagai dokumen
- Kompetitor: Accurate Permintaan Barang antar gudang/cabang, diteruskan
  ke Pemindahan Barang
  https://help.accurate.id/product/permintaan-barang/
- Status Silengkap: ABSEN. Bukti: grep MaterialRequest = 0;
  PurchaseRequest = permintaan pembelian ke vendor (schema:1355), bukan
  antar gudang. Transfer lahir langsung tanpa permintaan/approval gudang
  tujuan.
- Relevansi: mekanik minta shock ke pusat lisan; tidak ada antrean
  permintaan per WO, tidak tahu part diminta untuk job mana / sejak kapan.
- Adaptasi: model `MaterialRequest` (documentNo, requesterWarehouseId,
  sourceWarehouseId, workOrderId nullable, itemId, qty, uom, status
  draft→approved→fulfilled/rejected, fulfilledTransferId) → tombol
  "Buat Transfer" membuat InventoryTransfer draft terisi; tanpa ubah
  jurnal transfer existing.
- Modul disentuh: prisma/schema.prisma, src/actions/inventory.actions.ts,
  src/app/(dashboard)/inventaris/ (halaman permintaan baru via frontend).
- Effort: M. Risiko: dokumen ganda dengan PurchaseRequest membingungkan —
  mitigasi nama UI "Permintaan Antar Gudang" vs "Permintaan Pembelian".
- Pemilik usulan: backend (model+aksi), frontend (halaman).
  Butuh putusan accountant: TIDAK.

#### F-2026-10-21-015 (c) P2 — Penerimaan transfer selalu penuh; selisih/rusak di perjalanan tak tercatat
- Kompetitor: Accurate Pemindahan Barang dua tahap Kirim→Terima
  https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pemindahan-barang/mencatat-pemindahan-barang-antar-gudang/
- Status Silengkap: PARSIAL. Bukti: inventory-transfer.hook.ts receive
  menjumlah qty terkirim penuh per item (baris 197-378); InventoryTransfer
  tanpa status partial-received / receivedQty per baris.
- Relevansi: antar lokasi dekat (satu kota) selisih jarang — P2, naik P1
  bila buka cabang kota lain.
- Adaptasi: `InventoryTransferItem.receivedQty` + status received parsial;
  selisih jadi StockAdjustment alasan "selisih transfer" ber-approval
  (pola opname existing). Tanpa akun in-transit baru.
- Effort: M. Risiko: selisih disembunyikan sebagai adjustment rutin —
  mitigasi alasan wajib + approval beda orang (pola stocktake).
- Pemilik usulan: backend. Butuh putusan accountant: TIDAK (kuantitas;
  akun adjustment existing).

### Yang TIDAK diusulkan run ini
- LIFO: PSAK/peraturan pajak Indonesia tidak mengakui LIFO untuk
  persediaan; Zahir menawarkannya sebagai opsi global, Silengkap benar
  hanya FIFO/Average — JANGAN ditiru.
- Konsinyasi: grep consign = 0, tidak ada bukti proses titip-jual di
  bengkel; tolak sampai ada kebutuhan nyata.
- Bin location lebih dalam dari Rack/RackRow existing: cukup.

Fokus berikutnya: (d) penjualan/pembelian & CRM — verifikasi status part
WO (F-105) terhadap pemenuhan SO/DO + komisi/multi-harga Accurate/Zahir.


---

## 2026-10-21 10:00 WIB — Domain (d) penjualan/pembelian & CRM

Rotasi: run sebelumnya (c) persediaan F-2026-10-21-011..015. Run ini (d).
Berikutnya: (e) jadwal bengkel & kapasitas.

Benchmark resmi (akses 2026-10-21):
- Accurate Komisi Penjualan (per kuantitas / nilai tetap per faktur /
  target / dibagi beberapa sales):
  https://help.accurate.id/product/komisi-penjualan/
- Accurate Penjualan (quotation→SO→DO→invoice, harga grosir per kuantitas,
  diskon bertingkat): https://help.accurate.id/product/penjualan/
- Zahir fasilitas Multi-Price, Multi-Discount, Multi-Komisi Penjualan,
  Sales Quotation, Sales Order, sisa belum kirim per SO:
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang

### Inventarisasi terverifikasi (2026-10-21, domain d)

Sudah ada (kuat):
- Rantai Quotation berversi→SO→DO→Invoice→Payment/Return + DP gate 50%
  (run a-d sebelumnya). Laporan `pemenuhan-pesanan` (order-fulfillment.ts:
  sisa belum kirim per SO dari DeliveryOrderItem.salesOrderItemId, tanpa
  akumulator di baris SO — dinyatakan jujur di header file).
- Multi-harga per kategori pelanggan: `CustomerPriceList`
  (customerCategoryId, itemId, price, effectiveDate, schema:501-518).
- `Customer.creditLimit` (schema:309) tersimpan. Lead/LeadActivity +
  konversi customerId, CrmTicket generik.

Belum ada / parsial (bukti grep run ini):
- ABSEN komisi penjualan: `grep -rni commission|komisi prisma/schema.prisma
  src/actions src/lib` = hanya akun CoA 600002 "Beban Komisi"
  (base-data.ts:780). Tidak ada field penjual di dokumen:
  `grep salesId|salespersonId|salesEmployee` = 0 di schema +
  sales.actions.ts. Quotation/SO/Invoice tanpa atribusi sales → komisi
  dihitung manual di luar sistem, akun 600002 tak pernah terisi dari
  penjualan.
- PARSIAL (SALAH potensial): creditLimit MATI. `grep creditLimit
  src/actions src/lib/hooks src/lib/services` non-test = 0 pemakaian.
  Batas kredit tampil di master tapi tidak pernah menahan/memperingatkan
  SO/Invoice baru — piutang pelanggan over-limit terbit bebas.
- ABSEN: harga grosir bertingkat kuantitas di sisi jual. CustomerPriceList
  tanpa minQty (beda VendorItemPrice schema:479 yang punya minQty);
  diskon hanya satu lapis per baris (SalesOrderItem.discount tunggal).
- ABSEN: target penjualan per sales/periode (`grep SalesTarget|
  targetPenjualan` = 0) — turunan wajar sesudah atribusi sales ada.
- ABSEN: RFQ/penawaran pemasok (`grep rfq|supplierQuotation` = 0);
  PurchaseRequest langsung ke PO tanpa banding harga multi-vendor
  (VendorItemPrice + laporan harga-pemasok sudah ada sebagai bahan).

### Gap

#### F-2026-10-21-016 (d) P1 — Komisi penjualan tidak ada: dokumen tanpa penjual, akun Beban Komisi tak terpakai
- Kompetitor: Accurate komisi otomatis per faktur/kuantitas/target, bisa
  dibagi beberapa sales https://help.accurate.id/product/komisi-penjualan/ ;
  Zahir Multi-Komisi (persen golongan/tabel nilai, jurnal + utang komisi
  otomatis) https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
- Status Silengkap: ABSEN. Bukti: grep di atas; CoA 600002 yatim.
- Relevansi: penjualan part/jasa bengkel lewat sales/admin tertentu;
  komisi manual spreadsheet rawan selisih dan tak tertaut invoice lunas.
- Adaptasi bertahap: (1) `salesEmployeeId` (Employee) di Quotation,
  diwariskan SO→Invoice (snapshot, bukan baca master berjalan);
  (2) read-model rekap komisi informatif: persen per kategori pelanggan
  (setting sederhana) × grandTotal invoice LUNAS per sales per masa —
  label "informatif, bukan utang komisi"; (3) inti jurnal Dr Beban
  Komisi/Cr Utang Komisi hanya sesudah vonis accountant (basis lunas vs
  terbit, pajak atas komisi).
- Modul disentuh: prisma/schema.prisma, src/actions/sales.actions.ts,
  src/lib/reports/ (rekap baru), pengaturan komisi.
- Effort: S atribusi, M rekap, M inti jurnal. Risiko: komisi dihitung
  dari invoice belum lunas → wajib basis status pembayaran; mitigasi
  tahap 2 hanya baca paid.
- Urutan: atribusi → rekap informatif → vonis accountant → jurnal.
- Pemilik usulan: backend; vonis uang: accountant (flag YA untuk tahap 3
  saja; tahap 1-2 TIDAK).

#### F-2026-10-21-017 (d) P1 — Batas kredit pelanggan disimpan tapi tidak pernah ditegakkan (SALAH)
- Kompetitor: Zahir/Accurate standar pasar: peringatan/blokir dokumen
  saat piutang + order baru melewati limit (pola limit di laporan
  piutang-pelanggan Silengkap sendiri sudah menampilkan limit).
- Status Silengkap: SALAH (kontrol mati). Bukti: grep creditLimit
  non-test di actions/hooks/services = 0; Customer.creditLimit schema:309.
- Relevansi: pelanggan fleet/korporat termin panjang; WO besar dikerjakan
  sebelum invoice lama lunas — risiko piutang macet per kendaraan.
- Adaptasi lapis aman: builder read-only paparan kredit per pelanggan
  (piutang terbuka + SO belum tertagih + DP) vs limit, tampil peringatan
  di form SO/Invoice (tidak menahan dokumen). Inti menahan dokumen =
  perubahan perilaku, wajib PUTUSAN team-lead + vonis accountant untuk
  definisi paparan (apakah WO berjalan ikut dihitung).
- Modul disentuh: src/lib/reports/ (builder paparan), form penjualan,
  inti: src/actions/sales.actions.ts.
- Effort: S aman, S-M inti. Risiko: limit 0 = belum diset, JANGAN dibaca
  "tanpa limit" maupun "blokir semua" — tampilkan "limit belum diatur".
- Urutan: builder+peringatan → putusan → gerbang opsional per setting.
- Pemilik usulan: backend (builder), frontend (peringatan). Butuh
  putusan accountant: YA hanya untuk definisi paparan inti.

#### F-2026-10-21-018 (d) P2 — Harga jual bertingkat kuantitas + target penjualan absen
- Kompetitor: Accurate harga grosir per kuantitas + target per sales
  https://help.accurate.id/product/penjualan/ ; Zahir Multi-Price per
  golongan https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
- Status Silengkap: PARSIAL. Bukti: CustomerPriceList tanpa minQty
  (schema:501-518); grep SalesTarget = 0.
- Relevansi: rendah-menengah — penjualan bengkel kebanyakan per job,
  bukan grosir volume; P2 sampai ada pelanggan fleet beli part berulang.
- Adaptasi: tambah minQty ke CustomerPriceList (pola VendorItemPrice)
  + resolusi harga qty-aware di customer-price-list.service.ts; target
  penjualan ditunda sampai F-016 atribusi sales dipakai.
- Effort: S-M. Risiko: harga salah tingkat → mitigasi tampilkan sumber
  harga terpilih di baris invoice.
- Pemilik usulan: backend. Butuh putusan accountant: TIDAK.

### Yang TIDAK diusulkan run ini
- RFQ multi-vendor formal: VendorItemPrice + perbandingan manual cukup
  untuk skala pembelian bengkel sekarang; nilai ulang bila pembelian
  plat/pipa volume besar berulang (P2 masa depan, tanpa ID dulu).
- Portal pelanggan / e-sign quotation: tetap P2 lama, tidak diangkat.

Fokus berikutnya: (e) jadwal bengkel & kapasitas — verifikasi klaim
F-2026-10-20-91 (WorkBay) + F-2026-10-21-012 reservasi terhadap jadwal.


---

## 2026-10-21 10:05 WIB — Domain (e) jadwal bengkel & kapasitas

Rotasi: run sebelumnya (d) penjualan/CRM F-2026-10-21-016..018. Run ini
(e). Berikutnya: (f) garansi & after-sales.

Benchmark resmi (akses 2026-10-21):
- Accurate Manufaktur: Rencana Produksi → Perintah Kerja (tahapan proses)
  → Jadwal Produksi + Monitor Perintah Kerja:
  https://help.accurate.id/product/accurate-online/fitur-aol/manufaktur/perintah-kerja/buat-perintah-kerja/
  dan https://help.accurate.id/product/accurate-online/fitur-aol/manufaktur/rencana-produksi/buat-rencana-produksi/
- Accurate progres SPK dari bahan/tahapan/finishing:
  https://help.accurate.id/product/perintah-kerja/

Catatan status lama: P0-2 run (e) 2026-10-20 (WorkCenter/bay) dan
F-2026-10-20-91/94 (WorkBay + WorkOrder.priority) inti sudah
DITUNDA-TEKNIS oleh PUTUSAN manager — load read-model F-2026-10-20-02
sudah dibangun (work-order-load.ts). Run ini verifikasi + sisa gap,
bukan mengulang usulan yang sama.

### Inventarisasi terverifikasi (2026-10-21, domain e)

Sudah ada:
- Read-model beban WO aktif per status dari ProductionCost aktual
  (work-order-load.ts:1-60 + work-order-load-card.tsx) — label beban,
  bukan kapasitas keras (sesuai PUTUSAN).
- Papan antrean WO (work-order-queue), WorkSchedule/Holiday/Attendance
  SDM, timesheet Project/Task.

Belum ada (bukti grep run ini):
- ABSEN inti (sudah divonis tunda): `grep WorkCenter|WorkBay|bayId`
  schema+src = hanya komentar penundaan (work-order-load.ts:4-10,
  work-order-load-card.tsx:23). WorkOrder tanpa assignedTo/estimatedHours/
  priority/workCenterId; `grep estimatedHours` = 0.
- ABSEN: operasi/routing per WO. WorkOrderItem = baris item/qty/cost/
  status pending (schema WorkOrderItem), bukan operasi; tidak ada
  WorkOrderOperation. Progres WO tidak bisa dibaca per tahap
  (potong→las→finishing→pasang).
- PARSIAL putus: Timesheet wajib projectId, tanpa workOrderId
  (schema Timesheet) — jam aktual teknisi pada WO non-proyek tidak
  tertaut WO; beban aktual per WO hanya dari ProductionCost yang
  ditarik manual (pullLaborCostFromTimesheets jalur Project).

### Gap

#### F-2026-10-21-019 (e) P1 — Timesheet tidak tertaut WorkOrder; jam aktual WO non-proyek hilang
- Kompetitor: Accurate Perintah Kerja mencatat tahapan + biaya produksi
  per SPK https://help.accurate.id/product/accurate-online/fitur-aol/manufaktur/perintah-kerja/buat-perintah-kerja/
- Status Silengkap: PARSIAL. Bukti: schema Timesheet (projectId wajib,
  taskId opsional, tanpa workOrderId); ProductionCost.sourceTimesheetId
  hanya menjembatani timesheet proyek.
- Relevansi: mayoritas job bengkel = WO langsung dari quotation tanpa
  Project; jam las/finishing teknisi tak tercatat per kendaraan → HPP
  labor job ditebak, estimasi-vs-aktual (F-2026-10-21-007) kekurangan
  sisi aktual labor.
- Adaptasi lapis aman: kolom opsional `Timesheet.workOrderId` nullable
  (projectId jadi opsional bersyarat: salah satu project/WO wajib di
  service) + pull labor ke ProductionCost WO dari timesheet WO itu
  (pola existing, tanpa jurnal baru). Tanpa operasi/routing dulu.
- Modul disentuh: prisma/schema.prisma, src/actions (timesheet),
  src/lib/services/production-cost.service.ts, form timesheet.
- Effort: M. Risiko: timesheet ganda tertaut proyek+WO dobel hitung —
  mitigasi service tolak keduanya terisi.
- Urutan: kolom+validasi → pull labor WO → laporan beban aktual vs
  estimasi per WO (makan F-007).
- Pemilik usulan: backend, frontend form. Butuh putusan accountant:
  TIDAK (jalur jurnal ProductionCost existing tidak berubah).

#### F-2026-10-21-020 (e) P1 — Progres tahap WO tidak terbaca (tanpa operasi); janji selesai tanpa dasar beban rencana
- Kompetitor: Accurate progres SPK per tahapan produksi
  https://help.accurate.id/product/perintah-kerja/ ; Jadwal Produksi
  dari Rencana Produksi (URL rencana di atas).
- Status Silengkap: ABSEN operasi, PARSIAL beban aktual (F-02 read-model
  ada). Bukti: WorkOrderItem bukan operasi; grep WorkOrderOperation = 0;
  WorkOrder hanya startDate/endDate bebas.
- Relevansi: pelanggan bertanya "sudah sampai mana" — jawaban lisan;
  keterlambatan baru ketahuan saat endDate lewat.
- Adaptasi bertahap TANPA WorkCenter (hormati PUTUSAN tunda inti):
  (1) tahap ringan: `WorkOrderOperation` minimal (workOrderId, nama tahap
  bebas dari template Product: Potong/Las/Finishing/Rakit/Pasang/QC,
  urutan, status belum/mulai/selesai, startedAt/finishedAt,
  assignedEmployeeId opsional) — BUKAN routing costing, tidak menjurnal;
  progres WO = tahap selesai/total tampil di detail WO + antrean.
  (2) estimatedHours per tahap diisi manual kepala bengkel; papan beban
  rencana = Σ estimatedHours tahap aktif per minggu vs jam kerja
  WorkSchedule (read-only, label rencana bukan kapasitas keras).
  WorkCenter/bay fisik tetap ditunda sampai bukti tahap dipakai.
- Modul disentuh: prisma/schema.prisma, src/actions/manufacturing.actions.ts, detail WO + antrean (frontend), template tahap di Product.
- Effort: M. Risiko: tahap jadi beban input tanpa dipakai — mitigasi
  template otomatis dari Product + status 1-klik; ukur pemakaian 1 bulan
  sebelum usul WorkCenter.
- Urutan: model tahap+template → progres di detail/antrean → beban
  rencana mingguan.
- Pemilik usulan: backend (model), frontend (progres). Butuh putusan
  accountant: TIDAK.

### Yang TIDAK diusulkan run ini
- WorkCenter/bay + finite capacity solver: tetap ditunda-teknis per
  PUTUSAN manager; F-020 sengaja berhenti di tahap tanpa pusat kerja.
- Penjadwalan drag-and-drop kalender: sesudah F-020 data tahap ada.

Fokus berikutnya: (f) garansi & after-sales — verifikasi model
WarrantyRecord (F-2026-10-20-69 ditunda) + odometer terhadap klaim nyata.


---

## 2026-10-21 10:10 WIB — Domain (f) garansi & after-sales

Rotasi: run sebelumnya (e) jadwal F-2026-10-21-019..020. Run ini (f).
Berikutnya: (g) kendaraan & fitment.

Benchmark resmi (akses 2026-10-21):
- Accurate Klaim Pelanggan/garansi dalam alur penjualan (dokumen klaim
  tertaut penjualan): https://help.accurate.id/product/penjualan/
- Zahir: tidak ada modul garansi khusus di daftar fasilitas resmi
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang —
  celah pasar, bukan alasan menunda; dasar perlakuan = PSAK 57/72 (vonis
  accountant F-49 existing).

Status lama: P0-1 run (f) 2026-10-20 + F-2026-10-20-69 inti
WarrantyRecord DITUNDA-TEKNIS per PUTUSAN manager; mesin vonis murni
`decideWarrantyClaimAccounting` sudah dibangun (warranty-accounting.ts,
F-49). Run ini verifikasi ulang + pecah tahap terkecil yang bisa jalan
tanpa membuka inti penuh.

### Inventarisasi terverifikasi (2026-10-21, domain f)

Sudah ada:
- Mesin keputusan akuntansi garansi murni + aturan PSAK 57/72, pemetaan
  akun rekomendasi 510103/2105xx/1108xx (belum dibuat di CoA),
  fail-closed mapping (warranty-accounting.ts:1-60,121).
- Nonconformance/rework internal + biaya rework ke ProductionCost.

Belum ada (bukti grep run ini):
- ABSEN model: `grep WarrantyRecord|WarrantyClaim|WarrantyCoverage
  prisma/schema.prisma` = 0 (tipe TS di service bukan model DB).
  Halaman garansi/klaim = 0 direktori.
- ABSEN odometer: `grep -rni odometer|kilometer|mileage prisma src`
  non-test = 0. Eligibility berbasis km mustahil.
- ABSEN masa garansi per barang: `grep warrantyMonths|warrantyKm` = 0;
  Item/Product tanpa field masa garansi.
- PARSIAL: CrmTicket tanpa customerVehicleId/workOrderId/invoiceId/
  serial (schema CrmTicket) — klaim masuk tiket generik tak tertelusur
  ke kendaraan/part terpasang.

### Gap

#### F-2026-10-21-021 (f) P0 — Garansi pasang tidak tercatat sama sekali; inti ditunda tanpa tahap antara
- Kompetitor: Accurate klaim pelanggan tertaut dokumen penjualan
  https://help.accurate.id/product/penjualan/ ; Zahir tanpa modul
  garansi resmi (di atas) — Silengkap bisa unggul di ceruk ini.
- Status Silengkap: ABSEN dokumen, ADA mesin vonis. Bukti: grep model
  = 0; warranty-accounting.ts:4-8 menyatakan sendiri "inti bila dibuka".
- Relevansi: bumper/rollcage/lift kit gagal lapangan ditangani lisan;
  tak bisa buktikan cakupan/umur/serial; biaya rework tercampur HPP job
  baru; part cacat tak bisa ditagih balik ke supplier. Risiko uang +
  perselisihan pelanggan (definisi P0 SOUL).
- Adaptasi bertahap (pecah dari usulan L lama agar bisa mulai):
  Tahap 1 (M, tanpa jurnal provisi): `Item.warrantyMonths` +
  `CustomerVehicle` tambah kolom odometer terakhir (snapshot saat
  check-in/serah terima di WO); model `WarrantyCoverage` lahir otomatis
  saat WorkOrder completed (customerVehicleId, workOrderId, itemId,
  serialNumber nullable, installedAt, expiresAt = installedAt +
  warrantyMonths, termsSnapshot, status aktif/habis/dicabut).
  Tahap 2 (M): `WarrantyClaim` (coverageId, odometerKm, keluhan, foto
  TransactionAttachment existing, status intake→eligibility→approved/
  rejected→in_repair→closed, repairWorkOrderId) + keputusan memakai
  decideWarrantyClaimAccounting existing — TANPA posting provisi dulu
  (biaya klaim masuk ProductionCost kategori rework WO perbaikan,
  pola Nonconformance). Tahap 3 (jurnal provisi 510103/2105xx):
  hanya sesudah vonis accountant membuka inti F-49 penuh.
- Modul disentuh: prisma/schema.prisma, src/actions/manufacturing.
  actions.ts (auto-create coverage saat complete), halaman produksi/
  garansi (frontend), detail CustomerVehicle.
- Effort: M per tahap. Risiko: eligibility salah tagih — mitigasi
  termsSnapshot + keputusan manual ber-approval, tidak auto-reject.
- Urutan: tahap 1 → 2 → (vonis) 3.
- Pemilik usulan: backend (model), frontend (halaman). Butuh putusan
  accountant: TIDAK untuk tahap 1-2 (tanpa jurnal baru); YA tahap 3.

#### F-2026-10-21-022 (f) P1 — Klaim supplier atas part cacat tidak tertaut garansi pelanggan
- Status Silengkap: ABSEN. Bukti: WarrantyClaim belum ada (F-021);
  PurchaseReturn ada tapi tanpa tautan klaim/serial pelanggan.
- Relevansi: shock/winch cacat diganti gratis ke pelanggan, part lama
  harus kembali ke distributor; tanpa rantai klaim, recovery hilang.
- Adaptasi: sesudah F-021 tahap 2 — field supplierClaimVendorId +
  purchaseReturnId di WarrantyClaim; status recovery mengikuti vonis
  PSAK 57 di warranty-accounting.ts:31-35 (aset hanya bila hampir pasti).
- Effort: S (sesudah F-021). Risiko: jurnal recovery prematur — mitigasi
  tahap ini hanya tautan dokumen, jurnal mengikuti vonis tahap 3.
- Pemilik usulan: backend. Butuh putusan accountant: YA untuk jurnal
  recovery (ditahan tahap 3).

### Yang TIDAK diusulkan run ini
- Provisi garansi otomatis saat invoice terbit: tahap 3, menunggu data
  klaim tahap 1-2 membuktikan estimasi andal (syarat PSAK 57 sendiri).
- Portal klaim pelanggan: P2 lama tetap.

Fokus berikutnya: (g) kendaraan & fitment — verifikasi VehicleFitmentRule
most-specific-wins terhadap konflik aturan + cakupan tahun/drivetrain.


---

## 2026-10-21 10:15 WIB — Domain (g) kendaraan & fitment

Rotasi: run sebelumnya (f) garansi F-2026-10-21-021..022. Run ini (g).
Berikutnya: (h) SDM/payroll.

Benchmark: Accurate/Zahir resmi TIDAK punya fitment kendaraan (modul
generik persediaan/manufaktur). Acuan resmi terdekat = daftar fasilitas
Zahir (tanpa kompatibilitas kendaraan):
https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang dan
Accurate persediaan/manufaktur:
https://accurate.id/online/fitur/persediaan/ . Domain ini keunggulan
niche Silengkap; gap dinilai dari rantai proses internal, bukan
kekalahan benchmark.

### Inventarisasi terverifikasi (2026-10-21, domain g)

Sudah ada (kuat):
- Master katalog VehicleBrand→VehicleModel→VehicleVariant→Vehicle
  (+year) dan CustomerVehicle (plate/chassis/engine, schema:3304-3395).
- `VehicleFitmentRule`: scope brand/model/variant/year/drivetrain/
  transmission + bomRevisionId, result compatible/incompatible/unknown
  (schema:3850). Evaluator most-specific-wins + tie-break id terbaru
  (vehicle-fitment.service.ts:51-95,146-153); checker manual di
  vehicle-fitment.actions.ts:130-144; evaluasi BOM produk
  evaluateProductFitment. Guard yearFrom<=yearTo di create/update.
- Quotation/SO/WO/Project sudah membawa customerVehicleId opsional
  (schema:991,1109,2325,3404).

Belum ada (bukti grep run ini):
- PARSIAL (tidak terhubung): fitment TIDAK pernah dipanggil alur
  transaksi. `grep evaluateFitment|evaluateProductFitment src` di luar
  service/actions-nya sendiri + test = 0 pemanggil di sales.actions/
  manufacturing.actions (WO). Checker berdiri sendiri di halaman
  kendaraan; staf bisa menerbitkan quotation/WO part incompatible tanpa
  peringatan apa pun.
- ABSEN: registri part terpasang per kendaraan. `grep installed
  prisma/schema.prisma` = 0 model InstalledPart; WorkOrderItem tanpa
  serial terpasang per kendaraan. Riwayat "bumper X serial Y terpasang
  di plat Z sejak tanggal T" tidak bisa dijawab — fondasi garansi
  F-2026-10-21-021 tahap 1 + riwayat kendaraan.
- PARSIAL: VehicleVariant membawa drivetrain/transmission, tapi
  CustomerVehicle→Vehicle hanya year lewat Vehicle.year; evaluasi dari
  dokumen harus merangkai variant sendiri — belum ada helper
  configuration-dari-CustomerVehicle (checker menerima ID manual).
- PARSIAL kecil: konflik dua aturan sama-spesifik hasil berlawanan
  diselesaikan diam-diam id terbaru (service:148-153) tanpa peringatan
  konflik saat input; hasil bisa berbalik tanpa jejak niat.

### Gap

#### F-2026-10-21-023 (g) P1 — Fitment tidak menegakkan apa pun di Quotation/WO (checker yatim)
- Kompetitor: tidak ada di Accurate/Zahir resmi (niche) — acuan proses:
  evaluasi compatible/incompatible/unknown yang sudah dibangun PRD
  VEH-06/07 sendiri (vehicle-fitment.service.ts:4-11 menyatakan caller
  "can require technical verification before releasing work").
- Status Silengkap: PARSIAL. Bukti: grep pemanggil transaksi = 0.
- Relevansi: bumper Hilux terbit untuk Ranger tanpa peringatan = revisi
  produksi/rework mahal; seluruh investasi katalog fitment tak bernilai
  operasional.
- Adaptasi lapis aman (peringatan, bukan blokir): helper
  `configurationFromCustomerVehicle(db, customerVehicleId)` (brand/
  model/variant/year/drivetrain/transmission dari rantai master) →
  saat simpan QuotationItem/WO item dengan customerVehicleId terisi,
  panggil evaluateFitment per itemId; hasil incompatible/unknown
  disimpan sebagai snapshot peringatan di baris (fitmentResult,
  fitmentRuleId) + tampil di detail; dokumen tetap terbit. Blokir keras
  = putusan team-lead sesudah data peringatan terbukti dipakai.
- Modul disentuh: src/lib/services/vehicle-fitment.service.ts (helper),
  src/actions/sales.actions.ts, src/actions/manufacturing.actions.ts,
  detail quotation/WO (frontend).
- Effort: M. Risiko: peringatan bising untuk item tanpa aturan (unknown
  massal) — mitigasi hanya tampilkan incompatible sebagai peringatan
  keras, unknown sebagai lencana netral; item jasa dilewati.
- Urutan: helper → snapshot di WO → quotation → evaluasi blokir.
- Pemilik usulan: backend, frontend lencana. Butuh putusan accountant:
  TIDAK.

#### F-2026-10-21-024 (g) P1 — Registri part terpasang per kendaraan absen (fondasi garansi + riwayat)
- Kompetitor: tidak ada di Accurate/Zahir resmi (niche after-sales).
- Status Silengkap: ABSEN. Bukti: grep installed schema = 0.
- Relevansi: inti garansi F-021 butuh tahu part+serial terpasang di
  kendaraan mana; tanpa registri, coverage dibuat dari ingatan WO.
  Juga menjawab riwayat modifikasi per plat saat kendaraan kembali.
- Adaptasi: model `InstalledPart` (customerVehicleId, workOrderId,
  itemId, itemSerialId nullable, qty, installedAt, removedAt nullable,
  status terpasang/dilepas/diganti) terisi otomatis dari MaterialIssue/
  WO completion untuk item bertipe part terpasang (flag Item sederhana
  atau kategori), dilepas saat WO penggantian. Read-model riwayat
  kendaraan = installed aktif + WO selesai per CustomerVehicle.
- Modul disentuh: prisma/schema.prisma, hook material-issue/WO
  completion, detail CustomerVehicle (frontend).
- Effort: M. Risiko: semua item tercatat sebagai terpasang (bising) —
  mitigasi hanya item kategori part utama / berserial / ber-BOM produk.
- Urutan: model+flag → isi dari WO completion → riwayat → makan F-021.
- Pemilik usulan: backend, frontend riwayat. Butuh putusan accountant:
  TIDAK.

#### F-2026-10-21-025 (g) P2 — Konflik aturan fitment sama-spesifik tak terdeteksi saat input
- Status Silengkap: PARSIAL. Bukti: service:148-153 tie-break id.
- Adaptasi: saat create/update aturan, query aturan aktif lain item sama
  dengan scope identik + result berbeda → peringatan "menimpa aturan
  #id" (tetap boleh simpan). Tanpa ubah evaluator.
- Effort: S. Pemilik: backend. Butuh putusan accountant: TIDAK.

### Yang TIDAK diusulkan run ini
- Dekode VIN otomatis / katalog fitment pihak ketiga: master internal
  cukup; tidak ada bukti kebutuhan.
- Blokir keras fitment: ditunda sampai F-023 data peringatan terbukti.

Fokus berikutnya: (h) SDM/payroll — verifikasi overlap gaji-pokok
Employee vs komponen PayrollRun + status SPEC grand design.


---

## 2026-10-21 10:20 WIB — Domain (h) SDM/payroll

Rotasi: run sebelumnya (g) kendaraan F-2026-10-21-023..025. Run ini (h).
Berikutnya: (i) proyek.

Benchmark resmi (akses 2026-10-21):
- Accurate PPh21 otomatis + SPT PPh 21 dari pencatatan gaji (TER PP
  58/2023, hitung ulang Desember):
  https://help.accurate.id/product/accurate-online/fitur-aol/buku-besar/pencatatan-gaji/mencatat-beban-gaji-pph21/
  dan https://help.accurate.id/product/accurate-online/fitur-aol/buku-besar/pencatatan-gaji/catat-gaji-pph21-spt/
- Accurate THR/bonus seperiode gaji + rekonsiliasi Desember:
  https://help.accurate.id/product/accurate-online/fitur-aol/buku-besar/pencatatan-gaji/catat-pph21-bonus-thr/
- Zahir Payroll: Payroll Component (tetap/tidak tetap, kena pajak/tidak)
  + run payroll hitung PPh21/BPJS + slip karyawan:
  https://zahirerp.com/id/all-features-of-zahir-products/
- Regulasi: PP 58/2023 (TER Jan-Nov, tarif progresif Pasal 17 di
  Desember/akhir kerja) — vonis angka tetap accountant, riset hanya
  mencatat kesenjangan metode.

### Inventarisasi terverifikasi (2026-10-21, domain h)

Sudah ada:
- Payroll per karyawan/periode (Payroll statutorySnapshot Json,
  PayrollStatutoryRule berperiode effectiveFrom/To + halaman
  sdm/aturan-statutori), BPJS karyawan + PPh21 metode disetahunkan
  progresif PTKP status/tanggungan (payroll-statutory.service.ts:237-277,
  perilaku fail-closed status tak dikenal didokumentasikan :186-233).
- Employee lengkap NPWP/BPJS/gaji pokok bank (schema:746-798), pinjaman
  karyawan + potong gaji, lembur/cuti/absensi/timesheet. Halaman
  sdm/penggajian + approve/mark-paid.

Belum ada / parsial (bukti grep run ini):
- SALAH vs regulasi berjalan (perlu vonis): PPh21 memakai metode lama
  disetahunkan dari Januari (`computePph21Monthly` gross×12), bukan TER
  PP 58/2023 untuk Jan-Nov + hitung ulang progresif Desember. Header
  service sendiri (:8-10) mengaku "pragmatic approximation" dan backlog
  lama (baris 492 dokumen ini) sudah menulis "PPh 21 tetap domain
  payroll (TER)" — implementasi belum mengikuti. Selisih potong per
  slip kecil per bulan, menumpuk salah setor di Desember.
- ABSEN: komponen gaji terstruktur. `grep PayrollComponent` schema+src
  = 0; Payroll hanya agregat allowances/deductions Decimal tunggal
  (schema Payroll). Tunjangan kena pajak vs tidak, komponen tetap vs
  tidak tetap (pembedaan Zahir di atas) tidak bisa dinyatakan — input
  ulang manual tiap periode, rawan salah klasifikasi pajak.
- ABSEN keluaran SPT: `grep 1721|BuktiPotong|eBupot` reports/services/
  schema = 0. Data Payroll.pph21 per karyawan ada tapi tidak ada rekap
  masa 1721-I/bukti potong tahunan — rekonsiliasi SPT manual spreadsheet.
- PARSIAL: Payroll.type default REGULAR tanpa pemakaian THR terverifikasi
  (`grep THR src/actions/hrm.actions.ts` = 0 di potongan run ini);
  THR/bonus diperlakukan tunjangan generik — dampak PPh21-nya benar
  hanya di metode disetahunkan, ikut salah di skema TER.

### Gap

#### F-2026-10-21-026 (h) P0 — Metode PPh21 masih disetahunkan lama, bukan TER PP 58/2023 + hitung ulang Desember (SALAH)
- Kompetitor/regulasi: Accurate TER otomatis + SPT
  https://help.accurate.id/product/accurate-online/fitur-aol/buku-besar/pencatatan-gaji/catat-gaji-pph21-spt/ ;
  PP 58/2023 (TER kategori A/B/C dari status PTKP, Desember tarif
  Pasal 17 atas penghasilan setahun dikurangi potongan Jan-Nov).
- Status Silengkap: SALAH metode. Bukti: payroll-statutory.service.ts:
  8-10,237-277; grep TER di service/actions = 0.
- Relevansi: potongan tiap slip karyawan salah basis sejak 2024;
  perusahaan menanggung kurang/lebih setor + koreksi Desember manual.
  Risiko pajak = P0 per definisi SOUL (salah hitung pajak).
- Adaptasi: VONIS accountant dulu (kategori TER dari maritalStatus+
  dependents existing, perlakuan penghasilan tidak teratur, bulan
  masuk/keluar tengah tahun). Implementasi: tambah metode `ter` di
  PayrollStatutoryRule (tabel TER per kategori sebagai rule berperiode,
  bukan konstanta kode), computePph21Ter(grossMonthly, kategori) untuk
  Jan-Nov; Desember panggil hitung progresif tahunan existing dikurangi
  akumulasi pph21 Jan-Nov karyawan (data Payroll per periode sudah ada).
  Slip lama tidak dihitung ulang diam-diam — berlaku periode baru.
- Modul disentuh: src/lib/services/payroll-statutory.service.ts,
  src/app/(dashboard)/sdm/aturan-statutori (isi tabel TER), generate
  payroll di hrm.actions.ts.
- Effort: M (sesudah vonis). Risiko: kategori salah dari status teks
  bebas — mitigasi pakai ptkpFor/fail-closed existing untuk memetakan
  kategori, slip tampilkan kategori TER terpilih.
- Urutan: vonis → tabel TER+Jan-Nov → Desember hitung ulang → uji
  banding 3 profil gaji vs kalkulator DJP.
- Pemilik usulan: accountant (vonis WAJIB), backend (implementasi).

#### F-2026-10-21-027 (h) P1 — Komponen gaji terstruktur absen; tunjangan/potongan hanya agregat bebas
- Kompetitor: Zahir Payroll Component tetap/tidak tetap + kena pajak
  https://zahirerp.com/id/all-features-of-zahir-products/ ; Accurate
  Gaji/Tunjangan per jenis + akun penampung (URL pencatatan gaji di atas).
- Status Silengkap: ABSEN. Bukti: grep PayrollComponent = 0; Payroll.
  allowances/deductions agregat schema.
- Relevansi: tunjangan transport (kena pajak) vs reimbursement (tidak)
  tercampur satu angka; THR sulit dibedakan; kesalahan klasifikasi
  mengalir ke PPh21 F-026.
- Adaptasi: model `PayrollComponent` (nama, jenis earning/deduction,
  isTaxable, isFixed, accountId nullable untuk tahap jurnal) +
  `PayrollComponentLine` per Payroll (componentId, amount) menggantikan
  input agregat bertahap: generate payroll menarik komponen tetap
  karyawan (`EmployeeComponent` amount default), agregat lama tetap
  diisi dari jumlah baris agar laporan lama tidak pecah.
- Modul disentuh: prisma/schema.prisma, src/actions/hrm.actions.ts,
  halaman sdm (master komponen + generate). Jurnal per komponen =
  tahap sesudah vonis pemetaan akun accountant.
- Effort: M-L. Risiko: migrasi riwayat — mitigasi baris agregat historis
  tidak dipecah mundur.
- Pemilik usulan: backend, frontend. Butuh putusan accountant: YA hanya
  pemetaan akun jurnal per komponen; struktur data TIDAK.

#### F-2026-10-21-028 (h) P2 — Rekap SPT PPh21 masa/tahunan dari data payroll absen
- Kompetitor: Accurate Laporan SPT PPh Ps.21 per periode dari catatan
  gaji https://help.accurate.id/product/accurate-online/fitur-aol/buku-besar/pencatatan-gaji/catat-gaji-pph21-spt/
- Status Silengkap: ABSEN keluaran, ADA data. Bukti: grep 1721 = 0;
  Payroll.pph21 per karyawan/periode tersimpan + statutorySnapshot.
- Relevansi: beban admin bulanan; nilai rekap harus cocok slip —
  sesudah F-026 metode benar, rekap hanya agregasi baca.
- Adaptasi: read-model rekap masa (per periode: jumlah karyawan, bruto,
  PPh21 terpotong dari Payroll approved/paid) + rekap tahunan per
  karyawan (total bruto/PPh21 untuk bukti potong manual). Format file
  e-Bupot impor DJP = tahap sesudah vonis format accountant.
- Effort: S rekap, M ekspor. Pemilik: backend. Butuh putusan accountant:
  YA untuk format ekspor; rekap baca TIDAK.

### Yang TIDAK diusulkan run ini
- SPEC grand design payroll utuh (F-065 lama): tetap ditahan; F-026/027
  sengaja irisan terkecil yang menutup salah hitung berjalan.
- Slip gaji portal karyawan / absensi biometrik: tidak ada bukti gap.

Fokus berikutnya: (i) proyek — verifikasi klaim retrofit ProjectCost
lifetime (F-2026-10-20-102 patch) + RAB-vs-aktual per tahap.


---

## 2026-10-21 10:30 WIB — Domain (i) proyek

Rotasi: run sebelumnya (h) SDM/payroll F-2026-10-21-026..028. Run ini
(i). Berikutnya: (j) laporan & BI.

Benchmark resmi (akses 2026-10-21):
- Zahir proyek multi-fase: anggaran biaya + pendapatan per fase,
  transaksi diarahkan per fase, laporan anggaran vs realisasi per fase:
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
  dan https://help.zahironline.com/portal/id/kb/articles/memasukkan-data-proye
- Zahir Laba Rugi Per Proyek Realisasi vs Anggaran (varians per proyek,
  deteksi cost overrun):
  https://zahirerp.com/id/all-features-of-zahir-products/
- Accurate anggaran proyek general vs kontraktor (RAB material terkait
  stok) + laporan anggaran dan biaya aktual: acuan sekunder partner
  resmi https://www.acisindonesia.com/cara-membuat-anggaran-di-accurate/
  (halaman help.accurate.id anggaran proyek perlu cek ulang bila
  dikutip lebih dalam).

### Inventarisasi terverifikasi (2026-10-21, origin/main 98bef9ac)

Sudah ada:
- Project + ProjectStage (+ProjectStageProgress persen) + ProjectItem
  (qty×cost) + ProjectLog (schema origin/main:3398-3470). Tahap dibuat
  otomatis dari setting defaultProjectStages (project.actions.ts:174-212).
- Laporan Laba Rugi per Proyek read-model ADA
  (laporan/laba-rugi-proyek page.tsx:34-113): pendapatan invoice
  ber-projectId (subtotal−diskon), material MaterialIssue completed,
  Expense approved, PettyCash OUT, VendorBill confirmed+ — per proyek,
  per periode.
- Biaya sumber kaya tapi tersebar: ProductionCost per WorkOrder
  (schema:2282-2320, kategori labor/machine/overhead/subcontract/
  rework), Timesheet wajib projectId (schema:2669-2691), WO membawa
  projectId (schema:2330).

Belum ada / parsial (bukti grep run ini):
- ABSEN anggaran/RAB resmi: Project tanpa budgetAmount/contractAmount;
  ProjectItem (schema:3438-3450) hanya qty+cost tanpa kategori/tahap —
  ia daftar material longgar, bukan RAB yang dikunci. Detail proyek
  membandingkan grandTotal SEMUA quotation pelanggan (bukan proyek)
  vs Σ ProjectItem dan menyebutnya margin proyek
  (proyek/[slug]/page.tsx, baca run ini) — SALAH cakupan: quotation
  pelanggan lain ikut terhitung, biaya aktual tidak dipakai.
- SALAH cakupan laporan: L/R proyek tidak memasukkan ProductionCost
  dari WO ber-projectId (labor/overhead/subcontract/rework) dan tidak
  memasukkan labor Timesheet yang belum ditarik ke ProductionCost —
  HPP proyek understated persis di komponen upah bengkel terbesar.
  Bukti: page.tsx:34-93 hanya 5 sumber di atas; grep productionCost di
  file itu = 0 baris hasil query.
- ABSEN dimensi tahap pada biaya: tidak ada FK projectStageId di
  MaterialIssue/Expense/PettyCash/VendorBill/ProductionCost/Timesheet
  (grep projectStageId schema hanya ProjectStageProgress:3474) —
  anggaran vs realisasi PER FASE ala Zahir mustahil; progres tahap
  persen fisik berdiri sendiri tanpa uang.
- PARSIAL rantai pendapatan: Quotation.projectId ada (schema Quotation),
  tapi detail proyek mengambil quotation per customerId (bukan
  projectId) take 10 — kontrak proyek tidak tertaut tegas.

### Gap

#### F-2026-10-21-029 (i) P0 — Laba/rugi proyek salah cakupan: labor WO dan timesheet tidak terhitung, quotation pelanggan tercampur (SALAH)
- Kompetitor: Zahir L/R proyek dari transaksi teralokasi proyek
  https://help.zahironline.com/portal/id/kb/articles/memasukkan-data-proye
- Status Silengkap: SALAH (parsial sumber). Bukti: daftar 5 query
  laba-rugi-proyek page.tsx:34-93 tanpa ProductionCost/Timesheet;
  detail proyek totalQuotation per customerId.
- Relevansi: margin proyek yang terlihat selalu lebih bagus dari nyata
  (upah las/pasang tak terhitung) → harga job berikutnya ditetapkan
  dari margin semu; proyek rugi terbaca untung. Risiko uang langsung.
- Adaptasi bertahap TANPA jurnal baru: (1) read-model builder tunggal
  `project-pl-data` (pola *-data.ts existing) dipakai laporan DAN
  detail proyek: pendapatan = SalesInvoice.projectId langsung +
  jembatan WO (invoice tanpa projectId tapi quotation/WO tertaut —
  pola job-billing-summary-data.ts:126-151 existing, dedup per id);
  biaya = MaterialIssue langsung + ProductionCost via WorkOrder.
  projectId (amount snapshot, termasuk labor hasil pull timesheet) +
  Expense/PettyCash/VendorBill existing; Timesheet yang BELUM ditarik
  ditampilkan sebagai baris memo "labor belum ditarik" (jam saja, tanpa
  rupiah ditebak) agar tidak dobel dengan ProductionCost.
  (2) detail proyek berhenti memakai quotation-per-pelanggan: tampilkan
  kontrak = quotation ber-projectId + invoice builder sama.
- Modul disentuh: src/lib/reports/project-pl-data.ts (baru),
  src/app/(dashboard)/laporan/laba-rugi-proyek/[[...segments]]/page.tsx,
  src/app/(dashboard)/proyek/[slug]/page.tsx.
- Effort: M. Risiko: dobel hitung invoice langsung + jembatan — mitigasi
  dedup per invoice id seperti pola existing; ProductionCost purchaseOrder
  vs VendorBill proyek berpotensi tumpang tindih — mitigasi VendorBill
  hanya yang tanpa purchaseOrderId tertaut ProductionCost (atau label
  terpisah subkontrak-non-WO), wajib uji fixture.
- Urutan: builder+tes fixture → laporan pakai builder → detail proyek.
- Pemilik usulan: backend (builder), frontend (detail). Butuh putusan
  accountant: TIDAK (agregasi baca dokumen existing; definisi pendapatan
  subtotal−diskon dipertahankan apa adanya).

#### F-2026-10-21-030 (i) P1 — Anggaran/RAB per proyek & per tahap absen; ProjectItem bukan anggaran terkunci
- Kompetitor: Zahir anggaran per fase + realisasi per fase
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang ;
  Accurate RAB kontraktor (material-stok)
  https://www.acisindonesia.com/cara-membuat-anggaran-di-accurate/
- Status Silengkap: ABSEN. Bukti: ProjectItem schema:3438-3450 tanpa
  tahap/kategori/versi; Project tanpa nilai kontrak/anggaran.
- Relevansi: tanpa anggaran, F-029 hanya melaporkan masa lalu; overrun
  ketahuan sesudah proyek selesai. Proyek custom besar (armoring,
  ekspedisi build) paling terpapar.
- Adaptasi bertahap: (1) `Project.contractAmount` snapshot nilai kontrak
  disetujui (diisi dari quotation ber-projectId terpilih, bukan hitung
  ulang berjalan) + `ProjectItem.projectStageId` nullable +
  `ProjectItem.category` (material/labor/subkontrak/lain) — ProjectItem
  menjadi RAB per tahap; status anggaran dikunci saat proyek mulai
  (field budgetLockedAt), perubahan sesudahnya = revisi tercatat
  ProjectLog existing. (2) laporan anggaran vs realisasi per tahap:
  anggaran ProjectItem per tahap vs realisasi F-029 yang diberi
  projectStageId opsional di MaterialIssue/Expense (tahap lain menyusul
  bertahap; tanpa tahap = baris "belum dialokasi").
- Modul disentuh: prisma/schema.prisma, src/actions/project.actions.ts,
  halaman proyek (frontend), builder F-029.
- Effort: M-L. Risiko: RAB diedit mundur menyembunyikan overrun —
  mitigasi budgetLockedAt + log revisi; realisasi tanpa tahap menumpuk
  di belum-dialokasi — tampilkan eksplisit, jangan dibagi rata.
- Urutan: sesudah F-029 builder stabil.
- Pemilik usulan: backend, frontend. Butuh putusan accountant: TIDAK
  (anggaran operasional, bukan jurnal).

#### F-2026-10-21-031 (i) P2 — Progres fisik tahap tidak terhubung uang (earned value sederhana absen)
- Status Silengkap: PARSIAL. Bukti: ProjectStageProgress persen ada;
  tanpa bobot anggaran per tahap, % selesai proyek = rerata persen
  tahap sama rata (detail proyek membagi rata stages).
- Adaptasi: sesudah F-030 — bobot tahap = anggaran tahap/total; progres
  tertimbang + SPI/CPI sederhana read-only di detail proyek.
- Effort: S (sesudah F-030). Pemilik: backend/frontend. Butuh putusan
  accountant: TIDAK. Ditunda sampai F-030 terbukti dipakai.

### Yang TIDAK diusulkan run ini
- Alokasi jurnal per proyek di GL (dimensi projectId di JournalEntry):
  pola Zahir menag transaksi, Silengkap L/R proyek read-model cukup
  untuk skala ini; nilai ulang bila L/R proyek wajib rekonsiliasi GL.
- Gantt proyek: tanpa bukti kebutuhan sesudah tahap existing.

Fokus berikutnya: (j) laporan & BI — audit registry laporan vs
kebutuhan keputusan (kas, margin per kendaraan, WIP aging) lalu tutup
rotasi a-j + rekap status P0 lintas domain.


---

## 2026-10-21 11:32 WIB — Domain (j) laporan & BI + tutup rotasi a–j

Rotasi: run sebelumnya (i) proyek F-2026-10-21-029..031. Run ini (j),
run penutup rotasi a–j. Berikutnya: antrean implementasi per vonis
Lead-Arch di board, bukan domain baru.

Benchmark resmi (akses 2026-10-21):
- Accurate Daftar Laporan + ekspor Excel/PDF/CSV + drill-down ke detail:
  https://help.accurate.id/product/daftar-laporan/ ,
  https://accurate.id/online/fitur/laporan-keuangan/
- Zahir Ekspor Laporan (PDF/Excel, kirim email) + Laporan Bisa Diklik
  (telusur sampai buku besar/jurnal):
  https://www.zahironline.com/fitur-lengkap-zahir/

### Inventarisasi terverifikasi (2026-10-21, domain j)

Sudah ada (TERVERIFIKASI-KODE, worktree origin/main 032eb3bf):
- 77 halaman `/laporan/*`; registry ekspor PDF 60 kunci
  (`report-registry.ts`), katalog 76 href (`report-catalog.ts:222`),
  navigasi 76 href (`navigation.ts:225-273`). Tiga kebutuhan keputusan
  yang disebut fokus run ini SEMUA sudah ada: proyeksi kas
  (`cash-projection.ts` + memo komitmen F-2026-10-20-48(b)), umur WIP
  berjalan (`wip-aging*.ts`, F-2026-10-20-72), riwayat per kendaraan
  (`customer-vehicle-history-data.ts` 5 sumber).
- 18 halaman tanpa kunci registry BUKAN gap: halaman standalone/
  keluarga (neraca, keuangan, proyeksi-kas, laba-rugi-proyek, dst.)
  yang memang tidak lewat jalur ekspor registry — terverifikasi dari
  struktur `ReportStandaloneEntry` (`report-catalog.ts:43-50`).

Belum ada / parsial (bukti grep run ini):
- ABSEN margin per kendaraan sebagai laporan keputusan: riwayat
  kendaraan = daftar dokumen, tanpa agregat pendapatan-vs-biaya per
  unit; margin per job baru terbaca sesudah F-029 (proyek) beres dan
  belum digulirkan ke dimensi kendaraan.
- ABSEN customer statement: `grep "customer statement|statement
  pelanggan"` di src/lib/reports + halaman laporan = 0; piutang
  terbaca per faktur (`piutang-pelanggan`, `customer-receivables.ts`)
  tanpa dokumen mutasi saldo berjalan per pelanggan untuk dikirim.
- ABSEN jadwal/kirim laporan berkala: grep jadwal-laporan/email-
  laporan = 0 di luar transaksi-berulang (bukan laporan).

### Gap

#### F-2026-10-21-032 (j) P1 — Customer statement (mutasi piutang per pelanggan) absen
- Kompetitor: Accurate riwayat transaksi per pelanggan dari fitur
  Pelanggan https://help.accurate.id/product/accurate-online/fitur-aol/penjualan/mengenal-fitur-pelanggan/
- Status Silengkap: ABSEN. Bukti: grep di atas = 0; laporan piutang
  existing per-faktur tanpa saldo awal + mutasi + saldo berjalan.
- Relevansi: penagihan ke pelanggan bengkel (fleet/kantor) butuh satu
  dokumen rekap per periode; hari ini staf menyusun manual dari
  daftar faktur — rawan selisih dengan `paidAmount` berjalan.
- Adaptasi (read-model murni, tanpa migrasi): builder
  `customer-statement-data.ts` — saldo awal dari faktur+ pembayaran
  sebelum periode; baris periode = invoice terbit (Dr) + SalesPayment
  + CustomerCredit teralokasi (Cr) dengan saldo berjalan; hanya
  dokumen non-cancelled (pola `collectQuotationInvoices` existing);
  tampilkan per pelanggan + ekspor lewat registry existing.
- Modul disentuh: src/lib/reports/customer-statement*.ts (baru),
  halaman `/laporan/statement-pelanggan` (frontend), registry.
- Effort: M. Risiko: dobel hitung kredit vs payment — mitigasi
  fixture: kredit teralokasi tampil sebagai baris sendiri, bukan
  payment; uji saldo akhir = outstanding `customer-receivables.ts`.
- Pemilik usulan: backend (builder), frontend (halaman). Butuh
  putusan accountant: TIDAK (agregasi baca; definisi outstanding
  mengikuti read-model piutang existing).

#### F-2026-10-21-033 (j) P2 — Margin per kendaraan menunggu F-029; jangan bangun jalur kedua
- Status Silengkap: PARSIAL (riwayat dokumen ada, agregat margin
  tidak). Bukti: `customer-vehicle-history-data.ts:4-8` merangkai 5
  sumber tanpa total pendapatan/biaya per kendaraan.
- Adaptasi: SESUDAH builder F-2026-10-21-029 (`project-pl-data`)
  terbukti — gulirkan agregat yang sama per `customerVehicleId`
  (invoice via WO/quotation tertaut kendaraan + biaya MaterialIssue/
  ProductionCost via WO kendaraan); label tegas "margin job
  kendaraan", BUKAN laba akuntansi. Dilarang builder paralel sebelum
  F-029 stabil (sumber nilai tunggal).
- Effort: S (sesudah F-029). Pemilik: backend. Butuh putusan
  accountant: TIDAK. Ditunda-teknis sampai F-029 merged.

### Rekap P0 lintas domain (tutup rotasi a–j, status 2026-10-21 11:32)

| ID | Domain | Isi | Status jalur |
|---|---|---|---|
| F-2026-10-20-103 | (c) | Change order WO tanpa dokumen | inti ditahan vonis Salsa 22:38 (batas build jelas) |
| F-2026-10-21-011 | (c) | Lot kedaluwarsa lolos 4/5 jalur keluar | LAPIS AMAN MERGED PR #279 |
| F-2026-10-21-021 | (f) | Garansi pasang tak tercatat | tahap 1-2 siap tanpa vonis, belum dibangun |
| F-2026-10-21-026 | (h) | PPh21 pra-TER PP 58/2023 (SALAH) | BUTUH-VONIS accountant — angka final bukan milik Bot 5 |
| F-2026-10-21-029 | (i) | L/R proyek salah cakupan (SALAH) | read-model, tanpa vonis, belum dibangun |

Aturan keras terkonfirmasi ulang run ini: tidak ada P0 baru dari
domain (j); tiga kebutuhan keputusan fokus (j) sudah terlayani
laporan existing — gap nyata hanya statement (F-032) dan guliran
margin kendaraan (F-033, tergantung F-029).

### Yang TIDAK diusulkan run ini
- Laporan terjadwal terkirim email (Zahir bisa): tanpa bukti
  kebutuhan pemilik proses; catat sebagai USULAN tertunda, bukan gap.
- Dashboard BI/grafik baru: dashboard existing + grafik-keuangan
  cukup; menambah grafik tanpa keputusan yang dilayani = YAGNI.
- Registry untuk 18 halaman standalone: struktur katalog memang
  membedakan standalone vs registry — bukan inkonsistensi.

Fokus berikutnya: antrean implementasi — F-032 builder (backend),
label "Minimum masih global" F-013 (frontend, vonis Lead-Arch
12:05), vonis F-026 (accountant). Rotasi a–j DITUTUP run ini.


---

## VONIS ACCOUNTANT 2026-10-21 — F-2026-10-21-026 (FINAL)

Pemutus: `accounting-finance-tax` (BOT 4). Sifat: FINAL untuk angka/metode
PPh21; backend eksekusi mesin/Prisma/API, frontend tampil slip apa
adanya (tidak hitung ulang). Bukti repo live di `origin/main` 313ac37c:
`src/lib/services/payroll-statutory.service.ts:8-10,237-277`
`computePph21Monthly` masih metode disetahunkan ((bruto×12 − biaya
jabatan − BPJS×12 − PTKP) × tarif Pasal 17 / 12, `Math.floor`); grep
TER di service/actions = 0. `Employee.maritalStatus String?` +
`Employee.dependents Int @default(0)` (schema:770-771); `Payroll.period
String`, `Payroll.pph21 Decimal(15,2)`, `statutorySnapshot Json?`,
`@@unique([employeeId, period])` (schema:2597-2635) — agregasi tahunan
per karyawan SUDAH dapat diturunkan dari baris Payroll, tanpa model
baru. Tiga jalur hitung berjalan `hrm.actions.ts:134,604,990` semua
memanggil fungsi lama yang sama.

Sumber resmi (akses 2026-10-21):
- PP 58/2023 Pasal 2 ayat (1)-(6), Pasal 5 (berlaku 1 Januari 2024) +
  Lampiran A/B/C/D. Teks resmi:
  https://jdih.kemenkeu.go.id/api/download/e47c3fc4-a912-4bf1-bcad-335fee3f71f8/2023pp058.pdf
  dan https://www.jdih.kemenkeu.go.id/dok/pp-58-tahun-2023/view
- PMK 168/2023 Pasal 1 angka 17-18 (definisi Masa Pajak Terakhir),
  Pasal 5 ayat (1) huruf a + ayat (3), Pasal 8, Pasal 9 ayat (2),(4),
  Pasal 10, Pasal 13, Pasal 15, Pasal 21. Teks resmi:
  https://jdih.kemenkeu.go.id/api/download/e60a82e0-b218-40f5-9d18-b924aa1e11ce/2023pmkeuangan168.pdf
  Ringkasan DJP: https://pajak.go.id/id/pmk-168-tahun-2023-pph-pasal-21-ter
- Benchmark produk (bukan dasar hukum): Accurate pencatatan gaji PPh21
  https://help.accurate.id/product/accurate-online/fitur-aol/buku-besar/pencatatan-gaji/catat-gaji-pph21-spt/

### Keputusan inti (mengikat, bukan opsi)

Metode disetahunkan di `computePph21Monthly` DINYATAKAN SALAH untuk
semua slip masa pajak ≥ titik berlaku di §5 dan WAJIB diganti skema
dua-lapis PP 58/2023 + PMK 168/2023:

1. Masa pajak SELAIN masa pajak terakhir: PPh21 = penghasilan bruto
   satu masa pajak × TER bulanan kategori A/B/C (PP 58/2023 Pasal 2
   ayat (2) huruf a, ayat (4)-(5); PMK 168/2023 Pasal 15 ayat (1)
   huruf a). TANPA kurang biaya jabatan/BPJS/PTKP di lapisan ini —
   ketiganya sudah terinternalisasi dalam tabel TER (Penjelasan
   PP 58/2023 Pasal 2 ayat (2) huruf a).
2. Masa pajak TERAKHIR: hitung ulang tarif Pasal 17 ayat (1) huruf a
   UU PPh atas penghasilan kena pajak 1 tahun pajak / bagian tahun
   pajak, dikurangi Σ PPh21 terpotong masa-masa sebelumnya dalam
   tahun pajak yang sama (PMK 168/2023 Pasal 15 ayat (1) huruf b,
   ayat (2)). Mesin progresif tahunan existing BOLEH dipakai ulang
   hanya sebagai sub-fungsi hitung-ulang ini, dengan koreksi §4.

### 1. Pemetaan kategori TER dari field existing

Dasar: PP 58/2023 Pasal 2 ayat (3)-(4) — kategori ditentukan status
PTKP (status kawin + jumlah tanggungan) pada AWAL tahun pajak
(menguat: PMK 168/2023 Pasal 9 ayat (4)).

| Status PTKP | Kategori TER |
|---|---|
| TK/0, TK/1, K/0 | A |
| TK/2, TK/3, K/1, K/2 | B |
| K/3 | C |

Pemetaan dari data berjalan (tanpa field baru, tanpa migrasi):
- Kawin/tidak: `isMarriedStatus(maritalStatus)` existing
  (payroll-statutory.service.ts:193-234) DIPAKAI ULANG apa adanya —
  termasuk penjaga negasi "Belum Kawin"/"Tidak Kawin"/"Cerai" yang
  sudah teruji. Dilarang menulis parser status kedua.
- Tanggungan: `dependents` di-clamp `min(3, max(0, floor))` persis
  `ptkpFor` existing (baris 189). `dependents > 3` → 3, BUKAN error.
- Kategori = fungsi murni (married, dep): (false,0|1)→A; (false,2|3)→B;
  (true,0)→A; (true,1|2)→B; (true,3)→C.
- Status tidak dikenal/null/kosong: fail-closed existing dipertahankan
  (diperlakukan TK/0 → kategori A). Alasan: kategori A = potongan
  tertinggi untuk bruto sama, jadi default ini tidak pernah
  kurang-potong; tampilkan status mentah di snapshot agar HR dapat
  memperbaiki master. DILARANG memperlebar ke B/C berdasar tebakan.
- Kode kanonik `K/1`..`K/3`/`TK/n` pada `maritalStatus`: bila angka
  pada kode dan kolom `dependents` berbeda, KOLOM `dependents`
  MENANG (satu-satunya sumber hitung terstruktur); kode hanya penentu
  kawin. Selisih dicatat di snapshot sebagai peringatan data, bukan
  ditolak.
- Kategori dibekukan di `statutorySnapshot` tiap slip (kategori,
  status mentah, dependents ter-clamp, tarif TER terpilih, batas
  bracket, versi/efektif tabel). Perubahan status tengah tahun TIDAK
  mengubah kategori slip berjalan: kategori berlaku sejak masa pajak
  Januari tahun berjalan; status baru berlaku untuk kategori mulai
  Januari tahun berikutnya (Pasal 9 ayat (4) PMK 168/2023), kecuali
  karyawan baru masuk — kategori dari status pada awal bulan ia
  mulai bekerja (Pasal 9 ayat (5) diterapkan analog untuk pegawai
  baru di pemberi kerja ini). Perubahan status tetap memengaruhi
  PTKP hitung-ulang masa terakhir hanya bila status pada awal tahun
  memang demikian; koreksi status retroaktif = kasus §4 butir e.
- Cakupan subjek vonis ini: pegawai tetap penerima penghasilan
  bulanan. TER harian pegawai tidak tetap, bukan-pegawai 50% × Pasal
  17, dan peserta kegiatan (PMK 168/2023 Pasal 16) secara eksplisit
  DI LUAR vonis ini — jangan dicampur ke fungsi TER bulanan.

### 2. Penghasilan tidak teratur (bonus/THR/jasa produksi/tantiem)

Dasar: PMK 168/2023 Pasal 5 ayat (1) huruf a jo. ayat (3) huruf b —
bonus, THR, jasa produksi, tantiem, gratifikasi, premi, dan
penghasilan tidak teratur lain adalah penghasilan pegawai tetap.

- Masa selain masa terakhir: penghasilan tidak teratur DIGABUNG ke
  penghasilan bruto masa pajak bulan diterimanya, lalu seluruh bruto
  bulan itu × TER kategori karyawan (satu tarif atas total bruto,
  BUKAN tarif terpisah per komponen, BUKAN dirata-rata 12 bulan).
  Contoh mengikat DJP (sosialisasi PP 58/2023): bulan terima THR
  melonjak bracket TER — itu benar dan disengaja; penyeimbang
  satu-satunya adalah hitung ulang masa terakhir, bukan perataan.
- `Payroll.type` (REGULAR/THR/dll) TIDAK mengubah metode: slip THR
  terpisah pada bulan yang sama dengan slip reguler wajib
  diagregasi dulu bruto + PPh21-nya sebagai SATU masa pajak sebelum
  tarif dipilih. Memotong slip secara terpisah-pisah dengan tarif
  masing-masing = SALAH (melanggar definisi bruto satu masa pajak,
  Penjelasan PP 58/2023 Pasal 2 ayat (5)-(6)). Bila urutan terbit
  membuat slip pertama sudah terpotong sebelum slip kedua terbit,
  slip kedua memotong SELISIH: (bruto gabungan × TER) − PPh21 yang
  sudah dipotong pada masa yang sama. Penjaga ini wajib tes (§6 T7).
- Natura/kenikmatan kena pajak dan premi/iuran dibayar pemberi kerja
  yang termasuk Pasal 5 ayat (3) huruf d-f ikut bruto bila sudah
  masuk angka bruto slip; klasifikasi komponen kena/tidak kena pajak
  = wilayah F-027, vonis ini tidak memutus pemetaan komponen —
  fungsi TER hanya menerima satu angka: bruto masa pajak final.
- Di masa terakhir, seluruh penghasilan tidak teratur tahun itu ikut
  bruto tahunan hitung ulang §4 tanpa perlakuan khusus.

### 3. Karyawan masuk / keluar tengah tahun

Definisi mengikat: Masa Pajak Terakhir = masa Desember, ATAU masa
tertentu saat pegawai tetap berhenti bekerja (PMK 168/2023 Pasal 1
angka 18). Jadi "Desember" di seluruh vonis ini dibaca "masa pajak
terakhir".

a. Masuk tengah tahun (mulai bekerja setelah Januari, termasuk
   kewajiban subjektif baru mulai setelah Januari):
   - Bulan pertama s.d. bulan sebelum masa terakhir: TER bulanan
     biasa atas bruto bulan berjalan (kategori dari status pada awal
     bulan mulai bekerja, §1). TIDAK ada annualisasi, TIDAK ada
     prorata PTKP di lapisan TER.
   - Masa terakhirnya: hitung ulang Pasal 17 dengan aturan bagian
     tahun pajak PMK 168/2023 Pasal 15 ayat (3): penghasilan neto
     bagian tahun DISETAHUNKAN (neto bagian ÷ jumlah bulan bagian ×
     12), PTKP PENUH setahun (tidak diprorata), tarif Pasal 17 atas
     PKP disetahunkan (dibulatkan ke bawah ribuan penuh, Pasal 8
     ayat (4)), lalu pajak bagian tahun = pajak disetahunkan ×
     (jumlah bulan bagian ÷ 12). Kurangi Σ terpotong sebelumnya.
   - Penghasilan dari pemberi kerja SEBELUMNYA pada tahun yang sama
     TIDAK ikut hitung ulang di sistem ini (tidak ada datanya dan
     bukan kewajiban pemberi kerja baru tanpa bukti potong yang
     diserahkan); karyawan mengkreditkan di SPT Tahunannya. Sistem
     DILARANG mengasumsikan nihil-di-tempat-lain di UI/laporan —
     snapshot masa terakhir mencatat `priorEmployerIncomeIncluded:
     false`.
b. Keluar tengah tahun (berhenti sebelum Desember):
   - Bulan berhenti = masa pajak terakhir bagi karyawan itu: pada
     slip finalnya lakukan hitung ulang Pasal 17 persis butir (a)
     di atas atas bagian tahun Januari–bulan berhenti (atau sejak
     bulan masuk bila masuk tengah tahun juga), kurangi Σ terpotong
     masa sebelumnya di tahun yang sama.
   - Slip final WAJIB ditandai eksplisit sebagai masa terakhir
     (penanda terstruktur di snapshot, mis. `isFinalTaxPeriod: true`
     + alasan `resign`), bukan disimpulkan diam-diam dari
     `Employee.isActive` — karyawan nonaktif karena cuti/data belum
     lengkap tidak boleh memicu hitung ulang. Penanda diisi aksi
     yang menerbitkan slip final; backend menentukan mekanismenya,
     semantiknya mengikat: satu karyawan satu tahun pajak hanya
     boleh punya SATU masa terakhir; hitung ulang kedua ditolak.
   - Tanggal berhenti aktual menentukan bulan bagian; karyawan yang
     berhenti tetapi slip final terbit bulan berikutnya: masa
     terakhir = masa bulan terutangnya slip final tersebut, jumlah
     bulan bagian dihitung dari bulan berpenghasilan pertama s.d.
     bulan berhenti bekerja. Bila ragu antara dua bulan, hentikan
     dan eskalasi ke BOT 4 — jangan tebak.
   - Karyawan keluar lalu masuk kembali tahun yang sama di pemberi
     kerja sama: masa terakhir final yang sudah terbit TIDAK dibuka
     lagi; penghasilan sesudah masuk kembali diperlakukan sebagai
     rangkaian baru dan diselesaikan di SPT Tahunan karyawan.
     Sistem mencatat rangkaian kedua dengan snapshot merujuk slip
     final rangkaian pertama. (Penyederhanaan sadar; risiko sisa
     ditanggung rekonsiliasi SPT Tahunan karyawan, bukan pemberi
     kerja.)

### 4. Hitung ulang masa terakhir + kurang/lebih potong

Rumus mengikat (PMK 168/2023 Pasal 8, Pasal 10, Pasal 15 ayat (1)
huruf b + ayat (2)-(3)):

```
brutoTahun      = Σ penghasilan bruto seluruh masa pajak tahun
                  berjalan (termasuk tidak teratur; hanya masa
                  dalam rangkaian kerja tahun itu)
biayaJabatan    = min(5% × brutoTahun, Rp500.000 × jumlahBulanBagian)
pengurangLain   = iuran pensiun/hari tua dibayar karyawan melalui
                  pemberi kerja + zakat/sumbangan keagamaan wajib
                  melalui pemberi kerja (Pasal 10 ayat (1) b-c),
                  HANYA sebesar yang benar-benar terpotong di slip
netoTahun       = brutoTahun − biayaJabatan − pengurangLain
                  (bagian tahun: netoDisetahunkan = netoTahun ÷
                   jumlahBulanBagian × 12)
PKP             = floor-ke-ribuan(max(0, neto(Disetahunkan) − PTKP))
pajakTahun      = tarif Pasal 17 ayat (1) huruf a atas PKP
                  (bagian tahun: × jumlahBulanBagian ÷ 12)
pphMasaTerakhir = pajakTahun − Σ PPh21 terpotong masa sebelumnya
```

- PTKP dari status awal tahun (§1) dengan nilai master existing
  (54.000.000 + 4.500.000 kawin + 4.500.000/tanggungan maks 3).
  Braket Pasal 17 existing (UU HPP: 5/15/25/30/35%) DIPAKAI ULANG.
- BPJS karyawan: hanya komponen yang memenuhi Pasal 10 ayat (1)
  huruf b (iuran terkait pensiun/hari tua melalui pemberi kerja —
  dalam data berjalan: porsi JP + JHT karyawan) yang mengurangi.
  BPJS Kesehatan karyawan TIDAK mengurangi neto PPh21. Mesin lama
  mengurangi seluruh `bpjs.total` — pada jalur hitung ulang ini
  WAJIB dipisah; parameter masukan hitung ulang adalah iuran
  pensiun-tahun berjalan terpisah dari BPJS total. (Lapisan TER
  bulanan tidak terpengaruh — tidak ada pengurang sama sekali.)
- Pembulatan: PKP dibulatkan ke bawah ke ribuan penuh sebelum tarif;
  hasil akhir rupiah penuh `safeRound` sen sesuai presisi repo
  Decimal(15,2). Pembulatan lantai per-bulan ala PER-16 lama pada
  komentar existing (service:271-276) TIDAK berlaku untuk skema ini;
  hapus klaim itu dari jalur baru agar tidak menyesatkan.
- Kurang potong (selisih > 0): jumlah itu adalah PPh21 slip masa
  terakhir (dipotong dari slip itu). Bila selisih melebihi bruto
  slip masa terakhir, potong sebesar bruto tersedia dan sisa kurang
  potong DITAMPILKAN sebagai temuan terbuka di snapshot + rekap —
  dilarang menjadi saldo negatif diam-diam atau memotong masa tahun
  berikutnya tanpa dokumen.
- Lebih potong (selisih < 0): PPh21 slip masa terakhir = 0, dan
  kelebihan WAJIB dikembalikan pemberi kerja kepada karyawan paling
  lambat akhir bulan berikutnya setelah masa pajak terakhir,
  disertai bukti potong (PMK 168/2023 Pasal 21 ayat (1); hak karyawan
  Pasal 22 ayat (2)). Sistem mencatat nilai lebih-potong sebagai
  angka positif terstruktur di snapshot slip masa terakhir
  (`overWithheld`) dan status pengembaliannya (belum/sudah +
  tanggal) — pengembalian adalah pembayaran nyata ke karyawan,
  bukan pengurang slip tahun berikutnya secara diam-diam. Di sisi
  pemberi kerja, kelebihan setor dikompensasikan ke masa berikutnya
  lewat SPT Masa (Pasal 21 ayat (3)) — itu urusan rekap F-028,
  bukan penyesuai slip individu.
- Agregasi "terpotong sebelumnya" = Σ `Payroll.pph21` final
  (status terbit/approved/paid menurut konvensi berjalan — slip
  draft/batal TIDAK ikut) karyawan yang sama, tahun kalender sama,
  masa < masa terakhir, termasuk potongan slip THR/bonus se-masa
  (§2). Idempoten: menjalankan ulang hitung ulang pada masa yang
  sama menghasilkan angka sama dan tidak menggandakan pengembalian.
- Koreksi status/data master sesudah slip masa terakhir terbit:
  TIDAK menghitung ulang slip terbit. Koreksi hanya lewat slip
  koreksi/dokumen pembetulan di periode terbuka dengan rujukan slip
  asal; angka asli tetap di snapshot.

### 5. Titik berlaku — slip lama TIDAK dihitung ulang

- Vonis berlaku untuk slip yang DITERBITKAN (generate/approve final,
  bukan sekadar periode kalender slip) sesudah implementasi vonis
  ini merged DAN tabel TER terisi efektif (lihat Handoff). Slip
  pertama wajib metode TER adalah slip masa pajak pertama yang
  diterbitkan sesudah kedua syarat itu terpenuhi.
- Seluruh slip terbit sebelum titik itu — termasuk seluruh slip
  tahun 2024-2025 yang terlanjur memakai metode disetahunkan —
  TIDAK dihitung ulang, TIDAK diterbitkan ulang, TIDAK disesuaikan
  diam-diam. Angka `pph21` + `statutorySnapshot` historis beku.
- Konsekuensi eksplisit: hitung ulang masa terakhir pertama sesudah
  titik berlaku memakai Σ terpotong sebelumnya APA ADANYA (termasuk
  yang dihitung dengan metode lama di tahun yang sama). Jangan
  "memperbaiki" bulan-bulan lama itu di dalam hitung ulang; selisih
  metode lama tertangkap secara alami sebagai kurang/lebih potong
  masa terakhir — di situlah tempat sahnya menurut Pasal 15/21.
- Tabel TER = data master bertanggal efektif (PP 58/2023 berlaku
  1 Jan 2024, Pasal 5), disimpan sebagai ruleset berperiode
  (`PayrollStatutoryRule` atau tabel bracket khusus — keputusan
  struktur milik backend, SEMANTIK mengikat): setiap baris bracket
  membawa kategori, batas bawah eksklusif/batas atas inklusif bruto
  bulanan, tarif %, effectiveFrom/To, source="PP 58/2023 Lampiran
  A/B/C". Tabel kosong/tidak lengkap untuk periode slip → hitung
  FINAL ditolak berisik (pola fail-closed ruleset existing
  hrm.actions.ts:127-132 DIPERTAHANKAN dan diperluas ke TER);
  dilarang fallback ke metode disetahunkan sebagai "cadangan".
  Preview/estimasi boleh tampil berlabel non-final sesuai pola
  existing, angka final tidak.
- Slip menampilkan kategori TER + tarif yang dipakai (dari snapshot)
  agar karyawan/HR dapat memeriksa; UI tidak menghitung ulang.

### 6. Tes falsifikasi mengikat untuk backend

Fixture angka memakai iuran-pengurang dinyatakan eksplisit per kasus;
`bpjsPengurang` = hanya porsi pensiun/hari tua (§4), TER bulanan
mengabaikannya. Semua tes wajib MERAH bila penjaga terkait dicabut
(ganti TER→disetahunkan, gabung-masa dihapus, annualisasi bagian
tahun dihapus, dsb).

- **T1 kategori beda tanggungan (TER, masa selain terakhir).** Bruto
  Rp10.000.000, satu masa: TK/0→A tarif 2,00% → PPh21 Rp200.000
  (Lampiran A: >9.650.000–10.050.000); K/1→B tarif 1,50% → Rp150.000
  (Lampiran B: >9.200.000–10.750.000); K/0→A Rp200.000. Bruto
  Rp6.500.000: TK/0→A tarif 1,00% → Rp65.000; K/3→C tarif 0% →
  Rp0 (Lampiran C: ≤6.600.000). `dependents=9` ter-clamp 3 (K→C).
  Status "Belum Kawin" = TK (bukan K). Acuan silang resmi: contoh
  Penjelasan PP 58/2023 Pasal 2 — K/0 bruto 10.000.000 → 2% →
  Rp200.000/bulan Jan–Nov.
- **T2 Desember karyawan penuh (hitung ulang + kurang potong).**
  K/0 (PTKP 58.500.000), bruto Rp10.000.000 × 12, iuran pensiun
  karyawan Rp100.000/bln, tanpa tidak-teratur. Jan–Nov TER A 2% =
  Rp200.000 × 11 = Rp2.200.000. Tahunan: bruto 120.000.000 − biaya
  jabatan 6.000.000 − iuran 1.200.000 = neto 112.800.000; PKP
  54.300.000; pajak Pasal 17 = 5% × 54.300.000 = Rp2.715.000.
  PPh21 Desember WAJIB Rp515.000 (= 2.715.000 − 2.200.000). Angka
  ini persis contoh resmi Penjelasan PP 58/2023 — simpangan berapa
  pun = gagal.
- **T3 THR digabung se-masa + Desember menyeimbangkan.** TK/0, gaji
  Rp10.000.000/bln, THR Rp10.000.000 diterima April, pengurang
  pensiun 0 (fixture eksplisit). Jan–Mar TER A 2% = Rp200.000/bln.
  April bruto gabungan Rp20.000.000 → TER A 9,00% (Lampiran A:
  >19.750.000–24.150.000) → Rp1.800.000. Mei–Nov Rp200.000/bln.
  Σ sebelum Des = 3×200.000 + 1.800.000 + 7×200.000 = Rp3.800.000.
  Tahunan: bruto 130.000.000 − biaya jabatan 6.000.000 (cap) −
  PTKP 54.000.000 = PKP 70.000.000; pajak = 5%×60.000.000 +
  15%×10.000.000 = Rp4.500.000. PPh21 Desember = 4.500.000 −
  3.800.000 = Rp700.000. (THR dipotong terpisah per slip atau
  dirata-rata → angka berbeda → tes merah.)
- **T4 masuk tengah tahun (bagian tahun, disetahunkan proporsional).**
  TK/0, masuk 1 Juli, bruto Rp10.000.000/bln Jul–Des, pengurang 0.
  Jul–Nov TER A 2% = Rp200.000 × 5 = Rp1.000.000. Masa terakhir
  Des: bruto bagian 60.000.000 − biaya jabatan 3.000.000 (5%, di
  bawah cap prorata 6×500.000) = neto 57.000.000; disetahunkan
  114.000.000; PKP 60.000.000; pajak disetahunkan Rp3.000.000;
  proporsional 6/12 → Rp1.500.000; PPh21 Des = 1.500.000 −
  1.000.000 = Rp500.000. Tanpa annualisasi (PKP atas 57.000.000
  langsung) hasilnya Rp150.000 pajak / selisih negatif — tes wajib
  membedakan.
- **T5 keluar tengah tahun = masa terakhir di bulan berhenti.**
  TK/0, kerja Jan–Sep, bruto Rp10.000.000/bln, pengurang 0, slip
  Sep ditandai final-resign. Jan–Agu TER Rp200.000 × 8 =
  Rp1.600.000. Sep: neto bagian 90.000.000 − 4.500.000 =
  85.500.000; disetahunkan 114.000.000; PKP 60.000.000; pajak
  proporsional 9/12 × 3.000.000 = Rp2.250.000; PPh21 Sep =
  Rp650.000. Tanpa penanda final, Sep terpotong TER Rp200.000 →
  tes merah. Masa terakhir kedua tahun sama ditolak.
- **T6 lebih potong wajib kembali (bukan negatif diam).** TK/0,
  gaji Rp5.400.000/bln (TER A 0%), satu bulan terima tambahan tidak
  teratur Rp50.000.000 (bruto bulan itu Rp55.400.000 → TER A 19%
  (Lampiran A: >51.400.000–56.300.000) = Rp10.526.000), pengurang 0.
  Tahunan: bruto 114.800.000 − biaya jabatan 5.740.000 − PTKP
  54.000.000 = PKP 55.060.000 → pajak Rp2.753.000. Selisih Des =
  2.753.000 − 10.526.000 = −Rp7.773.000 → PPh21 Des = Rp0 DAN
  `overWithheld` tercatat Rp7.773.000 berstatus belum-kembali.
  Slip Des negatif / pengurang tahun berikut = gagal.
  **KOREKSI VONIS BOT 4 (2026-10-21): vonis #291 tertulis 18% /
  Rp7.219.000 — ralat label peringkat dari BOT 4. PP 58/2023
  Lampiran A (peraturan.go.id): >47.800.000–51.400.000 = 18%;
  >51.400.000–56.300.000 = 19%. Angka final: 19% / Rp7.773.000,
  tertulis juga di PR #295 (komentar 6309309583). Implementasi
  #295 + tes T6 sudah 19% sejak awal; tanpa perubahan kode.**
- **T7 dua slip se-masa (REGULAR + THR terpisah).** TK/0, slip
  reguler bruto Rp10.000.000 terbit terpotong Rp200.000; slip THR
  Rp10.000.000 bulan sama terbit sesudahnya: target gabungan
  Rp20.000.000 × 9% = Rp1.800.000, maka PPh21 slip THR WAJIB
  Rp1.600.000 (selisih), bukan Rp1.800.000 dan bukan TER atas
  10.000.000 sendiri.
- Penjaga non-angka wajib: tabel TER kosong → final ditolak;
  snapshot memuat kategori+tarif+bracket dan tidak berubah saat
  master diubah sesudahnya; menjalankan ulang generate masa
  terakhir idempoten (angka sama, pengembalian tidak ganda);
  slip pra-titik-berlaku tidak berubah oleh mesin baru (regresi
  snapshot lama tetap terbaca).

### Handoff (eksplisit)

- Backend (`@backend-prisma-inventory-workshop`) BOLEH mulai
  implementasi F-026 sesudah vonis ini merged; task backend F-026
  bergantung task vonis ini. Tidak ada poin metode/angka yang
  "terserah backend" — yang milik backend hanya struktur tabel
  bracket, penanda final, dan mekanisme agregasi, dalam semantik
  §1-§6.
- Frontend menampilkan kategori TER, tarif, dan status lebih-potong
  dari snapshot backend apa adanya; dilarang hitung ulang di UI.
- Di luar cakupan vonis ini (jangan dikerjakan atas nama F-026):
  TER harian/bukan-pegawai/peserta kegiatan, pemetaan komponen
  kena pajak (F-027), rekap SPT/e-Bupot (F-028), jurnal akuntansi
  atas lebih-potong (perlu vonis jurnal terpisah bila akan dibukukan
  otomatis), status kawin karyawati Pasal 9 ayat (2)-(3) PMK
  168/2023 (data gender/status existing belum cukup membuktikan
  syarat keterangan suami tanpa penghasilan — perlakukan status
  sesuai field berjalan, eskalasi ke BOT 4 bila ditemukan kasusnya).
- Risiko sisa tercatat: kategori dari teks status bebas (dimitigasi
  fail-closed A + snapshot transparan), penghasilan pemberi kerja
  lain tak terlihat sistem (SPT Tahunan karyawan), keluar-masuk
  kembali se-tahun (§3b butir terakhir).

---

## 2026-10-21 11:03 WIB — Domain (g) kendaraan & fitment

Rotasi: run sebelumnya (f) garansi F-2026-10-21-021..022. Run ini (g)
oleh Bot 5 sales/CRM (kendaraan pelanggan = konteks quotation/WO).
Berikutnya: (h) SDM & payroll — domain inti Bot 5.

Benchmark resmi (akses 2026-10-21):
- Accurate Barang & Jasa (data barang dipakai transaksi penjualan/
  pekerjaan pesanan, tanpa modul fitment kendaraan terdokumentasi):
  https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/barang-dan-jasa/mengenal-fitur-barang-dan-jasa/
- Zahir fasilitas resmi (assembly + serial number kendaraan, tanpa
  aturan kompatibilitas part↔konfigurasi kendaraan):
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
- Kesimpulan `BENCHMARK`: fitment rule = keunggulan ISF existing,
  bukan fitur paritas. Gap di bawah = fitment belum dipakai alur jual.

### Inventarisasi terverifikasi (2026-10-21, domain g)

Sudah ada (`TERVERIFIKASI-KODE`):
- Model `VehicleFitmentRule` lengkap: item + bomRevision opsional,
  scope brand/model/variant/yearFrom/yearTo/drivetrain/transmission
  (null = wildcard), result, source, isActive
  (prisma/schema.prisma:4097-4133).
- Evaluator most-specific-wins: variant 8 > model 4 > brand 2,
  +1 tahun/drivetrain/transmission/bomRevision; seri dipecah aturan
  terbaru (id terbesar); tanpa aturan cocok = `unknown` fail-safe
  (src/lib/services/vehicle-fitment.service.ts:61-71,124-153).
  Teruji: src/lib/services/__tests__/vehicle-fitment.service.test.ts
  (7 tes: unknown, spesifik, tahun, drivetrain case-insensitive).
- CRUD + permission `view/create/edit/delete_vehicle_fitments`,
  halaman `/kendaraan/fitment`, checker ad-hoc per item/produk di
  detail Product (src/actions/vehicle-fitment.actions.ts:126-167;
  fitment-checker.tsx). Kosakata drivetrain/transmission kanonik
  tunggal (src/lib/constants/vehicle.ts:18-35).
- Dokumen jual/bengkel SUDAH membawa kendaraan: `Quotation.
  customerVehicleId` (schema:1187), `WorkOrder.customerVehicleId`
  (schema:2572), kepemilikan kendaraan divalidasi terhadap customer
  saat quotation dibuat (src/actions/sales.actions.ts:118-120).

Belum ada / parsial (bukti grep run ini):
- SALAH-cakupan: `evaluateFitment` hanya dipanggil checker manual
  (vehicle-fitment.actions.ts:144,153). Grep fitment di
  sales.actions.ts / manufacturing.actions.ts / hooks / inventory
  actions = 0 hasil evaluasi. Quotation/WO/MaterialIssue tidak pernah
  memeriksa kompatibilitas walau customerVehicleId terisi.
- KONFLIK tak terdeteksi: tidak ada unique constraint / deteksi
  aturan aktif ganda dengan scope identik (itemId + bomRevisionId +
  brand/model/variant + tahun + drivetrain + transmission sama).
  Dua aturan identik beda result diam-diam diputuskan urutan id
  (vehicle-fitment.service.ts:135-139) — teknisi tidak tahu ada
  konflik data.
- CustomerVehicle tanpa odometer (schema:3618-3643) — meneruskan
  gap F-2026-10-21-021, tidak diduplikasi di sini.

### Gap

#### F-2026-10-21-023 (g) P1 — Fitment tidak dievaluasi di quotation/WO; part tidak cocok bisa terjual & terpasang
- Kompetitor: tidak ada modul fitment resmi Accurate/Zahir (URL di
  atas) — `BENCHMARK` negatif; ini penguatan fitur ISF existing.
- Status Silengkap: PARSIAL. Bukti: evaluator + checker manual ADA
  (vehicle-fitment.service.ts:103-196); nol pemanggil di alur
  quotation/WO/issue (grep run ini).
- Relevansi: inti janji bengkel modifikasi — bumper/lift kit salah
  varian/tahun baru ketahuan saat pasang; biaya bongkar + retur +
  perselisihan ditanggung bengkel. Kendaraan sudah tertaut dokumen,
  konfigurasi (brand/model/variant/year/drivetrain/transmission)
  bisa diturunkan dari CustomerVehicle→Vehicle→Variant tanpa input
  ulang.
- Adaptasi lapis aman dulu (`USULAN`, tanpa menahan dokumen):
  (1) builder read-only `fitment-for-document`: turunkan konfigurasi
  dari customerVehicleId, evaluasi tiap QuotationItem.itemId /
  WorkOrderItem.itemId (lewati itemId null/0 = jasa/custom),
  kembalikan compatible/incompatible/unknown + ruleId/source per
  baris. (2) Kartu peringatan di detail quotation + WO: baris
  `incompatible` merah, `unknown` kuning "belum terverifikasi" —
  TIDAK memblokir simpan/kirim (pola informatif F-2026-10-20-100).
  (3) Gerbang keras (blokir WO start / MaterialIssue bila
  incompatible) = `BUTUH-VONIS` team-lead sesudah data peringatan
  membuktikan false-positive rendah.
- Modul disentuh: src/lib/reports/ builder baru (pola
  work-order-load.ts), detail quotation/WO (frontend), TANPA
  migrasi. Inti gerbang menyentuh sales/manufacturing actions.
- Effort: S aman, M inti. Risiko: aturan belum lengkap → mayoritas
  `unknown` mengajari user mengabaikan peringatan — mitigasi:
  tampilkan cakupan aturan (n baris terverifikasi dari total) dan
  hanya `incompatible` yang menonjol.
- Urutan: builder → kartu quotation → kartu WO → vonis gerbang.
- Acceptance: quotation kendaraan X + item aturan incompatible
  tampil merah menyebut source aturan; item tanpa aturan tampil
  unknown (bukan compatible); baris jasa (itemId null/0) tidak
  dievaluasi; cabut builder = kartu hilang, dokumen tetap jalan.
- Pemilik usulan: backend (builder), frontend (kartu), Bot 3
  koordinasi WO/MaterialIssue. Butuh putusan accountant: TIDAK.
  Butuh vonis team-lead: YA hanya gerbang keras tahap 3.

#### F-2026-10-21-024 (g) P1 — Konflik aturan fitment scope identik tidak terdeteksi; pemenang ditentukan urutan buat diam-diam
- Status Silengkap: SALAH-data-diam. Bukti: tanpa @@unique /
  deteksi duplikat di VehicleFitmentRule (schema:4097-4133);
  tie-break `b.id - a.id` (vehicle-fitment.service.ts:136-139)
  menutupi konflik compatible vs incompatible scope sama persis.
- Relevansi: dua teknisi input aturan bertentangan (sumber berbeda)
  → hasil checker berubah sesudah input terakhir tanpa jejak;
  keputusan pasang/tidak bertumpu data yang tidak disadari konflik.
- Adaptasi (`USULAN`, tanpa migrasi): query read-only daftar
  kelompok aturan aktif dengan kunci scope ternormalisasi sama
  (drivetrain/transmission dibandingkan hasil `norm()` lowercase)
  tetapi result berbeda; tampilkan kartu "konflik aturan" di
  halaman /kendaraan/fitment + tolak simpan aturan baru yang
  scope-nya identik aturan aktif lain dengan pesan menyebut aturan
  lama (edit aturan lama, bukan tumpuk). Unique constraint DB
  ditunda — scope nullable membuat unique MySQL multi-null tidak
  menegakkan kesamaan wildcard.
- Modul disentuh: src/actions/vehicle-fitment.actions.ts (guard
  simpan), src/lib/reports/ query konflik, halaman fitment.
- Effort: S. Risiko: aturan lama ganda sudah terlanjur ada —
  mitigasi guard hanya menolak yang baru; daftar konflik untuk
  dibersihkan manual.
- Acceptance: buat aturan scope identik result berbeda ditolak
  menyebut ID aturan existing; dua aturan lama konflik tampil di
  daftar; aturan scope beda 1 dimensi (tahun lain) tetap lolos;
  nonaktifkan salah satu = konflik hilang dari daftar.
- Pemilik usulan: backend. Butuh putusan accountant: TIDAK.

#### F-2026-10-21-025 (g) P2 — Checker fitment hanya di detail Product; sales tidak bisa cek dari kendaraan pelanggan
- Status Silengkap: PARSIAL. Bukti: checker terpasang hanya di
  produksi/products/[slug] (fitment-checker.tsx); detail
  CustomerVehicle tidak menampilkan kendaraan cocok part apa /
  part terpasang apa; checkVehicleFitment menuntut konfigurasi
  dirakit manual per panggilan (vehicle-fitment.actions.ts:134-141).
- Relevansi: pertanyaan pelanggan "part X cocok untuk mobil saya?"
  dijawab dari halaman produk menebak konfigurasi, bukan dari
  kendaraan aktual pelanggan yang sudah tercatat.
- Adaptasi (`USULAN`): varian checker "dari CustomerVehicle" —
  konfigurasi diturunkan server dari rantai
  CustomerVehicle→Vehicle→Variant→Model→Brand + Vehicle.year;
  kartu di detail kendaraan pelanggan: cek 1 item/produk +
  daftar hasil evaluasi item yang pernah terpasang via WO
  kendaraan itu (riwayat, bukan klaim garansi — itu F-021).
- Modul disentuh: src/actions/vehicle-fitment.actions.ts (mode
  customerVehicleId), halaman kendaraan/pelanggan (frontend).
- Effort: S. Risiko: Vehicle.year/variant kosong → hasil unknown
  jujur, tampilkan field kosongnya sebagai alasan.
- Acceptance: dari detail kendaraan, cek produk menghasilkan
  per-baris compatible/incompatible/unknown tanpa input brand/
  model manual; kendaraan tanpa tahun tampil alasan "tahun kosong".
- Pemilik usulan: backend + frontend. Butuh putusan accountant:
  TIDAK.

### Yang TIDAK diusulkan run ini
- Gerbang keras blokir dokumen atas incompatible: ditunda sampai
  vonis team-lead + bukti false-positive (lihat F-023 tahap 3).
- Atribut kendaraan baru (mesin cc, bahan bakar, dimensi): tanpa
  bukti aturan fitment nyata yang membutuhkannya; scope existing
  brand/model/variant/tahun/drivetrain/transmission cukup.
- Odometer: milik F-2026-10-21-021, tidak diduplikasi.

Fokus berikutnya: (h) SDM & payroll — verifikasi live klaim skill
Bot 5: generateBulkPayroll tanpa filter paymentFrequency, status
kepegawaian tanpa field PKWT/PKWTT, PPh 21 TER F-2026-10-21-026.


## VONIS + IMPLEMENTASI BOT 4 2026-10-21 — F-2026-10-21-034 izin khusus faktur pajak/bupot

Konteks: audit Bot 6 atas PR #290 (issuecomment-6311118772, diteruskan
Lead 2026-10-21) mencatat medium non-blokir: 7 aksi
`src/actions/tax-documents.actions.ts` memakai ulang izin setor
`create_tax_payments`. Pemegang izin setor otomatis boleh menerbitkan/
mengganti/membatalkan faktur pajak dan bupot — pemisahan tugas lemah,
wajib dipisah sebelum UI form faktur/bupot dibuka (Bot 2). PR #290
sudah MERGED `85f6289e`; item ini PR lanjutan mandiri, tanpa migrasi.

Keputusan izin (mengikat):
- Faktur pajak (issue/replace/cancel/credit masukan) =
  `create_tax_invoices` (verba create, resource `tax_invoices`,
  label "Faktur Pajak", modul finance).
- Bupot (issue/revoke) = `manage_withholding_certificates` (verba
  manage, resource `withholding_certificates`, label "Bukti Potong
  (Bupot)", modul finance). Satu izin manage untuk terbit+batal:
  bupot tidak punya siklus CRUD terpisah; memecah create/delete
  menambah key tanpa pemisahan tugas nyata (penerbit yang sama yang
  mencabut dengan reversal jurnal).
- Setor PPh (`settleWithholdingTaxAction`) TETAP `create_tax_payments`
  — itu memang domain setor; jangan diganti.
- Pelaporan/ekspor bupot dan halaman posisi-spt tetap `view_reports`
  (jalur baca laporan), tidak ikut item ini.

Grant peran: permission baru masuk `PERMISSIONS` (base-data.ts);
`admin` menerimanya otomatis via ADMIN_WHITELIST (seluruh katalog
kecuali SYSTEM_ADMIN_PERMISSIONS), `super_admin` via grant menyeluruh.
Role lain TIDAK menerima otomatis — admin peran memberi eksplisit via
matriks izin sesudah `npm run db:seed`; perilaku sesudah merge:
pemegang `create_tax_payments` non-admin kehilangan akses aksi faktur/
bupot sampai diberi izin baru. Itu memang tujuan pemisahan; UI form
belum ada sehingga tidak ada fitur berjalan yang putus.

Temuan samping terbukti: generator katalog
`scripts/generate-module-catalog.mjs` RUSAK di main — pola
split(/^\];/m) tidak pernah cocok (blok diakhiri `] as const;`)
sehingga ROLES ikut terbaca dan generator meledak di "super_admin"
(reproduksi di tree bersih tanpa edit: exit gagal). Diperbaiki di PR
ini; regenerasi kini 333 permission dan diff katalog hanya 2 baris
baru + hitungan — membuktikan katalog generated sebelumnya tidak drift.

Penjaga: modules-catalog.test.ts (paritas dua arah PERMISSIONS vs
katalog + invarian key_verba_resource) dan permission-seed-parity
(requirePermission string wajib ada di seed) — keduanya menutupi key
baru dan akan merah bila izin action diganti ke key tak terdaftar.

Pemilik berikutnya: Lead merge PR ini; Bot 2 memakai
`create_tax_invoices`/`manage_withholding_certificates` untuk gating
form faktur/bupot (CanCreate/requirePermission UI), BUKAN
`create_tax_payments` lagi.


---

## 2026-10-21 18:16 WIB — Domain (k) CRM/antrian/notifikasi (verifikasi ulang aa04aea9)

Rotasi: run sebelumnya (j) laporan & BI F-2026-10-21-032..033, rotasi
a–j DITUTUP 11:32. Run ini (k) — domain berikutnya sesudah (j) yang
belum punya F-ID di backlog file ini. Catatan: label (k) pernah dipakai
riset Raka 2026-10-20 20:13 (F-2026-10-20-90..94, tercatat hanya di
board, BUKAN di file backlog ini) — item itu diverifikasi ulang di
bawah terhadap origin/main aa04aea9, bukan diduplikasi. F-ID baru
mulai F-2026-10-21-035 (034 sudah dipakai izin faktur/bupot).

Benchmark resmi (akses 2026-10-21):
- Zahir Reminder: jatuh tempo piutang/hutang/giro untuk kontrol
  tagihan + rencana arus kas — https://www.zahironline.com/reminder/
  dan daftar fitur https://www.zahironline.com/fitur-lengkap-zahir/
- Accurate Perusahaan/Kalender: "notifikasi pengingat untuk aktivitas
  penting seperti tenggat waktu pembayaran, pengiriman, dan laporan
  keuangan" — https://accurate.id/online/fitur/perusahaan/
- Klaim reminder otomatis email/WA dari blog/partner Accurate TIDAK
  dipakai sebagai bukti fitur resmi (bukan help.accurate.id).

### Status F-2026-10-20-90..94 terverifikasi ulang (aa04aea9)

- F-90 histori geser endDate: TETAP ABSEN. `updateWorkOrder`
  (inventory.actions.ts:740) menimpa startDate/endDate lalu hanya
  `logActivity("update","WorkOrder",id,"Memperbarui perintah kerja #id")`
  tanpa old/new; grep oldValues/newValues pemanggil aksi = 0. ActivityLog
  model sendiri mendukung oldValues/newValues Json (schema:3944).
  → diteruskan sebagai F-2026-10-21-035.
- F-91(a) hitungan beban: SELESAI sebagai varian lain —
  `buildWorkOrderLoad` per status WO aktif (work-order-load.ts, dipakai
  halaman perintah-kerja), bukan irisan per-hari startDate..endDate.
  Inti WorkBay/bayId tetap ditunda-teknis (PUTUSAN 20:22 berlaku).
  Tidak diusulkan ulang.
- F-92 tombol WA manual: SELESAI (WhatsappButton + buildWhatsappMessage
  di antrean/faktur/penawaran/detail WO). Sisa: klik tombol tidak
  meninggalkan jejak apa pun → diteruskan sebagai F-2026-10-21-036.
- F-93(a) kartu kendaraan lead: SELESAI (LeadCustomerVehiclesCard,
  hanya bila customerId ada). Inti Lead.customerVehicleId tetap
  ditunda-teknis. Tidak diusulkan ulang.
- F-94 urutan tenggat+umur: SELESAI di builder antrean
  (work-order-queue.ts compareRows: tenggat dulu). Inti
  WorkOrder.priority tetap ditunda-teknis. Tidak diusulkan ulang.

### Inventarisasi terverifikasi (2026-10-21, domain k)

Sudah ada (TERVERIFIKASI-KODE, worktree origin/main aa04aea9):
- Notifikasi internal saja: model Notification userId internal
  (schema:289), notification.service.ts (notifyAdmins/notifyUser(s)/
  notifyUsersIfNew dedupe per-judul per-hari), API + dropdown +
  halaman /notifikasi. Cron daily-notifications (vercel.json) cek
  stok menipis, invoice overdue, PO basi, telat/absen — semua ke
  admin internal, tidak pernah ke pelanggan.
- WA manual wa.me: whatsapp.ts (normalize/build message/URL) +
  WhatsappButton di 4 permukaan. Tanpa gateway/API/kredensial;
  grep SMTP/nodemailer/email-send di src = 0.
- CRM: Lead+LeadActivity (scheduledAt/completedAt ada), CrmTicket
  (+firstResponseAt diisi server saat komentar pertama,
  crm.actions.ts:121-127), stale-leads builder (lead new/contacted
  diam >7 hari) + kartu di daftar prospek.

Belum ada / parsial (bukti grep run ini):
- ABSEN histori geser tenggat WO (F-90 di atas).
- ABSEN jejak klik/kirim WA: grep model/log sentAt/delivery di
  schema+src = 0 hasil relevan; klik wa.me tidak tercatat, staf
  tidak bisa membuktikan pelanggan sudah dihubungi.
- PARSIAL follow-up lead terjadwal: LeadActivity.scheduledAt bisa
  disimpan (crm.actions.ts:351-356) tapi tidak ada builder daftar
  "follow-up jatuh tempo hari ini / terlambat" — yang ada hanya
  stale-leads berbasis aktivitas terakhir, bukan jadwal berikutnya.
  Aktivitas terjadwal masa depan justru membuat lead terlihat segar
  di stale-leads (lastActivityAt memakai scheduledAt).

### Gap

#### F-2026-10-21-035 (k) P1 — Histori geser endDate WO tidak tercatat (F-90 lanjutan)
- Kompetitor: Accurate Kalender/Log Aktivitas (pengingat tenggat +
  pantau aktivitas) — https://accurate.id/online/fitur/perusahaan/
- Status Silengkap: ABSEN. Bukti di atas: endDate ditimpa diam-diam,
  tanpa nilai lama/baru, tanpa alasan.
- Relevansi: janji selesai ke pelanggan bergeser tanpa jejak = sengketa
  "katanya selesai tanggal X" tidak bisa dijawab; umur/keterlambatan
  antrean (work-order-queue) membaca endDate berjalan saja.
- Adaptasi (tanpa migrasi): di `updateWorkOrder`, bila endDate berubah
  dari nilai tersimpan, tulis logActivity dengan oldValues/newValues
  {endDate lama, endDate baru} memakai kolom Json ActivityLog existing.
  Alasan wajib = pertanyaan terbuka untuk Business (jangan ditebak
  Lead); lapis pertama boleh tanpa alasan dulu bila Business belum
  memutus, tapi nilai lama/baru WAJIB tercatat.
- Modul disentuh: src/actions/inventory.actions.ts (updateWorkOrder
  saja) + tes aksi existing. BUKAN schema, BUKAN UI.
- Effort: S. Risiko: rendah (jalur tulis existing). Falsifikasi:
  ubah endDate tanpa log → tes merah; endDate sama → tidak ada log baru.
- Pemilik usulan: backend (builder/aksi), sales/business (spec alasan),
  QA (verifikasi). Butuh putusan accountant: TIDAK.

#### F-2026-10-21-036 (k) P1 — Klik WA ke pelanggan tidak meninggalkan jejak
- Kompetitor: Zahir Reminder (kontrol tagihan terpusat) —
  https://www.zahironline.com/reminder/ ; Accurate pengingat tenggat
  (URL perusahaan di atas). Keduanya tidak membuktikan log WA — item
  ini kebutuhan ISF sendiri, bukan klaim paritas vendor.
- Status Silengkap: ABSEN. Bukti: WhatsappButton murni <a href wa.me>,
  tanpa aksi server/log; LeadActivity tidak terisi dari klik.
- Relevansi: follow-up penagihan/status WO lewat WA adalah kanal nyata
  bengkel; tanpa jejak, dua staf bisa menghubungi pelanggan sama
  berulang atau mengklaim sudah mengingatkan tanpa bukti.
- Adaptasi (tanpa migrasi, tanpa gateway): aksi server ringan mencatat
  klik sebagai LeadActivity (untuk konteks lead) ATAU ActivityLog
  (konteks dokumen WO/invoice) — pilihan konteks = spec Business dulu;
  tombol tetap wa.me manual (F-27(b) WA otomatis tetap ditunda-teknis).
  Catatan jujur: yang tercatat = KLIK staf, bukan pesan terkirim.
- Modul disentuh: src/actions/crm.actions.ts ATAU file aksi notifikasi
  baru (satu saja, diputus Business), pemanggil di komponen WA.
  Frontend hanya memanggil aksi existing sesudah kontrak ada.
- Effort: S-M. Risiko: log dianggap bukti kirim — mitigasi label
  eksplisit "tautan dibuka", bukan "pesan terkirim".
- Pemilik usulan: sales/business (spec konteks+label), backend (aksi
  log), frontend (kabel tombol), QA (verifikasi). Putusan accountant:
  TIDAK.

#### F-2026-10-21-037 (k) P2 — Follow-up lead terjadwal tidak terbaca sebagai antrean
- Kompetitor: Accurate Kalender pengingat aktivitas —
  https://accurate.id/online/fitur/perusahaan/
- Status Silengkap: PARSIAL. Bukti: scheduledAt tersimpan tapi tanpa
  builder/daftar jatuh-tempo; stale-leads mengukur aktivitas terakhir,
  bukan jadwal berikutnya, dan jadwal masa depan menutupi kebasian.
- Relevansi: janji "hubungi lagi Selasa" hilang dari pandangan; lead
  terlihat ditindaklanjuti padahal jadwalnya sudah lewat.
- Adaptasi (read-model murni, tanpa migrasi): builder
  `lead-followups.ts` — aktivitas scheduledAt <= hari ini (WIB) dan
  completedAt kosong, per lead ambil jadwal terawal yang belum
  selesai; urut paling terlambat dulu. Loader satu query massal pola
  stale-leads-data. UI kartu menyusul sesudah builder (frontend).
- Modul disentuh: src/lib/reports/lead-followups*.ts (baru) + tesnya.
  BUKAN actions/schema/UI pada tahap builder.
- Effort: S. Risiko: dobel makna dengan stale-leads — mitigasi label
  terpisah "Jadwal follow-up lewat" vs "Lead diam".
- Pemilik usulan: backend (builder), frontend (kartu sesudah builder),
  QA (verifikasi). Putusan accountant: TIDAK.

### Yang TIDAK diusulkan run ini
- WA otomatis/gateway + template terkirim: F-27(b) tetap
  ditunda-teknis; butuh kredensial/biaya kanal nyata, bukan gap kode.
- Model WorkBay, Lead.customerVehicleId, WorkOrder.priority:
  inti F-91/93/94 tetap ditunda-teknis per PUTUSAN 2026-10-20 20:22.
- Email reminder otomatis ke pelanggan: tidak ada infrastruktur
  email keluar sama sekali (grep = 0); bangun kanal = keputusan
  bisnis/ops terpisah, bukan gap run ini.
- SLA tiket CRM terukur (target respons per prioritas): firstResponseAt
  sudah tercatat; target SLA belum ada aturan bisnisnya — pertanyaan
  terbuka Business, bukan gap ber-ID sampai aturan ada.

Fokus berikutnya: implementasi F-035 (backend), spec F-036
(sales/business), builder F-037 (backend) — lihat child kanban run ini.
Rotasi berikutnya sesudah (k) dibuka hanya bila domain baru terbukti
belum punya F-ID; jangan duplikasi F-90..94/035..037.
---


## VONIS BOT 4 2026-10-22 01:24 WIB — F-2026-10-21-021 TAHAP 3 (provisi + jurnal garansi)
Kartu t_0d982ec6 (ready, klaim 2026-10-22 01:22). Tanpa kode, tanpa
schema/migrasi, tanpa jurnal nyata. Vonis ini melengkapi vonis BOT 4
2026-10-21 22:18 (F-021 tahap 3 "DITOLAK-AKTIFKAN" saat data klaim belum
ada) dan vonis kesiapan akun 2026-10-21 18:53 (F-69: kode 510104/210205/
110508). Tahap 1-2 sudah hidup (model WarrantyCoverage/WarrantyClaim,
PR #294/#300/#303/#312) tetapi TANPA jurnal apa pun. Bila syarat §6 di
bawah terpenuhi, tahap 3 DIBUKA dengan bentuk di §1-§5. Bila syarat
belum terpenuhi, default aman existing tetap berlaku: garansi tercatat
operasional saja, biaya klaim dibebankan saat terjadi lewat jurnal
manual umum, TANPA provisi dan TANPA piutang klaim supplier.
### §0 Ringkasan putusan
1. Provisi garansi BOLEH diakui HANYA untuk garansi assurance dengan
   kewajiban kini dari penjualan/serah-terima, arus keluar kemungkinan
   besar, dan estimasi andal dari data klaim historis per kelompok
   item/jasa. Estimasi nol/tidak andal = TIDAK ada provisi; biaya
   dibebankan saat klaim terjadi. Sistem TIDAK PERNAH mengarang tarif
   provisi (persen penjualan, persen HPP, dsb.) tanpa dasar data.
2. Jurnal tahap 3 memakai mesin keputusan murni existing
   `src/lib/services/warranty-accounting.ts` (F-49, 10 tes angka hijau:
   covered/billable/rejected, saldo provisi tidak negatif, recovery
   virtually-certain saja). Mesin itu TIDAK disentuh kartu ini; vonis
   ini hanya menetapkan SYARAT kapan ia boleh dipanggil inti + bentuk
   jurnal posting nyata. `decideWarrantyClaimAccounting` tidak pernah
   dipanggil dari kode produksi hari ini (grep pemanggil = hanya tes).
3. Akun final (koreksi F-69 mengikat, membatalkan header lama modul
   yang masih menulis 510103/2105xx/1108xx): **510104 Beban Garansi**
   [COGS di bawah 5101], **210205 Provisi Garansi** [OCLY di bawah
   2102], **110508 Piutang Klaim Supplier — Garansi** [OCAS di bawah
   1105]. 510103 = Penyesuaian Persediaan, DILARANG untuk garansi.
   Header komentar warranty-accounting.ts:51-53 WAJIB dikoreksi BOT 3
   saat inti dibangun (kode salah = jebakan posting).
4. Tiga kolom mapping SystemSetting baru wajib (migrasi inti):
   `warrantyExpenseAccountId`, `warrantyProvisionAccountId`,
   `supplierClaimReceivableAccountId` — semua nullable, tanpa default
   tebak. Posting tahap 3 DITOLAK fail-closed bila mapping yang
   dibutuhkan jalur terpilih kosong (pola AUD-FIN-01
   customerDownPaymentAccountId, accounting-hook.test.ts:1456).
   Automap boleh MENAWARKAN kandidat by-code (510104/210205/110508)
   di wizard, tetapi TIDAK mengisi diam-diam: finance wajib memilih/
   mengonfirmasi akun aktif, terposting, dan bertipe benar
   (COGS/OCLY/OCAS) — akun nonaktif atau induk header DITOLAK.
5. Peristiwa posting hanya 4: (E1) akrual provisi saat serah-terima,
   (E2) realisasi biaya klaim approved, (E3) pengakuan recovery
   supplier virtually-certain, (E4) pelepasan provisi di akhir masa /
   pembalikan estimasi. Di luar 4 ini TIDAK ada jurnal garansi.
   Klaim rejected, klaim di luar cakupan, dan pekerjaan tertagih
   TIDAK PERNAH memakai jurnal garansi (jalur §3).
### §1 Matriks posting (event → debit/kredit → syarat)
Semua jurnal: `JournalService.createJournal` existing, status POSTED,
`assertPeriodOpen(tanggal jurnal)` di dalam transaksi pemanggil,
uang Decimal(15,2), satu jurnal per peristiwa per dokumen sumber.
Tanggal jurnal = tanggal peristiwa bisnis (serah-terima / penyelesaian
biaya klaim / penetapan recovery / akhir masa), BUKAN tanggal input
mundur ke periode terkunci dan BUKAN tanggal faktur asal diubah.
| Event | Debit | Kredit | Syarat posting (semua wajib) |
|---|---|---|---|
| E1 Akrual provisi | 510104 Beban Garansi = estimasi terbaik per coverage/kelompok | 210205 Provisi Garansi | Garansi assurance; serah-terima WO completed (coverage lahir); estimasi > 0 dari metode §2 terdokumentasi; mapping expense+provision terisi; periode tanggal serah-terima terbuka |
| E2 Realisasi klaim | 210205 sebesar min(biaya aktual, saldo provisi terkait); selisih lebih biaya → 510104 | Akun biaya sumber per bukti: Persediaan/WIP (part FIFO) / Utang / Kas-Bank (jasa dibayar) | Klaim status approved/in_repair→closed dengan decisionBy/decisionAt tercatat; biaya aktual terverifikasi dari WO perbaikan (MaterialIssue/ProductionCost WO repair), BUKAN angka ketik bebas; invoiceForbidden=true ditegakkan (tidak ada SalesInvoice untuk WO repair ini) |
| E3 Recovery supplier | 110508 Piutang Klaim Supplier | 510104 Beban Garansi (pemulihan biaya, BUKAN pendapatan) | Supplier claim status accepted/closed_recovered DAN bukti hampir-pasti (surat persetujuan supplier/credit note) terlampir TransactionAttachment referenceType="WarrantyClaim"; nominal ≤ biaya klaim yang dibebankan; TIDAK net-off saldo provisi di neraca |
| E4 Pelepasan provisi | 210205 sebesar saldo tersisa coverage/kelompok | 510104 Beban Garansi (pembalikan beban, BUKAN pendapatan) | Masa garansi berakhir (expiresAt lewat) dan tidak ada klaim terbuka atas coverage terkait; atau telaah periode membuktikan arus keluar tidak lagi kemungkinan besar; jurnal lawan/reversal, BUKAN hapus jurnal E1 |
Koreksi jurnal terposting: SELALU jurnal reversal
(`JournalService.reverseJournal` existing) + jurnal baru benar di
periode terbuka. Jurnal terposting TIDAK diedit, TIDAK dihapus.
Reversal E2/E3 memakai tanggal periode berjalan (pola reverseJournal
existing menanggalkan ke tanggal jurnal asal — inti WAJIB menelaah:
bila periode asal sudah terkunci, reversal ditolak dan koreksi lewat
jurnal lawan bertanggal berjalan; JANGAN memaksa backdate).
### §2 Metode estimasi provisi (PSAK 57 par 14, 24, 36)
- Estimasi = estimasi terbaik arus keluar untuk populasi coverage
  sejenis (kelompok item/jasa + rentang masa garansi), dari data
  historis klaim ISF sendiri: (frekuensi klaim historis) × (rata-rata
  biaya klaim terverifikasi), ditelaah tiap akhir periode.
- Gerbang data minimum SEBELUM provisi pertama boleh diakui:
  (a) minimal 12 bulan data klaim tahap 2 ATAU 30 klaim closed
  (mana tercapai lebih dulu) per kelompok; (b) metode + asumsi
  tertulis disetujui finance (dokumen metode, bukan konstanta kode);
  (c) hasil estimasi dapat direkonsiliasi: saldo 210205 per kelompok
  = Σ E1 − Σ E2 − Σ E4, dapat ditelusur ke coverage/claim.
- Di bawah gerbang data: provisi TIDAK diakui (bukan "provisi kecil
  dulu"). Biaya klaim approved dibebankan penuh ke 510104 saat
  terjadi (jalur covered_warranty provisionBalance=0 di mesin F-49).
  Ini BUKAN pelanggaran PSAK 57: par 14(c) mensyaratkan estimasi
  andal; tanpa itu pengakuan provisi justru dilarang.
- Perubahan estimasi = prospektif (PSAK 25): selisih ditampung E4/
  E1 tambahan periode berjalan. DILARANG restatement jurnal lama.
- Garansi `service` (berbayar/terpisah, PSAK 72 PP29-PP32): BUKAN
  provisi PSAK 57. Bagian harga dialokasikan ke liabilitas kontrak
  dan diakui pendapatan sepanjang masa jasa. ISF hari ini tidak
  punya produk garansi berbayar terpisah maupun kolom jenis garansi
  di Item/WarrantyCoverage → garansi service DITUNDA: butuh kolom
  jenis + alokasi harga (migrasi + vonis lanjutan BOT 4) sebelum
  boleh dijual/dijanjikan. Sampai itu, semua garansi pasang ISF
  diperlakukan assurance.
### §3 Batas jalur (anti tertagih dobel, WAR-01)
- Klaim covered (dalam masa + approved): invoiceForbidden WAJIB
  ditegakkan di server — WO repair tertaut WarrantyClaim approved
  tidak dapat melahirkan SalesInvoice. Penegakan UI saja TIDAK cukup.
- Klaim rejected / di luar masa / di luar cakupan: BUKAN jurnal
  garansi. Bila pelanggan setuju perbaikan berbayar → WO + invoice
  BARU normal (Dr Piutang / Cr Pendapatan + PPN keluaran bila PKP,
  Dr HPP / Cr Persediaan). Dokumen klaim tidak pernah menjadi dasar
  tagihan.
- Invoice asal TIDAK diubah oleh klaim apa pun (WAR-01). Biaya klaim
  tampil sebagai biaya periode klaim + lifetime cost job asal di
  laporan, bukan koreksi invoice lama.
- Biaya part pengganti keluar pada nilai lapisan FIFO berjalan
  (sama seperti MaterialIssue biasa), BUKAN harga jual.
- Recovery supplier `possible` (belum hampir pasti): TANPA jurnal,
  diungkapkan sebagai aset kontinjensi (PSAK 57 par 31-35).
  `supplierClaimStatus` tahap 2 (none→…→closed_recovered) tetap
  status operasional; jurnal E3 hanya lahir di gerbang virtually-
  certain §1, bukan mengikuti setiap transisi status.
### §4 Idempotency + referensi jurnal
- `Journal.referenceType/referenceId` unik DB (journals_reference_
  unique). Satu peristiwa = satu jurnal aktif:
  E1 → referenceType="WarrantyProvisionAccrual", referenceId=
  coverageId (satu akrual per coverage; akrual tambahan perubahan
  estimasi = dokumen penyesuaian terpisah, BUKAN jurnal kedua diam-
  diam — inti memutus bentuknya dan melapor ke BOT 4 sebelum bangun);
  E2 → "WarrantyClaimCost", referenceId=claimId; E3 →
  "WarrantySupplierRecovery", referenceId=claimId; E4 →
  "WarrantyProvisionRelease", referenceId=coverageId.
- Pemanggil WAJIB cek jurnal POSTED non-REVERSED existing untuk
  (referenceType, referenceId) lebih dulu dan menolak dobel dengan
  pesan jelas (pola vonis tutup tahun F-86), bukan mengandalkan
  P2002 mentah. Idempotency key per intent wajib mengikuti pola
  mutasi finansial existing bila aksi dipanggil dari UI berulang.
- Status dokumen, pembayaran, pajak, posting tetap TERPISAH:
  status WarrantyClaim (operasional) tidak menyiratkan jurnal ada;
  keberadaan jurnal dibaca dari Journal reference, bukan flag klaim.
### §5 Pajak
- Rework garansi covered: TIDAK ada penyerahan kena pajak baru —
  tanpa faktur pajak, tanpa PPN keluaran, tanpa PPh atas "pendapatan
  garansi" (tidak ada pendapatan). Jangan membuat TaxInvoice dari
  dokumen klaim/WO repair covered.
- Rework tertagih (jalur invoice baru §3): perlakuan pajak mengikuti
  invoice normal existing (PPN keluaran bila PKP, DPP = nilai
  pekerjaan tertagih). Mesin F-49 jalur billable_rework hanya contoh
  penyajian piutang/pendapatan; posting nyata WAJIB lewat jalur
  invoice existing, bukan jurnal langsung dari modul garansi.
- Recovery supplier: pemulihan biaya, BUKAN objek PPN dan bukan
  pendapatan. Credit note supplier yang memuat PPN mengikuti jalur
  retur/nota retur existing (F-022 tautan PurchaseReturn) — E3 tidak
  membuat jurnal pajak sendiri.
- Biaya garansi/provisi = beban fiskal mengikuti ketentuan umum
  biaya untuk mendapatkan, menagih, memelihara penghasilan; vonis
  ini TIDAK mengklaim deductibility per komponen — koreksi fiskal
  akhir tahun di luar cakupan (tandai BUTUH-VONIS-AKUNTAN bila
  finance hendak memakai angka provisi untuk SPT sebelum biaya
  aktual terjadi; provisi akuntansi ≠ biaya fiskal otomatis).
### §6 Syarat buka inti (gerbang, semua wajib sebelum BOT 3 bangun)
G1. Lead membuka inti F-021 tahap 3 secara eksplisit (PUTUSAN) —
    vonis ini bukan izin bangun.
G2. Migrasi inti satu paket: 3 akun CoA (510104/210205/110508, seed
    base-data install baru + penambahan aman instalasi berjalan),
    3 kolom SystemSetting §0.4, koreksi header warranty-accounting.
    ts:51-53. Urutan: akun+mapping dulu, jurnal sesudahnya.
G3. Gerbang data §2 dipenuhi ATAU inti dibangun dengan provisi
    MATI (E1/E4 nonaktif, hanya E2 jalur beban-saat-terjadi + E3).
    Mode provisi diaktifkan per kelompok item, bukan global diam-
    diam; saklar aktivasi tercatat (siapa, kapan, metode apa).
G4. Sumber biaya E2 terverifikasi sistem: biaya dari WO repair
    tertaut (repairWorkOrderId existing) — MaterialIssue completed
    (FIFO) + ProductionCost; klaim tanpa WO repair/biaya nol =
    tanpa jurnal E2.
G5. Penegakan invoiceForbidden di server untuk WO repair covered.
G6. Setiap pemanggil jurnal: assertPeriodOpen + cek anti-dobel §4 +
    resolusi mapping fail-closed §0.4 di dalam satu transaksi.
G7. Draf acceptance BOT 6 di §7 lulus termasuk falsifikasi.
### §7 Draf acceptance untuk BOT 6 (Qila)
AC-G1. Coverage assurance, estimasi andal: serah-terima → E1 Dr
  510104 / Cr 210205 seimbang sen; cabut mapping provision → posting
  ditolak berisik, nol jurnal lahir (falsifikasi fail-closed).
AC-G2. Klaim covered biaya 1,5jt, provisi 2jt: E2 Dr 210205 1,5jt /
  Cr sumber biaya 1,5jt; nol SalesInvoice dapat dibuat dari WO
  repair (server menolak); cabut gerbang invoiceForbidden → tes
  merah.
AC-G3. Biaya 2,75jt > provisi 2jt: Dr 210205 2jt + Dr 510104 750rb,
  saldo provisi tidak negatif; jurnal seimbang 2,75jt.
AC-G4. Tanpa provisi (gerbang data belum lolos): seluruh biaya ke
  510104 saat klaim; tidak ada baris 210205.
AC-G5. Recovery possible: nol jurnal, catatan kontinjensi tampil.
  Recovery virtually-certain 900rb: E3 Dr 110508 / Cr 510104; saldo
  provisi TIDAK berkurang oleh E3 (tidak net-off); recovery > biaya
  klaim ditolak/dibatasi biaya.
AC-G6. Klaim rejected dan klaim luar masa: nol jurnal garansi;
  perbaikan berbayar hanya lahir sebagai invoice baru normal.
AC-G7. Posting E1/E2 dua kali (klik ulang/retry): jurnal kedua
  ditolak pesan jelas; total jurnal per reference tetap satu.
AC-G8. Periode terkunci pada tanggal peristiwa: posting ditolak;
  tanggal jurnal tidak digeser diam-diam ke hari ini.
AC-G9. Akhir masa tanpa klaim: E4 Dr 210205 / Cr 510104 sebesar
  saldo; akun pendapatan tidak tersentuh; reversal E4 lewat jurnal
  lawan, jurnal asal utuh.
AC-G10. Rekonsiliasi: saldo GL 210205 = ΣE1−ΣE2−ΣE4 per kelompok;
  laporan lifetime cost job asal menampilkan biaya klaim tanpa
  mengubah invoice asal (WAR-01).
### §8 Sumber
- PSAK 72 PP28–PP33 (garansi assurance vs service) — IAI,
  ED PSAK 72 Lampiran B (resmi IAI):
  https://web.iaiglobal.or.id/assets/files/file_sak/exposure-draft/ED%20PSAK%2072_Pendapatan%20dari%20Kontrak%20Pelanggan.pdf
  (akses 2026-10-22; teks final PSAK 72 di SAK Online IAI).
- PSAK 57 par 14, 24, 31–36, 84 (provisi, estimasi terbaik, aset
  kontinjensi, penggantian pihak ketiga) — IAI:
  https://web.iaiglobal.or.id/PSAK-Umum/39 (akses 2026-10-22).
  Amendemen PSAK 57 (kontrak memberatkan):
  https://web.iaiglobal.or.id/assets/files/file_sak/exposure-draft/DE%20AMENDEMEN%20PSAK%2057.pdf
- PMK 168/2023 (konteks PPh 21 komponen; vonis BR-027-07 PR #367 —
  konteks saja, bukan dasar jurnal garansi):
  https://www.peraturan.go.id/files/permenkeu-no-168-tahun-2023.pdf
- PMK 66/2023 (natura/kenikmatan; konteks saja):
  https://www.peraturan.go.id/files/permenkeu-no-66-tahun-2023.pdf
- Bukti kode live (worktree t_0d982ec6, basis 51f4e471):
  warranty-accounting.ts (mesin F-49 + header usang :51-56),
  warranty-accounting.test.ts 10 tes, warranty.service.ts
  (coverage/claim tahap 1-2 tanpa jurnal, transisi supplier
  R1–R8), schema.prisma WarrantyCoverage:4033/WarrantyClaim:4074/
  journals_reference_unique:3019/SystemSetting tanpa kolom
  warranty*, base-data.ts 510102/510103:866-867, 210201-210204,
  110501-110507, journal.service.ts create/reverse.
### §9 Yang TIDAK divonis / ditunda
- Garansi service berbayar: DITUNDA (§2) — butuh desain produk +
  kolom jenis + alokasi harga PSAK 72; vonis lanjutan bila bisnis
  membuka produknya.
- Tarif/rumus estimasi per kelompok item konkret: milik finance
  dengan data §2; BOT 4 menelaah metode tertulisnya, bukan
  menetapkan persen dari meja ini.
- Deductibility fiskal provisi untuk SPT: BUTUH-VONIS-AKUNTAN
  eksternal (§5).
- UI pengaturan mapping/akun dan layar provisi: BOT 2 sesudah
  kontrak inti BOT 3 stabil; UI tidak menghitung jurnal.
HANDOFF:
- Lead (Nara): PUTUSAN buka inti tahap 3 = gerbang G1; vonis ini
  siap sebagai lampiran kartu inti BOT 3.
- BOT 3 (Bara): jangan bangun sebelum G1–G6; urutan akun→mapping→
  koreksi header modul→pemanggil jurnal; mesin F-49 jangan diubah
  putusannya tanpa kembali ke BOT 4.
- BOT 6 (Qila): draf acceptance AC-G1..G10 di §7; falsifikasi
  wajib: cabut fail-closed mapping, cabut invoiceForbidden, dobel
  posting.
- BOT 2 (Fira): tidak ada pekerjaan UI dari vonis ini sampai
  kontrak inti ada.

---

## VONIS BOT 4 F-2026-10-21-028-I — Implementasi ekspor DJP PPh21 (2026-10-22)

Pemutus: `accounting-finance-tax` (BOT 4). Kartu: t_99a85510.
Sifat: FINAL untuk tahap implementasi ekspor di atas vonis format
F-028 (PR #379, head `8ea58c53`, gate 5/5 PASS, OPEN/BEHIND saat
vonis ini ditulis — dibaca dari branch PR itu, TIDAK menunggu
merge). Vonis ini TIDAK membuka kode, TIDAK mengubah
`src/lib/tax/*`, TIDAK memutus ulang format §A-§F PR #379. Ia
memutus detail implementasi supaya BOT 3 membangun ekspor tanpa
menebak: kontrak data persis, format byte persis, aturan
gagal-ekspor, dan acceptance terverifikasi untuk kartu backend
lanjutan.

Bukti live run ini (worktree t_99a85510, basis `8ff0c7a9`):
- Rekap ADA di main: `src/lib/reports/pph21-recap.ts`
  (`buildPph21Recap`, `PPH21_RECAP_STATUSES=["approved","paid"]`,
  akumulasi `safeAdd(...,2)`) + loader `pph21-recap-data.ts`
  (`loadPph21Recap`, label jujur "bukan berkas ekspor DJP/e-Bupot"
  di baris 69) + tes `pph21-recap.test.ts` (119 baris) dan
  `pph21-recap-data.test.ts` (61 baris). Halaman laporan memanggil
  `loadPph21Recap` (grep `loadPph21Recap` di luar reports = halaman
  laporan pph-21).
- Model nyata: `Payroll` (schema:2872) membawa `employeeId`,
  `period String`, `type String @default("REGULAR")`,
  `grossSalary/pph21/netSalary Decimal(15,2)`,
  `statutorySnapshot Json?`, `paymentDate DateTime?`,
  `startDate/endDate DateTime`, `status String @default("draft")`,
  `@@unique([employeeId, period])`. `Employee` (schema:764)
  membawa `npwp String?`, `idNumber String?` (NIK),
  `maritalStatus String?`, `dependents Int @default(0)`,
  `positionId Int?` → `Position.name`. `SystemSetting`
  (schema:103) membawa `companyTaxId String?` — NPWP pemotong
  hidup di sini; ID TKU 22 digit TIDAK ada field-nya (grep `nitku`
  di schema hanya `counterpartyNitku` pihak lawan, bukan pemotong).
- Snapshot TER nyata (`src/actions/hrm.actions.ts:680-750`):
  `statutorySnapshot.pph21Ter` membawa `method`
  (TER|LEGACY_PRE_TER), `category` (A/B/C), `ratePct`,
  `periodKind` (`monthly`|`final-december`|`final-resignation`|
  `bulk-december-pending-final`), `overWithheld`,
  `maritalStatusRaw`, `dependentsClamped`. Parser berjalan
  `parsePph21TerSnapshot` (pph21-recap.ts:63-74) membaca
  method/category/ratePct/periodKind/overWithheld.
- GAP LIVE (penting, lihat §I.2): builder berjalan TIDAK
  mengeluarkan baris per (karyawan, masa). `Pph21RecapPeriodRow`
  hanya agregat masa; `Pph21RecapEmployeeRow` hanya agregat
  tahunan per karyawan. Kolom ekspor per baris karyawan-masa
  (NIK, kode PTKP, tanggal pemotongan, jumlah slip se-masa,
  periodKind per slip) TIDAK tersedia dari output builder
  berjalan — ekspor TIDAK boleh merekonstruksi dari dua agregat
  itu.

### I.1 Keputusan lapis (mengikat, meneruskan §B PR #379)

1. **Lapis 1 — ekspor internal CSV: SAH dibangun sekarang**,
   sesudah gerbang §I.6. Ini satu-satunya berkas yang boleh lahir
   dari kartu backend lanjutan. Nama/label jujur tetap "rekap
   internal", BUKAN "berkas DJP/e-Bupot".
2. **Lapis 2 — impor Coretax BPMP (XML/converter DJP): TETAP
   DILARANG** sampai seluruh syarat §D lapis 2 PR #379 terpenuhi
   (ID TKU 22 digit terverifikasi di master + NPWP pemotong 16
   digit + satu uji unggah Coretax manusia tercatat + vonis BPA1
   terpisah). Vonis ini TIDAK membuka lapis 2 dan TIDAK memberi
   format XML — menebak XSD di luar converter resmi v.3 = dilarang.
3. **BPA1 masa terakhir: belum divonis formatnya di sini.**
   Vonis ini hanya memutus perlakuan baris masa terakhir di dalam
   ekspor internal (§I.5); format BPA1 = vonis BOT 4 terpisah
   sebelum dibangun (syarat §D(c) PR #379 tetap berlaku).

### I.2 Kontrak data ekspor (prasyarat BOT 3, tanpa migrasi)

Ekspor dibangun di atas read-model rekap yang sama — DILARANG
query agregasi kedua. Karena output builder berjalan belum cukup
(GAP live di bukti awal seksi ini), BOT 3 WAJIB memperluas builder murni
`buildPph21Recap` (atau builder pendamping murni di berkas yang
sama, tanpa query baru) dengan keluaran baris per karyawan-masa:

```
Pph21ExportRow {
  period: string            // "YYYY-MM" dari Payroll.period
  employeeId: number | null
  employeeName: string
  npwp: string | null       // Employee.npwp mentah (format di §I.3)
  nik: string | null        // Employee.idNumber mentah
  ptkpCode: string | null   // turunan §I.4; null = temuan
  terCategory: string | null// snapshot pph21Ter.category
  taxObjectCode: "21-100-01"
  gross: number             // Σ grossSalary slip se-(karyawan,masa)
  terRatePct: number | null // snapshot ratePct; null pada masa final
  pph21: number             // Σ pph21 slip se-(karyawan,masa)
  overWithheld: number      // snapshot masa final; 0 selain itu
  withholdingDate: string   // "YYYY-MM-DD" per §I.3 butir 15
  method: "TER"|"LEGACY_PRE_TER"|"UNKNOWN"
  periodKind: string | null // monthly|final-*|bulk-december-pending-final
  slipCount: number         // jumlah slip tergabung baris ini
  slipTypes: string[]       // type slip tergabung (REGULAR/THR/dll)
}
```

Aturan kontrak:
- Baris diturunkan dari slip yang sama yang diakui builder:
  `status IN (approved, paid)` saja, dikelompokkan per
  `(employeeId ?? nama, period)`. Satu karyawan dua baris pada
  masa sama = cacat (penjaga §I.7 AC-2).
- Loader ekspor memakai jalur data yang sama dengan
  `loadPph21Recap` (satu `prisma.payroll.findMany` rentang yang
  sama, map Decimal→number yang sama). Bila BOT 3 perlu field
  tambahan di select (`employee.idNumber`, `startDate/endDate/
  paymentDate`, `type`, `employee.maritalStatus/dependents/
  position.name`), tambahkan ke select loader rekap yang sama —
  JANGAN buat loader kedua. Menambah select = ubah kontrak loader;
  tes loader existing wajib tetap hijau.
- Ekspor TIDAK menghitung ulang pajak: `gross`/`pph21` = jumlah
  angka slip beku (`safeAdd(...,2)`), persis builder.
- Identitas karyawan dibaca dari master saat ekspor (nama/NPWP/
  NIK/posisi = nilai berjalan), angka dari slip beku. Bila master
  berubah sesudah slip terbit, ekspor ulang memuat identitas baru
  tetapi angka lama — itu sebabnya bukti rekonsiliasi §I.6 wajib
  tersimpan bersama berkas (jejak nilai saat ekspor).

### I.3 Format file persis (byte-level, mengikat)

Satu masa per berkas. Format:

- **Encoding:** UTF-8 **tanpa BOM**. Baris pertama = header.
- **Pemisah:** `;` (titik koma). **Akhir baris:** CRLF (`\r\n`)
  termasuk baris terakhir. (Dipilih CRLF: berkas dibuka
  spreadsheet Indonesia/Windows; vonis PR #379 menetapkan `;` +
  UTF-8, akhir baris kini dipersis di sini agar tes byte-persis
  mungkin.)
- **Kutip:** field yang mengandung `;`, `"`, atau newline dibungkus
  `"` ganda, `"` di dalam digandakan (RFC 4180 dengan pemisah `;`).
  Nama karyawan adalah satu-satunya field bebas-teks; tetap wajib
  lolos aturan kutip ini — JANGAN sanitasi/mengubah nama.
- **Angka:** tanpa pemisah ribuan, desimal titik, tepat 2 angka
  sen (`1234567.89`); nol = `0.00`; negatif dilarang (penjaga
  menolak, bukan menulis `-`). Tarif: desimal titik, maks 2 angka
  (`2`, `2.5`, `0.75` — tanpa `,`). Persen tanpa simbol `%`.
- **Tanggal:** `YYYY-MM-DD`. **Masa:** kolom terpisah bulan (1-12,
  tanpa nol depan) dan tahun (4 digit) mengikuti kolom BPMP
  converter, supaya pemetaan lapis 2 kelak mekanis.
- **Identitas:** NPWP/NIK = digit saja (strip `.`, `-`, spasi dari
  nilai master); selain digit sesudah strip = temuan pemblokir
  baris itu (§I.6 kelas B). Kosong = sel kosong, BUKAN `0`/strip.
- **Urutan baris:** `employeeId` naik, `employeeId` null terakhir
  lalu nama naik (locale `id-ID`). Urutan deterministik = syarat
  idempotensi §C.5 PR #379.
- **Nama file:** `pph21-rekap-internal-YYYY-MM.csv` (satu masa).
  Pembetulan: `pph21-rekap-internal-YYYY-MM-pembetulan-N.csv`
  (N mulai 1; berkas asal tidak ditimpa — §I.6 butir 6).
  Ekspor tahunan per karyawan (untuk bukti potong manual):
  `pph21-rekap-internal-YYYY.csv` dengan kolom yang sama, satu
  baris per (karyawan, masa) dalam tahun itu, urut masa lalu
  employeeId — BUKAN satu baris setahun, agar total tahunan =
  jumlah baris dan rekonsiliasi tetap per masa.
- **Header persis** (17 kolom, urutan ini, tanpa spasi):

```
masa_bulan;masa_tahun;employee_id;nama;npwp;nik;kode_ptkp;kategori_ter;kode_objek_pajak;penghasilan_bruto;tarif_ter_persen;pph21_terpotong;lebih_potong;tanggal_pemotongan;metode;jenis_masa;jumlah_slip
```

Pemetaan kolom (sumber → kolom):

| # | Kolom file | Sumber | Aturan gagal |
|---|-----------|--------|--------------|
| 1 | `masa_bulan` | `parsePph21Period(period).month` | period tak terbaca → slip tak masuk + dihitung `unreadablePeriodSlips`; masa dengan hanya slip tak terbaca = ditolak kosong (§I.6) |
| 2 | `masa_tahun` | `parsePph21Period(period).year` | sama |
| 3 | `employee_id` | `Payroll.employeeId` | null → sel kosong + temuan kelas C (identitas DJP tak bisa diturunkan) |
| 4 | `nama` | `Employee.name` saat ekspor | kosong → BLOKIR baris (kelas A) |
| 5 | `npwp` | `Employee.npwp` digit-saja | kosong/invalid → temuan kelas B: **memblokir label "siap impor"**, tidak memblokir ekspor internal (lihat §I.6) |
| 6 | `nik` | `Employee.idNumber` digit-saja | sama kelas B; NPWP dan NIK dua-duanya kosong = kelas B berat (baris tak teridentifikasi DJP) |
| 7 | `kode_ptkp` | §I.4 dari `maritalStatusRaw`+`dependentsClamped` snapshot (fallback master saat ekspor bila snapshot tak terbaca) | tak terturunkan → kosong + temuan kelas B |
| 8 | `kategori_ter` | snapshot `pph21Ter.category` | TER tanpa kategori → kosong + temuan kelas B; LEGACY/UNKNOWN → kosong |
| 9 | `kode_objek_pajak` | konstanta `21-100-01` | subjek bukan pegawai tetap DILARANG masuk berkas ini (§I.5 butir 5) |
| 10 | `penghasilan_bruto` | Σ `Payroll.grossSalary` se-(karyawan,masa) | < 0 → BLOKIR (kelas A) |
| 11 | `tarif_ter_persen` | snapshot `pph21Ter.ratePct` slip masa itu | masa final/LEGACY/UNKNOWN → kosong (BUKAN 0); TER bulanan tanpa ratePct → temuan kelas B |
| 12 | `pph21_terpotong` | Σ `Payroll.pph21` se-(karyawan,masa) | < 0 → BLOKIR (kelas A); selisih vs builder → BLOKIR masa (§I.6) |
| 13 | `lebih_potong` | snapshot `overWithheld` masa final | selain masa final wajib `0.00`; masa final tanpa snapshot terbaca → kosong + temuan kelas B |
| 14 | `tanggal_pemotongan` | slip terakhir terbit pada masa itu: `paymentDate ?? endDate`, format `YYYY-MM-DD` | tak ada tanggal terbaca → BLOKIR baris (kelas A); tanggal di luar masa kolom 1-2 → temuan kelas B (converter DJP menolak tanggal < masa; tanggal > akhir masa juga ditandai) |
| 15 | `metode` | `parsePph21TerSnapshot(...).method` ?? `UNKNOWN` | campuran metode se-(karyawan,masa) → temuan kelas B, metode ditulis dari slip terakhir |
| 16 | `jenis_masa` | snapshot `periodKind` (`monthly`/`final-december`/`final-resignation`/`bulk-december-pending-final`) | `bulk-december-pending-final` → BLOKIR masa (§I.5 butir 2) |
| 17 | `jumlah_slip` | hitung slip tergabung | ≥2 wajib konsisten dengan `slipTypes` (REGULAR+THR tergabung, §I.5 butir 4) |

Kolom `dpp_pengurang` pada vonis PR #379 §B kolom 11: **TIDAK
jadi kolom file.** Alasan dipertahankan dari PR #379: BPMP tidak
mengenal DPP per baris; DPP/pengurang hanya bermakna di hitung
ulang masa terakhir dan angkanya sudah terwujud sebagai
`pph21_terpotong` final + `lebih_potong`. Menulis kolom DPP
kosong/0 pada berkas = angka palsu. Pengurang Pasal 10 masa final
(JHT/JP karyawan) tampil di bukti rekonsiliasi (§I.6 butir 5),
bukan di baris berkas. Ini penyempitan sadar atas tabel PR #379,
bukan kontradiksi: 17 kolom di sana termasuk kolom informatif
itu; berkas persis di sini 17 kolom tanpa DPP, dengan
`jenis_masa` menggantikannya karena `periodKind` menentukan
jalur DJP baris (BPMP vs BPA1) — informasi yang wajib terlihat
di berkas, bukan hanya di UI.

### I.4 Kode PTKP dari data berjalan (tanpa field baru)

Kode PTKP (untuk `StatusTaxExemption` BPMP kelak + kolom 7)
diturunkan, tidak disimpan baru:

- Kawin/tidak: `isMarriedStatus(maritalStatus)` existing
  (payroll-statutory.service.ts) — DIPAKAI ULANG, dilarang parser
  kedua (F-026 §1 mengikat).
- Tanggungan: `dependents` ter-clamp `min(3,max(0,floor))`.
- Peta: tidak kawin → `TK/<dep>`; kawin → `K/<dep>`; status
  gabungan penghasilan istri (HB) TIDAK dapat diturunkan dari
  field berjalan → karyawan HB tampil `K/<dep>` + temuan kelas B
  "HB tak terverifikasi dari data" (jangan tebak HB).
- Sumber utama = snapshot slip (`maritalStatusRaw`,
  `dependentsClamped`) agar konsisten dengan kategori TER slip;
  snapshot tak terbaca → fallback master saat ekspor + temuan
  kelas B. Selisih kode-vs-kolom (`statusDependentsMismatch`
  existing): kolom menang (F-026 §1), selisih = temuan kelas C.
- Kategori TER (kolom 8) TIDAK diturunkan ulang dari PTKP di
  ekspor — dibaca dari snapshot slip. Ekspor yang menghitung
  ulang kategori = melanggar "snapshot, bukan hitung-ulang".

### I.5 Kasus tepi (mengikat)

1. **Masa Desember karyawan penuh-tahun BUKAN otomatis final di
   berkas.** Baris Desember dengan `periodKind=final-december`
   adalah hasil hitung ulang Pasal 17 (F-026 §4): kolom 11
   (tarif TER) kosong, kolom 12 = PPh21 masa terakhir hasil
   hitung ulang (bisa 0), kolom 13 = `overWithheld`. Di lapis 1
   baris ini SAH masuk berkas internal dengan `jenis_masa=
   final-december`; di lapis 2 baris ini DILARANG masuk BPMP —
   jalurnya BPA1 (belum dibuka, §I.1 butir 3).
2. **Desember `bulk-december-pending-final` = BLOKIR ekspor masa
   itu.** Snapshot itu estimasi TER massal yang belum hitung
   ulang final (penjaga existing di hrm.actions.ts:1740 menolak
   finalisasi; ekspor meneruskan penolakan yang sama). Pesan
   wajib mengarahkan: "hitung ulang masa terakhir per karyawan
   dulu". Ekspor parsial "yang sudah final saja" dalam masa yang
   sama = DILARANG (satu masa satu berkas utuh).
3. **Final resignasi tengah tahun:** bulan berhenti =
   `jenis_masa=final-resignation`, perlakuan sama butir 1
   (tarif kosong, lebih-potong tampil). Karyawan yang sama TIDAK
   boleh punya dua baris `final-*` dalam satu tahun di berkas —
   penjaga existing sudah menolak hitung ulang kedua saat slip
   dibuat; ekspor memeriksa ulang dan BLOKIR bila menemukan dua
   (data warisan/korupsi, bukan untuk dipilih diam-diam).
4. **Penghasilan tidak teratur (THR/bonus/dll): TERGABUNG.**
   Slip `type != REGULAR` se-(karyawan,masa) digabung ke bruto +
   PPh21 baris yang sama (F-026 §2); ekspor DILARANG memisah
   baris/tarif per type. `jumlah_slip` ≥ 2 + `slipTypes` di bukti
   rekonsiliasi menjadi bukti penggabungan. Baris dengan bruto
   gabungan tetapi PPh21 hanya dari satu slip (slip kedua belum
   approved) = bukan kasus ekspor: slip belum final memang tidak
   ikut; temuan `excludedSlips` wajib tampil agar operator sadar
   ada slip menggantung pada masa itu.
5. **Di luar cakupan berkas ini:** bukan-pegawai, TER harian,
   peserta kegiatan, PPh 26, pesangon final (objek 21-401-xx),
   pensiun berkala (21-100-02). Data berjalan hanya memuat slip
   `Payroll` pegawai; bila kelak sumber lain muncul, DILARANG
   dicampur ke berkas 21-100-01 ini — vonis objek terpisah.
6. **Slip legacy pra-TER / snapshot rusak:** ikut berkas apa
   adanya dengan `metode=LEGACY_PRE_TER|UNKNOWN`, tarif/kategori
   kosong, angka slip beku (F-026 §5). Temuan kelas B, bukan
   blokir — berkas internal adalah rekap jujur, bukan klaim
   metode benar.
7. **Karyawan tanpa `employeeId` (baris warisan):** dikelompokkan
   per nama persis pola builder (`empKey`); `employee_id` kosong
   = temuan kelas C; dua nama sama persis tanpa id akan tergabung
   — temuan wajib menyebut risiko ini bila `employeeId` null > 0.
8. **Lebih-potong belum dikembalikan** (`overWithheld > 0`):
   tampil di kolom 13 + bukti rekonsiliasi; BUKAN pengurang baris
   masa/tahun berikutnya di berkas mana pun (pengembalian =
   pembayaran nyata, F-026 §4).
9. **Masa tanpa slip approved/paid:** ekspor DITOLAK "tidak ada
   data" — dilarang berkas header-saja (PR #379 §E.3
   dipertahankan). Rekap layar tetap menampilkan notice kosong.
10. **Koreksi sesudah ekspor:** berkas lama beku. Slip koreksi
    baru → ekspor pembetulan bernomor (§I.3 nama file) dengan
    bukti rekonsiliasi baru yang merujuk nomor berkas asal;
    sistem TIDAK menimpa/menghapus berkas asal.

### I.6 Aturan gagal-ekspor (fail-closed, tiga kelas)

Prinsip: data tak lengkap = TOLAK, bukan berkas parsial. Tiga
kelas temuan, jangan dicampur:

- **Kelas A — BLOKIR masa (berkas tidak terbit sama sekali):**
  selisih rekonsiliasi > 0,00 (§C.1 PR #379); nama kosong; angka
  negatif; tanggal pemotongan tak terbaca; masa mengandung
  `bulk-december-pending-final`; dua masa-final se-karyawan
  setahun; masa kosong (butir I.5.9). Pesan penolakan menyebut
  masa + karyawan + alasan per baris terdampak (daftar, bukan
  satu pesan umum).
- **Kelas B — berkas internal terbit, label "BELUM SIAP IMPOR
  DJP":** NPWP/NIK kosong/invalid, dua-duanya kosong, kode PTKP/
  kategori/tarif tak terbaca, tanggal di luar masa, metode
  campuran/legacy/unknown, HB tak terverifikasi. Berkas internal
  tetap sah sebagai rekap; label siap-impor DILARANG tampil
  selama satu pun temuan kelas B ada. (Lapis 2 kelak: kelas B =
  blokir per baris di gerbang konversi, diputus vonis BPA1/BPMP
  lanjutan — bukan di sini.)
- **Kelas C — temuan tampil, tidak mengubah label:** slip
  terkecuali (draft/dll) pada masa itu, period tak terbaca,
  `employeeId` null, selisih kode PTKP-vs-kolom, lebih-potong
  belum kembali. Semua dihitung builder/ekspor dan WAJIB tampil
  di muka hasil ekspor + bukti rekonsiliasi.

Bukti rekonsiliasi per berkas (wajib tersimpan bersama berkas,
format bebas UI asal terstruktur & terunduh/diarsip): masa,
nama file + nomor pembetulan, jumlah slip, jumlah karyawan,
Σ bruto + Σ PPh21 dari builder, Σ bruto + Σ PPh21 hasil jumlah
baris berkas, selisih (wajib `0.00`), hitungan temuan kelas
A/B/C per jenis, waktu + pelaku ekspor. Tanpa bukti ini berkas
= draf. BOT 3 menentukan penyimpanan (tabel/log existing pola
idempotency finansial) — TANPA migrasi baru tanpa koordinasi
BOT 3/BOT 4; bila penyimpanan butuh tabel baru, berhenti dan
eskalasi ke BOT 4, jangan karang schema di kartu ekspor.

Idempotensi ekspor: ekspor ulang masa sama tanpa slip koreksi
baru menghasilkan byte identik (urutan §I.3 + angka beku).
Penjaga mutasi finansial existing tidak dipakai ulang untuk
ekspor baca ini; yang wajib adalah determinisme byte + bukti
rekonsiliasi, bukan idempotency-key mutasi.

### I.7 Acceptance kartu backend lanjutan (untuk BOT 6, mengikat)

BOT 6 menguji pada implementasi BOT 3 kelak; BOT 4 menetapkan
kasusnya sekarang:

- **AC-1 Byte-persis.** Fixture 2 karyawan × 1 masa (satu
  karyawan REGULAR+THR tergabung): berkas hasil dibandingkan
  byte-per-byte dengan string harapan tertulis di tes (header §I.3
  + CRLF + urutan + format angka). Bukan "parse lalu bandingkan
  objek" — byte.
- **AC-2 Falsifikasi geser kolom (WAJIB MERAH).** Mutasi satu:
  tukar posisi kolom `penghasilan_bruto` ↔ `pph21_terpotong`
  (atau geser satu kolom mana pun) pada generator → tes AC-1
  MERAH. Cabut/pulihkan → hijau. Tes yang tetap hijau sesudah
  kolom digeser = tes gagal, bukan implementasi lolos.
- **AC-3 Rekonsiliasi persis sen.** Σ baris berkas per masa ==
  `buildPph21Recap.periods[].gross/pph21` == Σ manual slip
  approved/paid. Ubah satu `Payroll.pph21` +0,01 di fixture →
  ekspor terblokir kelas A dengan pesan selisih. Cabut penjaga
  rekonsiliasi → tes MERAH.
- **AC-4 Desember pending-final diblokir.** Fixture slip
  `bulk-december-pending-final` pada masa 2026-12 → ekspor masa
  itu ditolak, berkas tidak ada; masa 2026-11 karyawan sama
  tetap bisa diekspor.
- **AC-5 Masa final sah.** Slip `final-december` dengan
  `overWithheld=50000` → baris terbit: tarif kosong,
  `lebih_potong=50000.00`, `jenis_masa=final-december`; slip
  `final-resignation` bulan 2026-06 perlakuan sama.
- **AC-6 Kosong ditolak.** Masa tanpa slip approved/paid (termasuk
  hanya draft) → penolakan "tidak ada data", tidak ada berkas;
  `excludedSlips` tampil di pesan/bukti.
- **AC-7 Kelas B tidak memblokir internal, memblokir label.**
  Karyawan NPWP+NIK kosong → berkas terbit dengan sel identitas
  kosong + label siap-impor tidak tampil/bernilai false; perbaiki
  master → ekspor ulang label bersih, angka tidak berubah.
- **AC-8 Determinisme.** Ekspor masa yang sama dua kali → hash
  byte sama. Tambah slip koreksi → nama berkas pembetulan-1,
  berkas asal tidak berubah byte-nya.
- **AC-9 Satu sumber.** Tes wiring: ekspor memanggil
  builder/loader rekap yang sama (mock/spy) — query agregasi
  kedua (findMany payroll di modul ekspor di luar loader rekap)
  = tes MERAH.
- **AC-10 Kutip & identitas.** Nama mengandung `;` dan `"` →
  ter-escape RFC 4180 dan parse-balik utuh; NPWP berformat
  `01.234.567.8-091.000` → tertulis digit-saja; NPWP berisi huruf
  → temuan kelas B (bukan dibersihkan diam-diam).

Gate implementasi BOT 3 (pola repo): `npx tsc --noEmit`,
eslint berkas terdampak, `npx vitest run` atas tes ekspor baru +
`pph21-recap.test.ts` + `pph21-recap-data.test.ts` (regresi
kontrak loader). Tanpa migrasi pada kartu ini.

### I.8 Yang TIDAK divonis di sini

- Format XML BPMP / XLSX converter / BPA1: vonis terpisah BOT 4
  sesudah syarat §D lapis 2 PR #379 (ID TKU master adalah
  prasyarat data — field-nya belum ada; usulan field/setting ID
  TKU = kartu data BOT 3 dengan vonis BOT 4 lanjutan, bukan
  bagian kartu ekspor ini).
- Jurnal akuntansi atas ekspor/rekonsiliasi: tidak ada. Ekspor
  adalah bacaan; kewajiban setor PPh21 tetap dari jalur pajak
  existing.
- UI tombol ekspor + unduhan: BOT 2 sesudah kontrak berkas BOT 3
  stabil; label "bukan berkas ekspor DJP/e-Bupot" dipertahankan
  sampai lapis 2 dibuka.
- Angka/metode PPh21: tetap F-026 FINAL; vonis ini tidak
  menghitung ulang apa pun.

### Handoff F-2026-10-21-028-I

- BOT 3 (backend): bangun Lapis 1 persis §I.2-§I.6 — perluas
  builder rekap (tanpa query kedua, tanpa migrasi), generator CSV
  byte-persis §I.3, gerbang kelas A/B/C §I.6. Berhenti-eskalasi
  bila bukti rekonsiliasi butuh tabel baru. Lapis 2/BPA1 JANGAN
  dibangun.
- BOT 6 (QA): acceptance AC-1..AC-10 §I.7; falsifikasi wajib
  AC-2 (geser kolom) + AC-3 (cabut penjaga). Uji unggah Coretax
  tetap manusia, di luar CI, hanya sesudah lapis 2 dibuka kelak.
- BOT 2 (frontend): belum ada pekerjaan UI dari vonis ini;
  sesudah BOT 3 selesai, tampilkan temuan kelas A/B/C + bukti
  rekonsiliasi apa adanya, tanpa hitung ulang.
- Lead: kartu backend lanjutan dapat dibuat dari §I.7 sebagai
  acceptance; dependensi merge PR #379 tidak menghalangi BOT 3
  mulai (vonis format terbaca dari branch #379 / seksi ini).

---

---

## 2026-10-22 01:33 WIB — Domain (d) penjualan: SPEC F-2026-10-21-018 harga bertingkat kuantitas

Spec saja, tanpa kode. Target penjualan TIDAK dibahas di bagian ini
(ditunda sadar sampai F-2026-10-21-016 atribusi sales dipakai; jangan
spec-kan target di follow-up kartu ini).

Benchmark resmi (akses 2026-10-22):
- Accurate: harga grosir berubah OTOMATIS berdasar kuantitas; contoh
  harga normal Rp200.000, "Untuk Kts Diatas" 10 -> qty 15 memakai
  Rp180.000/pcs, qty <= 10 tetap Rp200.000/pcs:
  https://help.accurate.id/product/accurate-online/fitur-aol/penjualan/menerapkan-harga-grosir-penjualan/
- Accurate POS: harga grosir per kategori pelanggan + syarat kuantitas
  ("Untuk kts di atas" 8 -> Rp80.000/pcs), bila kategori pelanggan sudah
  terpasang pada transaksi:
  https://help.accurate.id/product/accurate-pos/pengaturan-aplikasi/pesanan-baru/tambah-harga-grosir/
- Zahir: Multi Price memisahkan harga per golongan pelanggan (distributor/
  agen/pengecer/pembeli akhir); Multi Discount menyebut acuan diskon
  bertingkat = golongan pelanggan + jumlah barang dibeli:
  https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
  + https://help.zahironline.com/portal/id/kb/articles/penerapan-multi-price-dengan-satuan-ukuran-yang-berbeda

Catatan benchmark: kedua vendor memisahkan (a) golongan/kategori pelanggan
dan (b) syarat kuantitas. Di Accurate contohnya EKSKLUSIF tegas
(> 10, bukan >= 10). Di Silengkap, minQty VendorItemPrice sudah punya
pola inklusif existing (schema:493-513, unique [vendorId, itemId, minQty];
default 1.00). Dua semantik yang berbeda itu JANGAN dicampur — lihat
BR-TIER-01 di bawah.

### Inventarisasi terverifikasi (2026-10-22, basis HEAD 8ff0c7a9)

Sudah ada:
- `CustomerPriceList` (schema:515-534): customerCategoryId? (null = semua
  kategori), itemId, price, effectiveDate?, notes, isActive, @@unique
  [customerCategoryId, itemId, effectiveDate]. TANPA minQty/min_quantity.
- `VendorItemPrice` (schema:493-513): minQty Decimal(15,2) default 1.00,
  @@unique [vendorId, itemId, minQty]. INI pola skema yang dirujuk backlog
  untuk ditiru di CustomerPriceList.
- Service tahap 1 `customer-price-list.service.ts:1-14`: eksplisit
  "Tahap 1 hanya daftar harga per kategori pelanggan dan/atau per item +
  tanggal efektif, diterapkan saat baris dibuat. Tanpa PricingRule umum,
  tanpa aturan qty/promo."; `:56-109` pickPriceListPrice tanpa qty;
  `:174-199` priceDocumentLines per baris.
- Vonis akuntansi yang SUDAH mengikat lapis ini (`service.ts:1-16`):
  (1) price-list hanya memotong harga jual dan diterapkan SEBELUM
  subtotal -> taxAmount (DPP PPN ikut turun); (2) prioritas: price-list
  menjadi unitPrice, diskon MANUAL BARIS menimpa di atasnya (manual
  menang), cap diskon 100% nilai baris; (3) jual di bawah HPP = peringatan
  lunak, TIDAK memblokir jurnal.
- Jalur masuk yang LIVE (`sales.actions.ts:48-67` applyPriceListLines,
  `:1406-1412` createSalesInvoice): resolver diterapkan ke baris invoice
  langsung dari form (`!v.salesOrderId`) SAJA. Baris konversi SO
  mempertahankan harga SO. `updateSalesInvoice` (sales.actions.ts:2315+)
  TIDAK memanggil applyPriceListLines — cocok dengan komentar
  `sales.actions.ts:41-46` "diterapkan hanya saat baris dibuat".
- Baris dokumen: QuotationItem (schema:1241-1260), SalesOrderItem
  (schema:1343-1357), SalesInvoiceItem (schema:1460-1476), SalesReturnItem
  (schema:1555-1581) — TIDAK ADA satu pun yang menyimpan sumber harga
  (priceListPriceId / tier minQty / fromPriceList). `fromPriceList`
  hanya ada di tipe hasil service (`service.ts:33-44`) dan di tes.
- Retur live: createSalesReturn (`sales.actions.ts:1688-1725`)
  resolvePrice = unitPrice faktur asal (invoicePriceMap dari
  SalesInvoiceItem.unitPrice) -> fallback Item.price -> fallback cost.
  Harga retur DIBEKUKAN dari faktur asal, BUKAN di-resolve ulang dari
  price-list. Snapshot pajak (return-snapshot.ts:39-55):
  returnDpp = qty x price beku (safeRound sen), returnVat = DPP x tarif
  efektif faktur asal; guard kumulatif keras di accounting.hook.ts:1246-1293.
- Permission katalog (module-catalog.generated.ts:140-170):
  customer_price_lists view/create/edit/delete saja (tanpa approve);
  sales_invoices view/create/edit/delete/approve/post; sales_orders
  view/create/edit/delete/approve; sales_returns view/create/edit/delete.
- Halaman kelola daftar harga pelanggan BELUM ADA: grep
  CustomerPriceList|harga-pelanggan di src/app = 0 hasil; REVALIDATE
  "/penjualan/harga-pelanggan" (customer-price-list.actions.ts:14)
  menunjuk route yang belum ada. UI kelola = tahap UI yang sudah dicatat
  backlog (F-PRICELIST-01 tahap 2); kartu ini TIDAK membuat kartu UI baru
  untuk kelola daftar harga, hanya menambah requirement sumber harga
  pada baris invoice bila kolom sumber harga benar-benar ditambah.

Belum ada / parsial (bukti grep run ini):
- minQty di CustomerPriceList: ABSEN (schema:515-534).
- Resolusi qty-aware: ABSEN (pickPriceListPrice tanpa parameter qty).
- Sumber harga persist di baris dokumen: ABSEN (schema baris di atas).
- Target penjualan: ABSEN sadar, TIDAK di-spec di sini (lihat
  "Yang TIDAK diusulkan").

#### F-2026-10-21-018 (d) P2 — Spesifikasi aturan harga jual bertingkat kuantitas

Status item: PARSIAL (lapis kategori+tanggal tahap 1 sudah live; lapis
kuantitas belum). Bagian ini MENETAPKAN aturan bisnis supaya BOT 3 bisa
implementasi tanpa menebak aturan tingkat. Target penjualan DITUNDA
sadar — bukan bagian spec ini (lihat "Yang TIDAK diusulkan").

##### Business rules register (label bukti wajib dibaca)

| ID | Aturan | Status | Bukti / sumber |
|---|---|---|---|
| BR-TIER-01 | `minQty` INKLUSIF: baris tingkat berlaku bila `qtyBaris >= minQty`. Batas tegas: qty tepat = minQty MEMAKAI harga tingkat itu; qty di bawahnya TIDAK. | USULAN (pola existing `VendorItemPrice.minQty` `schema:493-513`, default 1.00) — MENOLAK semantik Accurate "> 10" supaya dua model tier (beli/jual) di repo ini punya satu semantik batas yang sama; dua semantik berbeda dalam satu codebase = sumber bug operator. Bukan putusan accountant. Lihat Q1. | schema:493-513; Accurate help URL di atas |
| BR-TIER-02 | Pemenang tingkat: di antara baris yang MEMENUHI (qty >= minQty), yang menang = minQty TERBESAR yang masih terpenuhi ("tingkat tertinggi yang memenuhi"). Bukan minQty terkecil, bukan harga terendah/termurah. | USULAN. Pola "maks yang lolos" = satu-satunya yang membuat tabel tingkat monotonic bila operator mengisi tingkat dari murah->mahal; pemenang "termurah" akan selalu memilih diskon terbesar dan membuat tingkat menengah tak pernah terpakai. Lihat Q2. | `service.ts:56-76` pola sort pemenang existing (kategori spesifik > umum, tanggal terbaru) diperluas |
| BR-TIER-03 | Urutan pemenang PENUH (per baris, deterministik, tidak bergantung urutan array/createdAt selain tanggal efektif): (1) cocok itemId; (2) isActive; (3) effectiveDate <= tanggal dokumen (null = selalu berlaku) — dipertahankan dari tahap 1; (4) qty >= minQty (null minQty diperlakukan sebagai 1); (5) kategori spesifik (customerCategoryId = kategori pelanggan) menang atas kategori umum (null); (6) minQty terbesar; (7) effectiveDate terbaru; (8) TIDAK ada tie-break ke-4 lain: bila masih ada dua baris setara penuh (kategori sama + minQty sama + effectiveDate sama), itu ERROR DATA, bukan pilihan diam-diam: unique constraint [customerCategoryId, itemId, effectiveDate] diganti [customerCategoryId, itemId, minQty, effectiveDate] dan action menolak duplikat (kategori, item, minQty, tanggal efektif) dengan pesan menyebut penyebabnya, pola existing `customer-price-list.actions.ts:44-53` dan `vendor-price.actions.ts:40-49`. | USULAN (perluasan deterministik dari `service.ts:56-76`). Tie-break implisit createdAt/urutan DB DILARANG: hasil harga tidak boleh berubah karena urutan fetch. | service.ts:56-76; schema:529; actions :44-53 |
| BR-TIER-04 | `minQty` diukur dari QTY SATU BARIS dokumen, BUKAN gabungan qty beberapa baris item yang sama dalam satu dokumen. Dua baris item sama 6 + 6 TIDAK menjadi 12 untuk memicu tingkat >= 10. | USULAN kuat (lihat Q3). Alasan: (a) SalesInvoiceItem/SalesOrderItem adalah baris independen (bisa beda gudang/serial/uom/diskon manual); menggabungkan memaksa aturan penggabungan kedua yang belum diatur (diskon baris mana yang dipakai?); (b) grid UI mengedit baris satu per satu — harga baris akan berubah saat baris LAIN diubah, membingungkan operator; (c) pola existing `resolveLinePricing({qty})` dan `priceDocumentLines` per baris (service.ts:174-199). Bila suatu hari fleet order butuh agregat, itu fitur terpisah dengan aturan gabung sendiri, bukan perubahan diam-diam resolver ini. | service.ts:174-199; schema baris :1343-1476 |
| BR-TIER-05 | Qty yang dibandingkan = qty BARIS DALAM SATUAN DOKUMEN (uom baris), BUKAN qty hasil konversi ke satuan dasar. SalesInvoiceItem.uom (schema:1460-1476) — dokumen boleh bertransaksi dalam satuan alternatif (uom.service.ts:5-42: stok selalu satuan dasar; 1 BOX = 12 PCS). Membandingkan qty dokumen apa adanya = "10 BOX" memicu tingkat >= 10 walau isi 120 PCS, dan "9 PCS" tidak memicu tingkat >= 10 walau 9 PCS < 10 PCS: konsisten DENGAN YANG DILIHAT OPERATOR di baris. Konversi ke base UoM untuk ambang harga adalah Q4 terbuka (membutuhkan owner putus: ambang harga adalah aturan komersial terhadap angka yang diketik operator, atau aturan fisik terhadap isi?). DEFAULT spec ini: qty dokumen apa adanya, tanpa konversi. | USULAN + BUTUH-VONIS pemilik proses (team-lead), BUKAN accountant. | uom.service.ts:5-42; schema:1460-1476 |
| BR-TIER-06 | Satuan tingkat (`minQty` Decimal(15,2), schema pola VendorItemPrice) dibandingkan apa adanya terhadap qty Decimal(15,2) baris, TANPA pembulatan ke bilangan bulat. qty 9,99 TIDAK memicu minQty 10; qty 9,995 juga tidak (tidak ada round-half-up ke 10). Presisi Decimal(15,2) kedua sisi = perbandingan eksak 2 desimal. | USULAN. Pembulatan diam-diam (floor/ceil/round) DILARANG: qty pecahan sah di repo ini (SalesReturnItem.qty Math.max(0.01,...), uom pecahan). | schema:493-513; schema:1460-1476 |
| BR-TIER-07 | Harga manual TIDAK mengalahkan harga tingkat sebagai unitPrice. Merujuk vonis tahap 1 yang sudah mengikat (service.ts:1-16): price-list MENJADI unitPrice baris; yang mengalahkan adalah DISKON MANUAL BARIS (rupiah per baris), ditumpuk DI ATAS harga tingkat, cap 100% nilai baris. Jika operator mengetik "harga final" langsung di unitPrice form pada invoice langsung (createSalesInvoice), nilai itu adalah `itemPrice` fallback yang dipakai HANYA bila tidak ada baris price-list berlaku — bukan override. Konsekuensi jujur yang wajib diterima sadar: operator TIDAK bisa mengetik unitPrice bebas untuk kabur dari harga tingkat lewat form biasa; jalan keluar resmi = diskon baris (terlihat sebagai diskon, bukan harga satuan sulap). Itu disengaja: harga tingkat yang bisa ditimpa diam-diam lewat ketik unitPrice bukan harga tingkat, melainkan saran. | TERVERIFIKASI-KODE untuk perilaku tahap 1 (service.ts:1-16, sales.actions.ts:48-67,1406-1412); USULAN bahwa perilaku sama dipertahankan untuk tingkat. Lihat Q5 bila pemilik proses mau override unitPrice eksplisit. | service.ts:1-16; sales.actions.ts:48-67,1406-1412 |
| BR-TIER-08 | Resolusi tingkat BERLAKU HANYA pada titik yang sama dengan tahap 1: baris invoice LANGSUNG dari form (createSalesInvoice tanpa salesOrderId). Baris hasil konversi (quotation -> SO -> invoice) mempertahankan harga dokumen sumber dan TIDAK di-resolve ulang terhadap qty invoice. Alasan: (a) harga konversi adalah harga yang sudah disetujui pelanggan di dokumen sumber; me-resolve ulang diam-diam mengubah total terhadap persetujuan; (b) pola existing `sales.actions.ts:1406-1412` + komentar `:41-46`; (c) change-order/nilai berjalan sudah punya jalur sendiri (F-2026-10-20-103), resolver ini TIDAK menjadi jalur nilai kedua. `updateSalesInvoice` TIDAK menjalankan resolver (mempertahankan perilaku live: harga baris hasil edit adalah harga final baris; qty berubah lewat edit TIDAK memicu tingkat baru sampai/dibatalkan). Qty berubah di editor baris pada invoice yang BELUM terbit: karena updateSalesInvoice tidak me-resolve, perubahan qty lewat edit TIDAK mengubah tingkat — operator yang mau tingkat mengikuti qty baru harus membuat baris/dokumen baru ATAU BOT 3 memutuskan menambah resolusi ke updateSalesInvoice SEBELUM posting dengan penjagaan wasPosted yang sudah ada (sales.actions.ts:2354,2464-2475 reverse+repost). Keputusan terakhir itu di luar spec ini (lihat Q6). | TERVERIFIKASI-KODE (titik live) + USULAN (mempertahankan titik sama). | sales.actions.ts:41-67,1406-1412,2315-2490 |
| BR-TIER-09 | Sumber harga yang terpilih WAJIB tertampil/tercatat di baris invoice bila BOT 3 menambah kolom persist (usulan kolom: `priceSource` String? + `priceListId` Int? + `priceListMinQty` Decimal? di SalesInvoiceItem — NAMA KOLOM usulan, BOT 3 yang menetapkan akhir mengikuti konvensi schema). Nilai priceSource minimal: `price_list_tier` (baris tingkat menang, minQty > 1), `price_list_base` (price-list menang minQty <= 1 / tanpa tingkat), `item_master` (fallback Item.price), `manual_discount` BUKAN nilai priceSource (diskon ditumpuk, bukan sumber harga satuan). Bila kolom persist tidak ditambah pada migrasi yang sama, maka SEMENTARA (sampai kartu UI): resolver mengembalikan metadata sumber di hasil service (perluasan ResolvedLinePricing) dan BOT 2 menampilkan label hasil RESOLUSI LIVE untuk baris yang sedang diedit (bukan klaim historis). DILARANG menampilkan label "harga tingkat >= 10" untuk baris historis yang harganya tidak disimpan sumbernya — itu klaim tanpa bukti. Migrasi kolom persist = keputusan BOT 3/lead (lihat Q7); mitigasi backlog "tampilkan sumber harga terpilih di baris invoice" hanya terpenuhi PENUH bila persist, terpenuhi SEBAGIAN (baris baru saja) bila hanya live. | USULAN (mitigasi eksplisit backlog F-018: "tampilkan sumber harga terpilih di baris invoice"). | schema:1460-1476 (sumber ABSEN); service.ts:33-44 |
| BR-TIER-10 | Retur memakai HARGA FAKTUR ASAL yang sudah ter-beku di SalesInvoiceItem.unitPrice, BUKAN resolusi ulang terhadap qty retur, BUKAN resolusi ulang terhadap qty sisa sesudah retur parsial. Retur 3 dari invoice qty 10 harga tingkat Rp88.000 = kredit 3 x Rp88.000, walau 3 < minQty 10. Menghitung ulang tingkat dari qty retur (harga dasar Rp100.000) akan mengkredit pelanggan LEBIH dari yang pernah ditagih per unit (selisih Rp12.000/unit = kebocoran). Menghitung ulang dari qty sisa (10 - 3 = 7 -> harga dasar) dan menagih ulang selisih tingkat atas 7 unit yang TIDAK diretur DILARANG di spec ini: itu penyesuaian harga retroaktif yang membutuhkan dokumen penyesuaian/change-order sendiri dengan persetujuan pelanggan — BUKAN efek samping retur. Snapshot pajak retur tetap pola existing (return-snapshot.ts:39-55): returnDpp = qtyRetur x price beku faktur; guard kumulatif DPP/PPN terhadap faktur asal tetap jalan. | TERVERIFIKASI-KODE (createSalesReturn sales.actions.ts:1688-1725; snapshot return-snapshot.ts:39-55; guard accounting.hook.ts:1246-1293) + USULAN eksplisit menolak lookup ulang. | sales.actions.ts:1688-1725; return-snapshot.ts:39-55 |
| BR-TIER-11 | Retur TANPA faktur asal (salesInvoiceId kosong — pola existing membolehkan, RETURNABLE_INVOICE_STATUSES hanya menjegal bila invoiceId terisi, sales.actions.ts:1690-1702): harga retur = fallback existing Item.price -> cost (resolvePrice :1724-1725), TIDAK menjalankan resolver tingkat (tidak ada pelanggan/dokumen asal untuk konteks kategori+tanggal). Jangan tambahkan resolver tingkat ke jalur ini. | TERVERIFIKASI-KODE + USULAN mempertahankan. | sales.actions.ts:1690-1725 |
| BR-TIER-12 | Harga tingkat BUKAN harga yang monoton wajib: sistem TIDAK menolak baris tingkat yang harganya LEBIH MAHAL dari tingkat di bawahnya (minQty 20 harga Rp110.000 di atas minQty 1 Rp100.000). Resolver tetap memilih minQty terbesar yang terpenuhi walau lebih mahal. Alasan: (a) urutan harga adalah keputusan komersial (bisa ada alasan: kemasan besar lebih mahal per unit karena handling); (b) menolak = menambah validasi bisnis yang belum diminta pemilik proses; (c) mitigasi salah ketik cukup dari tampilan sumber harga (BR-TIER-09) + operator melihat unitPrice hasil. Peringatan lunak "tingkat lebih tinggi tapi harga lebih mahal dari tingkat bawahnya" BOLEH ditambah BOT 3 sebagai warning non-blocking di action kelola daftar harga; BUKAN gerbang simpan. | USULAN. | - |
| BR-TIER-13 | Diskon header/dokumen (subtotal -> discount -> DPP -> PPN, sales.actions.ts:1426-1429 pola existing) berada DI LUAR resolver tingkat: tingkat mengubah unitPrice baris; diskon header tetap diterapkan sesudah subtotal baris seperti existing, sebelum pajak. Resolver tingkat TIDAK mengubah urutan diskon-sebelum-pajak vonis tahap 1 (service.ts:1-16). Tidak ada diskon persen per tingkat di spec ini (itu fitur promo terpisah, di luar cakupan). | TERVERIFIKASI-KODE + USULAN mempertahankan. | sales.actions.ts:1426-1429; service.ts:1-16 |
| BR-TIER-14 | Item tanpa baris price-list sama sekali (atau semua baris nonaktif/belum efektif): perilaku fallback tahap 1 PERTAHANKAN persis — pakai Item.price (resolver mengembalikan null -> itemPrice fallback, service.ts:87-108); tidak ada error, tidak ada blokir. `minQty` null pada baris lama (pra-migrasi) diperlakukan sebagai 1 (pola VendorItemPrice default 1.00). Baris dengan minQty <= 0 di data = data rusak: schema validasi action menolak minQty <= 0 (pola vendorPriceSchema.minQty positive, purchase.schemas.ts:183-190); service memperlakukan minQty <= 0 sebagai tidak memenuhi syarat (lihat Q8 — dua pilihan: clamp ke 1 atau baris dilewati; spec merekomendasikan DILEWATI + baris dianggap tidak berlaku, karena clamp diam-diam mengubah makna data rusak menjadi harga dasar). | TERVERIFIKASI-KODE (fallback) + USULAN (penanganan data rusak). | service.ts:87-108; purchase.schemas.ts:183-190 |

Penjelasan semantik batas (BR-TIER-01) untuk operator:
"Untuk Kts Diatas 10" versi Accurate = eksklusif (qty 10 TETAP harga
normal, qty 11 baru grosir). Spec ini memilih INKLUSIF gaya
VendorItemPrice: minQty 10 berarti qty 10 SUDAH harga tingkat. Alasan
satu kalimat: repo ini sudah punya satu model tier inklusif di sisi
pembelian; menambah model eksklusif kedua hanya untuk sisi penjualan
membuat operator menghafal dua makna batas untuk konsep yang sama.
Bila pemilik proses ternyata ingin perilaku Accurate persis, itu
perubahan SATU baris perbandingan (`>=` -> `>`) — tapi harus DIPUTUSKAN
sebelum implementasi, bukan sesudah data tingkat terisi (mengubah
semantik sesudah data ada menggeser harga transaksi borderline secara
retroaktif).

Scope dokumen yang di-resolve (ringkasan BR-TIER-08):
- createSalesInvoice baris form LANGSUNG (tanpa salesOrderId): YA,
  resolver tingkat jalan (perluasan titik live existing).
- createSalesInvoice DARI SO (salesOrderId terisi): TIDAK.
- Quotation / SalesOrder create & edit: TIDAK (harga dokumen sumber
  dipertahankan; menambah resolusi ke quotation = keputusan terpisah
  karena quotation adalah dokumen persetujuan pelanggan — lihat Q6).
- updateSalesInvoice: TIDAK (perilaku live dipertahankan; lihat Q6).
- SalesReturn: TIDAK PERNAH (harga beku faktur asal, BR-TIER-10/11).

##### Workflow specification

Aktor:
- Admin penjualan / admin master data: kelola baris CustomerPriceList
  (kategori?, item, minQty, price, effectiveDate?) via action existing
  yang diperluas (customer-price-list.actions.ts).
- Operator penjualan (kasir/admin faktur): buat invoice langsung dari
  form; sistem me-resolve harga tingkat per baris dari (customer,
  tanggal dokumen, qty baris). Operator mengetik diskon baris manual
  bila ada persetujuan diskon (ditumpuk di atas harga tingkat).
- Pelanggan: menerima invoice dengan unitPrice hasil tingkat; bukan
  aktor sistem.
- BOT 4 (accountant): TIDAK dilibatkan (backlog: "Butuh putusan
  accountant: TIDAK") — selama urutan diskon-sebelum-pajak tahap 1
  (service.ts:1-16) dipertahankan persis. Bila implementasi menyentuh
  urutan pajak atau membulatkan DPP per tingkat, STOP dan minta vonis
  BOT 4 dulu.

Dokumen masuk:
- Baris CustomerPriceList (master; satu baris = satu tingkat untuk satu
  pasangan kategori?/item pada satu effectiveDate).
- Item master (Item.price fallback, Item.cost untuk peringatan margin
  lunak existing).
- Customer (customerCategoryId dibaca server dari Customer, BUKAN
  dipercaya dari form — pola existing loadPriceListRows :116-172).

Dokumen keluar:
- SalesInvoice + SalesInvoiceItem dengan unitPrice hasil resolusi
  (total baris = qty x unitPrice tingkat - diskon baris, cap diskon
  100%, tidak negatif — pola resolveLinePricing :85-109).
- (Bila kolom persist ditambah) metadata sumber harga per baris
  invoice untuk ditampilkan BOT 2.
- SalesReturn + SalesReturnItem dengan price = unitPrice beku faktur
  asal (BUKAN hasil resolver).

Alur utama:
1. Admin membuat baris tingkat: mis. (kategori null, item A, minQty 1,
   Rp100.000), (null, A, 5, Rp95.000), (null, A, 10, Rp88.000).
2. Operator membuat invoice langsung, pelanggan kategori umum, tanggal
   dokumen T, baris item A qty 10.
3. Resolver memilih kandidat: itemId cocok, aktif, effectiveDate <= T,
   qty 10 >= minQty -> {1,5,10} lolos; 20/100 tidak. Pemenang kategori:
   semua null (setara); minQty terbesar = 10 -> unitPrice Rp88.000.
4. Diskon baris manual Rp50.000 ditumpuk: total baris
   10 x 88.000 - 50.000 = Rp830.000. Diskon SEBELUM pajak.
5. Invoice tersimpan dengan unitPrice Rp88.000 (dan, bila persist,
   sumber = price_list_tier minQty 10).
6. Retur 3 unit atas invoice itu: harga retur Rp88.000/unit =
   kredit DPP Rp264.000 (BUKAN harga tingkat qty 3).

##### Role / permission matrix (permission key nyata)

| Aksi | Permission key | Catatan |
|---|---|---|
| Lihat daftar harga pelanggan | `view_customer_price_lists` | module-catalog:141 |
| Buat baris tingkat | `create_customer_price_lists` | module-catalog:142; validasi minQty ditambah di schema yang sama |
| Ubah baris tingkat | `edit_customer_price_lists` | module-catalog:143 |
| Hapus baris tingkat | `delete_customer_price_lists` | module-catalog:144 |
| Buat invoice (resolusi jalan) | `create_sales_invoices` | module-catalog:146; resolver server-side, operator tidak memilih tingkat manual |
| Ubah invoice | `edit_sales_invoices` | module-catalog:147; TIDAK me-resolve (BR-TIER-08) |
| Posting invoice | `post_sales_invoices` | module-catalog:150; jurnal membaca angka baris final apa adanya |
| Buat retur | `create_sales_returns` | module-catalog:167; harga beku faktur asal |
| Lihat sumber harga di baris | `view_sales_invoices` | module-catalog:145; label sumber mengikuti hak lihat invoice, TIDAK ada permission baru |

Tidak ada permission approve khusus tingkat: kelola daftar harga
adalah master data (pola VendorItemPrice sama: create/edit/delete
tanpa approve). Menambah gerbang approve untuk daftar harga = di luar
spec ini (lihat Q9).

##### Status-transition matrix

Tidak ada status dokumen baru. Resolver TIDAK mengubah status
apa pun; ia hanya menentukan unitPrice saat baris invoice dibuat.

| Dokumen | Status awal | Pemicu | Status akhir | Penjaga |
|---|---|---|---|---|
| SalesInvoice | (belum ada) | createSalesInvoice form langsung | draft | `create_sales_invoices`; resolver tingkat per baris |
| SalesInvoice | (belum ada) | createSalesInvoice dari SO | draft | `create_sales_invoices`; harga SO dipertahankan, tanpa resolver |
| SalesInvoice | draft (existing) | updateSalesInvoice ubah qty/unitPrice | status tidak berubah (existing) | `edit_sales_invoices`; TANPA resolusi tingkat; gerbang wasPosted + settlement existing tetap |
| SalesInvoice | draft | posting (existing) | posted (existing) | `post_sales_invoices`; angka baris final apa adanya |
| SalesReturn | (belum ada) | createSalesReturn | draft | `create_sales_returns`; harga beku faktur asal |
| CustomerPriceList | aktif | deleteCustomerPriceList / isActive=false | terhapus/nonaktif | `delete/edit_customer_price_lists`; baris nonaktif dilewati resolver |

Transisi lain (approve/post/partial/paid/cancelled invoice) TIDAK
disentuh spec ini dan mengikuti perilaku existing persis.

##### Feature matrix (benchmark resmi, akses 2026-10-22)

| Fitur | Accurate | Zahir | ISF (Silengkap) sesudah spec ini |
|---|---|---|---|
| Syarat kuantitas otomatis | Ya — "Untuk Kts Diatas 10" EKSKLUSIF, harga berubah otomatis di transaksi (help.accurate.id menerapkan-harga-grosir) | Multi Discount: acuan golongan + jumlah barang (help.zahironline.com fasilitas-yang) | USULAN: `CustomerPriceList.minQty` INKLUSIF `qty >= minQty` (BR-TIER-01) — beda semantik batas dari Accurate, disengaja, pola VendorItemPrice existing |
| Per kategori/golongan pelanggan | Ya — kategori penjualan per pelanggan (help.accurate.id Accurate POS tambah-harga-grosir) | Ya — Multi Price per golongan (fasilitas-yang + penerapan-multi-price) | Sudah live tahap 1 (customerCategoryId null = semua) + dipertahankan (BR-TIER-03 langkah 5) |
| Per tanggal efektif | Ya — "Mulai Berlaku" (help.accurate.id menerapkan-harga-grosir) | (tidak ditegaskan di URL benchmark) | Sudah live tahap 1 (effectiveDate <= tanggal dokumen) + dipertahankan |
| Sumber harga tampil di baris | Tidak ditegaskan di help benchmark | Tidak ditegaskan di help benchmark | USULAN persist/live label (BR-TIER-09) — mitigasi risiko backlog, BUKAN klaim paritas vendor |
| Retur pada harga transaksi asal | Tidak dibahas di URL benchmark | Tidak dibahas di URL benchmark | TERVERIFIKASI-KODE: harga beku faktur asal (BR-TIER-10) |
| Target penjualan per sales | Ada (disebut backlog F-018) | Ada (disebut backlog F-018) | DITUNDA SADAR — bukan spec ini |

URL benchmark persis:
- https://help.accurate.id/product/accurate-online/fitur-aol/penjualan/menerapkan-harga-grosir-penjualan/
- https://help.accurate.id/product/accurate-pos/pengaturan-aplikasi/pesanan-baru/tambah-harga-grosir/
- https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
- https://help.zahironline.com/portal/id/kb/articles/penerapan-multi-price-dengan-satuan-ukuran-yang-berbeda

##### Contoh angka terukur (wajib dipakai tes; PPN ilustrasi 11% mengikuti pola tes existing service.ts:90-99)

Master tingkat contoh (item A, kategori pelanggan: umum/null kecuali disebut lain; Item.price contoh Rp100.000; Item.cost contoh Rp80.000; tanggal dokumen 2026-10-22; semua baris effectiveDate null, aktif):

| Baris | customerCategoryId | minQty | price |
|---|---|---|---|
| T1 | null | 1 | Rp100.000 |
| T5 | null | 5 | Rp95.000 |
| T10 | null | 10 | Rp88.000 |
| T20 | null | 20 | Rp85.000 |
| T100 | null | 100 | Rp83.000 |

Hasil resolusi yang WAJIB (harga satuan = per unit; total = qty x unitPrice; DPP = total - diskon baris; PPN = round(DPP x 11%); grand = DPP + PPN bila dokumen hanya baris ini, tanpa diskon header):

| Kasus | Input baris | UnitPrice terpilih | Total baris (DPP sebelum diskon header) | PPN 11% | Grand |
|---|---|---|---|---|---|
| A1 batas bawah | qty 1 | Rp100.000 (T1) | Rp100.000 | Rp11.000 | Rp111.000 |
| A2 di bawah tingkat 5 | qty 4,99 | Rp100.000 (T1) | Rp499.000 | Rp54.890 | Rp553.890 |
| A3 tepat batas inklusif | qty 5 | Rp95.000 (T5) | Rp475.000 | Rp52.250 | Rp527.250 |
| A4 pecahan tak dibulatkan | qty 9,99 | Rp95.000 (T5) | Rp949.050 | Rp104.396 (949.050 x 11% = 104.395,5 -> round 104.396) | Rp1.053.446 |
| A5 tepat batas 10 | qty 10 | Rp88.000 (T10) | Rp880.000 | Rp96.800 | Rp976.800 |
| A6 tengah tingkat | qty 15 | Rp88.000 (T10) | Rp1.320.000 | Rp145.200 | Rp1.465.200 |
| A7 tingkat 20 | qty 20 | Rp85.000 (T20) | Rp1.700.000 | Rp187.000 | Rp1.887.000 |
| A8 tingkat tertinggi | qty 150 | Rp83.000 (T100) | Rp12.450.000 | Rp1.369.500 | Rp13.819.500 |
| A9 diskon manual di atas tingkat | qty 10, diskon baris Rp50.000 | Rp88.000 (T10) | gross Rp880.000; total sesudah diskon Rp830.000 | Rp91.300 (atas DPP Rp830.000) | Rp921.300 |
| A10 diskon cap 100% | qty 10, diskon baris Rp999.999.999 | Rp88.000 (T10) | total Rp0 | Rp0 | Rp0 |
| A11 kategori spesifik menang | qty 10; ada baris (kategori 7, minQty 1, Rp90.000); pelanggan kategori 7 | Rp90.000 (kategori 7, walau minQty-nya 1 < 10) | Rp900.000 | Rp99.000 | Rp999.000 |
| A12 kategori spesifik + tingkatnya sendiri | qty 10; ada baris (kategori 7, minQty 10, Rp87.000) DAN (null, minQty 10, Rp88.000); pelanggan kategori 7 | Rp87.000 — kategori spesifik disaring DULU (langkah 5), baru minQty terbesar di dalam kelompok itu | Rp870.000 | Rp95.700 | Rp965.700 |
| A13 pelanggan tanpa kategori cocok | qty 10; hanya baris (kategori 7, minQty 10, Rp87.000) + T1/T5/T10 umum; pelanggan kategori 9 | Rp88.000 (T10 umum) — baris kategori 7 TIDAK bocor ke kategori lain | Rp880.000 | Rp96.800 | Rp976.800 |
| A14 dua baris pisah tak digabung | dua baris item A qty 6 + qty 6 dalam satu invoice langsung | KEDUA baris Rp95.000 (T5) — TIDAK menjadi tingkat 10 | per baris Rp570.000; subtotal baris Rp1.140.000 | (per dokumen existing) | — |
| A15 tanggal efektif | qty 10; baris T10 effectiveDate 2026-11-01; tanggal dokumen 2026-10-22 | baris T10 BELUM berlaku -> pemenang berikutnya yang memenuhi (T5 bila ada) Rp95.000 | Rp950.000 | Rp104.500 | Rp1.054.500 |
| A16 retur parsial | invoice A5 (qty 10 @ Rp88.000); retur qty 3 | harga retur Rp88.000/unit (beku) | kredit DPP retur Rp264.000 | PPN retur pola snapshot existing (tarif efektif faktur asal): Rp29.040 pada ilustrasi 11% | — |
| A17 retur penuh | invoice A5; retur qty 10 | Rp88.000/unit | kredit DPP Rp880.000 (= DPP baris asal persis) | Rp96.800 pola snapshot | — |
| A18 di bawah HPP (peringatan lunak) | qty 10, Item.cost Rp90.000 | Rp88.000 (T10) | Rp880.000 < 10 x 90.000 -> belowCost = true, TIDAK diblokir | — | — |

Catatan pembulatan: angka PPN di atas mengikuti pola tes existing
(`Math.round(DPP x 11/100)`, service test :90-99) dan pola
`snapshotReturnLine` untuk retur (safeRound 2 desimal lalu tarif
efektif faktur asal — return-snapshot.ts:39-55; pada invoice satu baris
tanpa diskon header, tarif efektif = 11% persis sehingga A16/A17
eksak). Implementasi WAJIB memakai helper uang existing (safeMultiply/
safeSubtract/safeRound) dan BUKAN aritmetika float mentah baru; bila
hasil BOT 3 beda sen dari tabel karena jalur pembulatan existing yang
sah, tabel ini yang disesuaikan ke helper existing — BUKAN sebaliknya
dibuat jalur pembulatan kedua.

Catatan A11/A12 adalah konsekuensi BR-TIER-03 yang disengaja dan
paling mudah salah paham: kekhususan kategori MENANG atas kedalaman
tingkat. Pelanggan kategori 7 dengan baris kategori-nya sendiri
(minQty 1, Rp90.000) TIDAK mendapat harga umum tingkat 10 (Rp88.000)
yang lebih murah. Itu meneruskan semantik tahap 1 yang sudah live
(kategori spesifik > umum, service.ts:56-76). Bila pemilik proses
menginginkan "ambil yang termurah antara kelompok kategori dan umum",
itu mengubah BR-TIER-03 langkah 5-6 menjadi perbandingan lintas
kelompok — keputusan bisnis terpisah (Q2), JANGAN diubah diam-diam
saat implementasi karena membuat hasil A11/A12 berbalik.

##### Acceptance criteria + edge cases (draf untuk kartu lanjutan)

Untuk BOT 3 (implementasi backend; pemilik: backend-prisma-inventory-workshop):
- AC-B3-1 Migrasi: tambah `minQty Decimal @default(1.00) @db.Decimal(15,2)`
  ke CustomerPriceList; unique menjadi
  [customerCategoryId, itemId, minQty, effectiveDate]; baris lama
  terbaca sebagai minQty 1 (tanpa backfill manual). Constraint MySQL
  NULL-di-unique ditangani pola existing (cek aplikasi di action,
  customer-price-list.actions.ts:29-32 komentar) — duplikat
  (kategori null, item, minQty, tanggal) ditolak di action.
- AC-B3-2 Validasi: customerPriceListSchema (price-list.schemas.ts)
  menerima minQty pola vendorPriceSchema (purchase.schemas.ts:183-190):
  parse angka locale sadar (BUKAN z.coerce.number mentah untuk string
  "1.000"), > 0, plafon menjaga Decimal(15,2). create/update action
  menyimpan minQty; pesan duplikat menyebut (kategori, barang, minQty,
  tanggal efektif).
- AC-B3-3 Service: perluas PriceListRow + pickPriceListPrice (atau
  fungsi qty-aware baru) dengan parameter qty mengikuti urutan pemenang
  BR-TIER-03 persis; `priceDocumentLines`/`applyPriceListLines`
  meneruskan qty baris. Tes unit WAJIB mereproduksi tabel A1-A18 di
  atas (termasuk A11/A12 kategori-dulu, A14 tanpa agregasi, A15
  tanggal). Falsifikasi: kembalikan perbandingan `>=` ke `>` -> A3/A5
  harus MERAH; tukar urutan kategori/minQty -> A11/A12 harus MERAH.
- AC-B3-4 Titik sambung: HANYA applyPriceListLines jalur createSalesInvoice
  langsung (sales.actions.ts:48-67,1406-1412) yang berubah perilaku.
  Jalur SO/quotation/updateSalesInvoice/retur TIDAK berubah (tes
  regresi existing F-PRICELIST-01 di sales.actions.test.ts:1116-1164
  tetap hijau; baris konversi SO tetap harga SO).
- AC-B3-5 Pajak/jurnal: tidak ada perubahan urutan diskon-sebelum-pajak;
  tes ekuivalensi jurnal existing (price-list-journal-equivalence)
  tetap hijau. Bila implementasi merasa perlu menyentuh urutan pajak:
  STOP, vonis BOT 4 dulu.
- AC-B3-6 (kondisional, hanya bila lead menyetujui kolom persist di
  Q7) Kolom sumber harga di SalesInvoiceItem + resolver menulisnya;
  nilai mengikuti kosakata BR-TIER-09. Bila tidak disetujui, AC ini
  gugur dan BOT 2 hanya menampilkan resolusi live (lihat AC-B2-2).
- AC-B3-7 Data rusak: baris minQty <= 0 / nonaktif / effectiveDate masa
  depan dilewati resolver (BUKAN clamp, BUKAN error dokumen). Tes:
  baris rusak tidak pernah terpilih walau satu-satunya baris.

Untuk BOT 2 (frontend; pemilik: frontend-ui-ux-next-js) — HANYA sesudah
kontrak BOT 3 jelas (kolom persist atau metadata live diputus di Q7):
- AC-B2-1 Form kelola daftar harga (route /penjualan/harga-pelanggan
  yang sudah dirujuk REVALIDATE): field minQty tampil dengan label
  satuan item; daftar baris terurut (kategori, item, minQty naik,
  effectiveDate). Mengikuti pola form harga pemasok existing
  (pembelian/harga-pemasok) sebisa mungkin.
- AC-B2-2 Baris invoice: tampilkan sumber harga terpilih mengikuti
  BR-TIER-09. Bila persist: label historis dari kolom
  ("Harga tingkat >= 10 — Daftar Harga" / "Harga daftar" /
  "Harga master"). Bila hanya live: label hanya untuk baris yang
  sedang dibuat/diedit, TANPA klaim historis untuk baris lama. Diskon
  baris manual tetap tampil sebagai diskon terpisah (bukan mengganti
  label sumber). E2E/selector yang disentuh dicek sebelum commit UI
  (konvensi repo: ubah label/aria bisa memecah E2E walau lokal hijau).
- AC-B2-3 Peringatan belowCost existing (peringatan lunak) tetap
  tampil tidak menghalangi simpan; JANGAN diubah jadi blokir.

Untuk BOT 6 (QA/audit; pemilik: qa-security-reporting-release-auditor):
- AC-B6-1 Skenario batas: qty = minQty - 0,01 / = minQty / = minQty +
  0,01 pada dua tingkat berurutan; semantik inklusif terbukti dari
  hasil unitPrice tersimpan, bukan dari label UI.
- AC-B6-2 Skenario kategori: A11/A12/A13 direproduksi di jalur
  createSalesInvoice nyata (bukan hanya unit service): kategori
  spesifik menang atas tingkat umum walau lebih mahal (A11).
- AC-B6-3 Skenario retur: retur parsial dan penuh atas invoice tingkat
  mengkredit harga beku faktur asal (A16/A17); guard kumulatif
  DPP/PPN existing tetap menolak retur berlebih; TIDAK ada penagihan
  ulang selisih tingkat atas qty sisa.
- AC-B6-4 Skenario negatif: form yang ditempel (bypass UI) dengan
  duplikat (kategori, item, minQty, tanggal) ditolak server; baris
  minQty <= 0 tidak bisa lahir lewat action; invoice dari SO tidak
  berubah harga walau qty-nya memenuhi tingkat baru.
- AC-B6-5 Ekuivalensi uang: invoice tingkat + diskon manual + PPN
  menghasilkan subtotal/taxAmount/grandTotal identik dengan invoice
  manual berharga final sama (memperluas pola price-list-journal-equivalence).
- AC-B6-6 Izin: role tanpa create_customer_price_lists tidak bisa
  membuat baris tingkat lewat pemanggilan action langsung; label
  sumber harga tidak membocorkan harga kategori LAIN ke pengguna yang
  hanya boleh melihat invoice pelanggan ini (sumber tampil = sumber
  baris ITU, bukan daftar kandidat).

Pertanyaan terbuka tersisa (eksplisit; tidak menghambat penulisan spec,
menghambat implementasi pada butir terkait saja):
- Q1 (pemilik proses/team-lead) Semantik batas: inklusif `>=` spec ini
  vs eksklusif `>` gaya Accurate. Rekomendasi: inklusif (konsistensi
  VendorItemPrice). WAJIB diputus sebelum migrasi data tingkat diisi.
- Q2 (pemilik proses) Pemenang lintas kelompok: kategori-dulu-lalu-tingkat
  (spec, A11 merugikan pelanggan kategori yang baris umumnya lebih
  murah) vs termurah-lintas-kelompok. Rekomendasi: pertahankan
  kategori-dulu (konsistensi tahap 1 live). Berdampak ke AC-B3-3/A11/A12.
- Q3 (pemilik proses) Agregasi qty lintas baris item sama: spec
  MENOLAK (BR-TIER-04). Konfirmasi bahwa tidak ada pelanggan fleet yang
  membelah baris sengaja (beda serial/gudang) mengharapkan gabungan.
- Q4 (pemilik proses/team-lead) Ambang tingkat terhadap qty dokumen
  (satuan baris) vs qty satuan dasar hasil konversi UoM. Default spec:
  qty dokumen. Berdampak hanya untuk item multi-satuan.
- Q5 (pemilik proses) Override unitPrice manual penuh di atas tingkat:
  spec MENOLAK (hanya diskon baris yang menimpa, BR-TIER-07). Bila
  bisnis butuh pengecualian harga per transaksi, itu membutuhkan pola
  persetujuan harga (approval) terpisah, bukan ketik bebas.
- Q6 (team-lead + BOT 3) Titik resolusi tambahan di masa depan:
  quotation dan updateSalesInvoice. Spec mempertahankan TIDAK untuk
  keduanya. Menambahkannya mengubah makna dokumen persetujuan/edit —
  keputusan terpisah, bukan perluasan diam-diam.
- Q7 (lead-architect + BOT 3) Kolom persist sumber harga di
  SalesInvoiceItem (migrasi + kosakata BR-TIER-09) vs metadata live
  saja. Menentukan apakah AC-B3-6 dan label historis AC-B2-2 berlaku.
  Rekomendasi: persist — tanpa itu mitigasi backlog "tampilkan sumber
  harga" tidak terpenuhi untuk baris historis dan audit BOT 6 (AC-B6-1)
  hanya bisa membaca unitPrice, bukan sumbernya.
- Q8 (BOT 3) Perlakuan minQty <= 0 di data legacy/rusak: spec
  merekomendasikan baris dilewati resolver. Konfirmasi tidak ada data
  produksi dengan minQty non-positif yang bergantung pada clamp.
- Q9 (pemilik proses) Gerbang approve untuk perubahan daftar harga:
  spec tidak menambah. Bila daftar harga dianggap data sensitif
  setara harga persetujuan, perlu workflow approve tersendiri.

Yang TIDAK diusulkan run ini:
- Target penjualan per sales/periode: DITUNDA SADAR sampai
  F-2026-10-21-016 atribusi sales dipakai (per backlog F-018 dan
  perintah kartu ini). Jangan buat model SalesTarget dari spec ini.
- Aturan promo/diskon persen bertumpuk per tingkat, buy-X-get-Y,
  harga per pelanggan individual (di luar kategori), harga per gudang/
  wilayah: tidak ada bukti kebutuhan bengkel saat ini; CustomerPriceList
  per kategori + minQty menutup kasus grosir/fleet yang dirujuk backlog.
- Resolusi tingkat di quotation/SO/update invoice/retur: ditolak
  sadar di BR-TIER-08/10 (dokumen persetujuan dan dokumen beku tidak
  di-resolve ulang).
- Jalur override harga bebas oleh operator: ditolak di BR-TIER-07/Q5.

Pemilik implementasi: backend (@backend-prisma-inventory-workshop)
untuk AC-B3-*; frontend (@frontend-ui-ux-next-js) untuk AC-B2-*
sesudah Q7 diputus; QA (@qa-security-reporting-release-auditor)
untuk AC-B6-*. Butuh putusan accountant: TIDAK (selama AC-B3-5
dijaga). Butuh putusan team-lead/pemilik proses: Q1, Q2, Q4, Q5, Q6,
Q7, Q9 (di atas).
