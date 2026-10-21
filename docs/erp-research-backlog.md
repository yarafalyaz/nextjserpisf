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

