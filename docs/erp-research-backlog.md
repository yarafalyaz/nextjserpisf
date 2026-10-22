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

#### VONIS BOT 4 (accounting-finance-tax) 2026-10-21 22:30 WIB — F-2026-10-21-009-V: tutup job (FINAL, tertulis saja)

Pemutus: BOT 4. Kartu t_79eaa1a7 → Backend t_0ff0ef02 eksekusi persis
vonis ini, jangan tafsir ulang angka/akun. Bukti live `origin/main`
29d8e553 (sesudah fetch): `WorkOrder`/`ProductionOrder` schema tanpa
`closedAt/closedBy/reopenReason/closedReason` (grep closedAt hanya
Nonconformance + CrmTicket); WO status berjalan draft/pending →
in_progress → completed (`completeWorkOrder` manufacturing.actions.ts,
izin `complete_work_orders`); PO draft → confirmed → in_progress →
completed parsial/final (`completeProductionOrder`, totalActualCost
di-nol-kan final, `releasedCost` akumulasi, `variance` analitis);
`ProductionCost` create/update/delete + pull timesheet + apply overhead
sudah beku hanya untuk PO completed/cancelled (`mutableOrderError`
production-cost.actions.ts) TAPI WO-only cost line tidak dicek status WO;
`createMaterialIssue`/`completeMaterialIssue` (inventory.actions.ts) dan
`createMaterialIssueFromWorkOrder`/`issueMaterial`
(manufacturing.actions.ts) tanpa cek closed; QC gate existing
`assertWorkOrderQcCleared`/`assertProductionOrderQcCleared`
(qc.service.ts: NCR status open/rework/rejected menahan, final terakhir
≠ passed menahan, tanpa record QC = lolos opt-in); COA existing
`src/lib/setup/base-data.ts`: 110404 Barang Dalam Proses (WIP) di bawah
1104, 110403 Persediaan Dalam Proses, 110401 Persediaan, 510102 Beban
Material + 510103 Penyesuaian Persediaan di bawah 5101 Beban Pokok
Penjualan; setting existing `wipAccountId` (automap → 110404),
`materialExpenseAccountId` (→ 510102), `cogsAccountId` (→ 5101);
F-006 FINAL: disposisi varians MATI default, hanya
`standardCostingEnabled` + `productionVarianceAccountId` fail-closed
(`src/lib/tax/production-variance-gate.ts`); estimasi-vs-aktual/margin
F-007 read-model existing `job-estimate-vs-actual(-data).ts` membaca
ProductionCost langsung/lewat PO — tanpa snapshot tutup.

**Keputusan 1 — Makna tutup: `completed` ≠ `closed`; closed = beku biaya.**
(a) Status baru `closed` TERPISAH dari `completed`: completed =
milestone operasional/fisik selesai (perilaku existing tidak berubah);
closed = kunci akuntansi job sesudah completed. Dilarang memakai ulang
completed sebagai tutup buku job. (b) Transisi sah SAJA:
WorkOrder `completed → closed`; ProductionOrder `completed → closed`.
Draft/pending/confirmed/in_progress/cancelled TIDAK boleh langsung
closed (cancelled tetap terminal sendiri, bukan closed). (c) Saat
closed, server WAJIB menolak mutasi biaya BARU dan mutasi biaya LAMA
yang mengubah angka job: create/update/delete `ProductionCost`
(workOrderId job itu ATAU productionOrderId PO di bawah WO itu —
termasuk baris WO-only yang hari ini lolos tanpa cek status),
`pullLaborCostFromTimesheets`, `applyOverheadToProductionOrder`,
`syncServicePurchaseOrderCost`, `syncReworkCostToOrder`,
`createMaterialIssue` + `completeMaterialIssue` (workOrderId job itu),
`createMaterialIssueFromWorkOrder`, `issueMaterial` PO job itu.
Penjaga di service/action server dalam tx yang sama dengan mutasi
(pola `mutableOrderError` diperluas, bukan cek UI). (d) Beku berlaku
dua arah rantai: WO closed membekukan SEMUA PO di bawahnya walau PO
belum closed; PO closed membekukan PO itu walau WO induk belum closed.
Tutup WO dengan PO anak belum completed/cancelled = DITOLAK (lihat syarat 3).
(e) Dokumen non-biaya tidak dibekukan vonis ini (invoice, pembayaran,
dokumen pajak berjalan jalur existing masing-masing — empat status
tetap terpisah). (f) Koreksi sesudah tutup HANYA dua jalur sah:
reopen ber-alasan (keputusan 4) lalu mutasi normal di periode terbuka,
atau dokumen/jurnal koreksi periode berjalan TANPA membuka job
(keputusan 4c). Dilarang edit/hapus baris biaya job tertutup diam-diam.

**Keputusan 2 — Selisih WIP/varian saat tutup: TANPA jurnal tutup baru;
tanpa ambang materialitas.**
(a) ProductionOrder completed final sudah melepaskan seluruh biaya:
totalActualCost di-nol-kan final (manufacturing.actions.ts complete final),
releasedCost = akumulasi seluruh rilis, jurnal existing Dr 110401
Persediaan / Cr WIP (setting `wipAccountId`, seed 110404) per rilis —
jadi pada PO yang sah ditutup, `totalActualCost` WAJIB 0,00.
Tutup BUKAN event posting: Backend DILARANG membuat jurnal "buang
sisa WIP" saat close. (b) Bila saat aksi tutup `totalActualCost ≠ 0,00`
atau completedQty < qty: tutup DITOLAK fail-closed dengan pesan menyebut
nominal sisa — itu temuan data (rilis parsial belum final / biaya yatim),
bukan selisih yang boleh dibuang otomatis. Guard tutup membaca field final
ini langsung; JANGAN menurunkan sisa dari `totalActualCost − releasedCost`
(field pertama sudah sisa berjalan, pengurangan kedua menghitung rilis
dua kali). Selesaikan lewat complete final existing
atau koreksi dokumen sumbernya, bukan jurnal penyeimbang tebakan.
(c) `ProductionOrder.variance` TETAP analitis standar-vs-aktual,
menempel pada order sebagai histori — TIDAK dijurnal saat tutup,
mengikuti F-006: disposisi hanya lewat gerbang
`production-variance-gate.ts` bila standard-costing aktif; akun
existing yang disebut vonis F-006 tetap `productionVarianceAccountId`
(setting, fail-closed) — BUKAN 510102/510103 dan bukan akun COA baru
yang dikarang kartu ini. (d) Selisih PEMBULATAN rilis existing
(`onProductionOrderCostRoundingVariance`, |selisih| ≥ 0,005 baru
posting; akun materialExpense ?? cogs setting existing) TIDAK diubah.
(e) Ambang materialitas tutup: TIDAK ADA — eksplisit tanpa ambang.
Alasan: sisa WIP ≠ 0 pada order completed adalah inkonsistensi
subledger↔GL; ambang rupiah berapa pun akan melegalkan WIP menggantung
dan memutus rekonsiliasi WIP-aging ↔ saldo GL akun WIP. Toleransi
satu-satunya = pembulatan sen dari rumus existing (safeRound 2 desimal;
selisih < 0,005 sudah ditangani jalur pembulatan).
(f) WO jasa tanpa PO: tidak ada WIP PO; biaya WO-only tetap tercatat
sebagai ProductionCost job dan ikut beku — tutup WO tidak menjurnal
ulang biaya itu ke akun mana pun.

**Keputusan 3 — Syarat tutup: finansial (vonis BOT 4, mengikat) vs
operasional (USULAN ke Business/Bot 5, BUKAN vonis).**
Finansial/akuntansi — Backend WAJIB tahan tutup bila: (i) status bukan
completed; (ii) untuk WO: masih ada ProductionOrder anak belum
completed/cancelled, MaterialIssue job berstatus draft/processing,
atau ProductionCost job/PO-anak yang belum postedAt terisi; (iii)
untuk PO: completedQty < qty atau sisa WIP ≠ 0,00 (keputusan 2b);
(iv) periode tanggal tutup tertutup — aksi tutup/reopen wajib
`assertPeriodOpen(tanggal aksi, tx)` dalam tx sama; (v) QC finansial:
NCR terbuka terkait job (status open/rework/rejected per definisi
existing qc.service.ts) MENAHAN tutup — biaya rework NCR adalah biaya
job nyata dan NCR terbuka berarti biaya belum final; inspeksi final
terakhir ≠ passed juga menahan, konsisten gate completed existing.
Tanpa record QC sama sekali TIDAK menahan (opt-in existing dipertahankan;
mengubahnya = keputusan operasional).
Operasional — USULAN (pemilik Business/Bot 5, jangan dibangun sebagai
gate finansial tanpa vonis mereka): invoice/serah-terima/DeliveryOrder
belum selesai TIDAK menahan tutup finansial menurut BOT 4 — piutang dan
penagihan adalah status terpisah dari status posting job; menahan tutup
karena belum ditagih akan mengunci biaya mengikuti status bayar
pelanggan. QC lolos sebagai syarat operasional handover, garansi,
dan kepuasan pelanggan di luar butir (v) di atas juga ranah Business.
Backend JANGAN menjadikan invoice lunas/DO terkirim syarat close.

**Keputusan 4 — Reopen.**
(a) Izin: pakai izin EXISTING, jangan buat permission baru tanpa
kebutuhan pemisahan tugas nyata — tutup WO = `complete_work_orders`,
reopen WO = `complete_work_orders`; tutup/reopen PO =
`edit_production_orders` (pola transisi PO existing). Admin mengikuti
whitelist existing. (b) Alasan WAJIB: reopen tanpa alasan terisi
(trim kosong) DITOLAK server; alasan + closedAt/closedBy/closedReason
dan setiap reopen (reopenedAt/reopenedBy/reopenReason atau jejak
setara) tersimpan dan TIDAK dihapus tutup berikutnya — jejak
tutup→reopen→tutup lengkap via kolom histori/ActivityLog existing
(`logActivity`), bukan overwrite diam. (c) Reopen mengembalikan status
ke `completed` (BUKAN in_progress): output fisik sudah terbit; mutasi
biaya tambahan sesudah reopen hanya lewat jalur biaya normal dengan
jurnal periode BERJALAN (tanggal hari aksi, `assertPeriodOpen` dalam
tx). Jurnal POSTED lama DILARANG diubah/dihapus — koreksi = reversal/
jurnal koreksi baru periode terbuka, pola repo. Reopen TIDAK membuka
kembali totalActualCost/releasedCost/variance/unit-cost FG terbit dan
TIDAK mengubah lapisan stok/FG yang sudah terbit (konsisten vonis
biaya telat F-2026-10-20-71: membuka angka final = HPP retroaktif
salah). (d) Dampak F-007: read-model estimasi-vs-aktual/margin membaca
biaya berjalan, jadi biaya sah sesudah reopen tampil sebagai biaya
aktual & margin BERUBAH — itu benar dan WAJIB terbaca sebagai perubahan
sesudah tutup pertama (jejak reopen tampil di read-model/detail, bukan
angka lama ditimpa diam-diam). Backend DILARANG membekukan salinan
margin kedua di luar read-model existing tanpa kartu tersendiri.

**Keputusan 5 — Larangan eksplisit + guard fail-closed (Backend
t_0ff0ef02 WAJIB patuh; butir tanpa vonis di sini = jangan dibangun).**
1. Dilarang: jurnal disposisi/penyeimbang baru saat close; akun COA
   baru; fallback akun diam-diam (akun kosong = tolak berisik pola
   setting existing); ambang materialitas tutup; ubah/hapus jurnal
   posted; ubah ProductionOrder cost fields final saat reopen; syarat
   tutup berbasis lunas invoice/DO; permission baru; hitung margin/
   pajak di UI.
2. Guard fail-closed per jalur biaya (keputusan 1c): satu helper
   status-job bersama dipakai semua jalur, cek di dalam tx sesudah
   lock baris job/PO; status closed/cancelled/completed-final yang
   sudah beku existing tetap berlaku kumulatif.
3. Transisi tutup/reopen atomik: conditional update
   (updateMany WHERE status='completed' / 'closed') pola claim
   existing; dua klik bersamaan tidak boleh dobel tutup/dobel log.
4. Falsifikasi wajib Backend: biaya baru ke PO closed ditolak; biaya
   WO-only ke WO closed ditolak; MI complete ke WO closed ditolak;
   pull timesheet ke job closed ditolak; tutup dengan sisa WIP ≠ 0
   ditolak menyebut nominal; tutup dengan NCR terbuka ditolak; reopen
   tanpa alasan ditolak; reopen oleh izin salah ditolak; cabut satu
   guard → tes jalur itu MERAH, pulih hijau; tutup→reopen→tutup jejak
   utuh; jurnal posted sebelum tutup tidak berubah sesudah reopen.
5. Migrasi hanya kolom aditif tutup/reopen di WorkOrder +
   ProductionOrder sesuai lane kartu Backend; tanpa backfill status —
   job completed lama tetap completed (belum closed) sampai operator
   menutup eksplisit.

Status item: DIVONIS — siap Backend t_0ff0ef02. Tanpa kode/migrasi di
kartu vonis ini.

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
- Status implementasi (Bara, kartu t_0a5c5eff sesuai vonis Lead Q1-Q5):
  TAHAP A SELESAI di backend — model WorkOrderOperation + setting
  defaultWorkOrderStages (default 4 nama vonis; template per-Product
  DITUNDA karena WO tanpa productId andal), builder murni
  work-order-progress + loader massal, aksi initializeWorkOrderOperations
  (idempoten FOR UPDATE) + updateWorkOrderOperationStatus
  (SEQUENSIAL-KERAS, skipped wajib notes, WO wajib in_progress,
  edit_work_orders tanpa key baru), startWorkOrder inisialisasi dalam
  transaksi klaim yang sama. Tanpa realisasi jam/jurnal/ProductionCost
  (vonis Q5), tanpa backfill (WO lama nol baris). Migrasi aditif
  20261022010000_work_order_operations; verify-migrations lokal belum
  hijau (butuh user ber-hak CREATE DB — CI DB Integration memverifikasi).
  Menyusul: UI progres detail/antrean (frontend), getWorkOrderPartStatus
  loncat ke operasi kala complete tanpa blok (integrasi Q3).

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

## VONIS BOT 4 F-2026-10-21-028 — Format ekspor PPh21 + rekonsiliasi rekap vs slip (2026-10-22)

Pemutus: `accounting-finance-tax` (BOT 4). Kartu: t_a89eab42.
Sifat: FINAL untuk tahap ekspor F-028. Rekap baca SUDAH jadi
(BOT 3 t_7c909b7b / PR #309, `src/lib/reports/pph21-recap.ts` +
`pph21-recap-data.ts` di main) — vonis ini TIDAK membuka kode,
hanya memutus format ekspor + aturan rekonsiliasi supaya BOT 3
tidak menebak format DJP kelak. Angka/metode TER TIDAK divonis
ulang — ikut VONIS F-026 FINAL di atas (§1-§6).

### A. Status verifikasi format DJP resmi (akses 2026-10-22)

TERVERIFIKASI dari sumber resmi DJP (pajak.go.id):

1. Coretax DJP memakai impor **XML**, bukan CSV/e-SPT lama. Halaman
   resmi "Template XML dan Converter Excel ke XML"
   (https://www.pajak.go.id/reformdjp/coretax/template-xml-dan-converter-excel-ke-xml,
   akses 2026-10-22) menyatakan: format impor Coretax = XML;
   perubahan dari sistem lama termasuk CSV→XML, penambahan kode
   NITKU, validasi NPWP/NITKU/Kode Objek Pajak/Tarif.
2. Untuk PPh21 pegawai tetap dokumennya = **BPMP** (Bukti
   Pemotongan Bulanan Pegawai Tetap). Converter resmi DJP
   "BPMP Excel to XML v.3.xlsx" (update 17/04/2025, unduh dari
   halaman di atas, diperiksa langsung run ini) memetakan kolom
   Excel → elemen XML `MmPayroll` (root `MmPayrollBulk` > `TIN` +
   `ListOfMmPayroll`). Kolom converter resmi (sheet BPMP):
   - `TIN` — NPWP Pemotong (16 digit, wajib sama NPWP login)
   - `TaxPeriodMonth` — Masa Pajak (1-12)
   - `TaxPeriodYear` — Tahun Pajak
   - `CounterpartOpt` — `Resident` | `Foreign`
   - `CounterpartTin` — NPWP/NIK karyawan (15/16 digit, wajib valid)
   - `CounterpartPassport` — nomor paspor (hanya Foreign)
   - `StatusTaxExemption` — kode PTKP: TK/0..TK/3, K/0..K/3, HB/0..HB/3
   - `Position` — posisi/jabatan karyawan
   - `TaxCertificate` — fasilitas: `N/A` | `DTP` | `ECT`
     (XSD converter menulis `ECT`; jangan "perbaiki" jadi ETC)
   - `TaxObjectCode` — kode objek pajak; pegawai tetap = `21-100-01`
     (sheet REF converter: "Penghasilan yang diterima oleh Pegawai
     Tetap"); pensiun berkala = `21-100-02` (di luar cakupan slip
     Payroll berjalan)
   - `Gross` — penghasilan bruto masa itu (rupiah)
   - `Rate` — tarif % (desimal titik di XML; koma di Excel
     dikonversi converter)
   - `IDPlaceOfBusinessActivity` — ID TKU pemotong (22 digit)
   - `WithholdingDate` — tanggal pemotongan `YYYY-MM-DD`; validasi
     converter: tidak boleh lebih rendah dari masa/tahun pajak
     bukti potong
   XSD di dalam converter: `CounterpartTin` pola `[0-9]{15,16}`,
   `TIN` pola `[0-9]{15,16}`.
3. Dasar e-Bupot 21/26: PER-02/PJ/2024 (DJP, artikel resmi
   https://pajak.go.id/en/node/104421, akses 2026-10-22) — e-Bupot
   PPh 21/26 berlaku sejak masa pajak Januari 2024.
4. Dokumen masa pajak TERAKHIR BUKAN BPMP: BPA1 (pegawai tetap
   swasta) / BPA2 (instansi pemerintah) — converter + template
   terpisah di halaman resmi yang sama (BPA1 Excel to XML
   7/11/2024; BPA2 update 7/11/2024, panduan DJP BPA2 akses
   2026-10-22). BPMP hanya untuk masa SELAIN masa terakhir.

Yang BELUM terverifikasi resmi (jangan dikarang):
- Skema XSD BPMP versi template zip (`bpmp.zip` 7/11/2024) tidak
  dibuka run ini (unduhan gagal); elemen di atas bersumber dari
  converter resmi v.3 (17/04/2025) yang memuat XSD `MONTHLYPAYROLL`
  di dalamnya — itu cukup untuk vonis kolom, BUKAN untuk klaim
  "file ISF pasti diterima Coretax". Uji unggah nyata ke Coretax
  = syarat buka ekspor (§D), di luar vonis ini.
- NITKU/ID TKU perusahaan ISF + NPWP pemotong versi 16 digit:
  data perusahaan berjalan (`schema.prisma:106` companyName,
  `:319` taxId pada model terkait) belum terbukti memuat ID TKU
  22 digit. Ekspor WAJIB fail-closed bila ID TKU kosong (§B).

### B. Vonis format ekspor yang SAH untuk tahap ini

Dua lapis, jangan dicampur:

**Lapis 1 — Ekspor internal ISF (SAH dibangun lebih dulu, default).**
Satu baris per karyawan per masa pajak (agregasi slip se-masa,
bukan per slip — lihat §C butir 4). Format: CSV UTF-8, pemisah
`;`, tanpa pemisah ribuan, desimal titik 2 angka (sen), tanggal
`YYYY-MM-DD`, header persis kolom di bawah. Nama file:
`pph21-rekap-internal-YYYY-MM.csv` (satu masa) /
`pph21-rekap-internal-YYYY.csv` (tahunan per karyawan).
Kolom wajib per baris:

| # | Kolom | Sumber (field nyata) | Aturan |
|---|-------|----------------------|--------|
| 1 | `masa_pajak` | `Payroll.period` (YYYY-MM) | dari slip approved/paid saja |
| 2 | `tahun_pajak` | turunan `period` | 4 digit |
| 3 | `employee_id` | `Payroll.employeeId` | internal, bukan identitas DJP |
| 4 | `nama` | `Employee.name` | |
| 5 | `npwp` | `Employee.npwp` | strip titik/strip; kosong → kosong (temuan §C) |
| 6 | `nik` | `Employee.idNumber` | strip spasi; sumber NIK berjalan |
| 7 | `kode_ptkp` | snapshot `pph21Ter` + `maritalStatus`/`dependents` | TK/n/K/n per F-026 §1; tidak terbaca → kosong + temuan |
| 8 | `kategori_ter` | `statutorySnapshot.pph21Ter.category` | A/B/C; legacy/unknown → kosong + temuan |
| 9 | `kode_objek_pajak` | konstanta tahap ini `21-100-01` | hanya pegawai tetap; jenis lain DILARANG masuk file ini |
| 10 | `penghasilan_bruto` | Σ `Payroll.grossSalary` se-masa | Decimal(15,2) → angka sen eksak |
| 11 | `dpp_pengurang` | — (lihat catatan) | BPMP tidak punya kolom DPP; kolom ini HANYA rekap internal masa final: isi Σ pengurang Pasal 10 dari snapshot final bila ada, selain itu kosong. JANGAN isi 0 palsu |
| 12 | `tarif_ter_persen` | `statutorySnapshot.pph21Ter.ratePct` | masa final = kosong (tarif Pasal 17 hasil hitung ulang, bukan TER) |
| 13 | `pph21_terpotong` | Σ `Payroll.pph21` se-masa | angka slip beku; TIDAK dihitung ulang |
| 14 | `over_withheld` | `statutorySnapshot.pph21Ter.overWithheld` (masa final) | >0 wajib tampil; bukan pengurang baris lain |
| 15 | `tanggal_pemotongan` | `Payroll.paymentDate` ?? `endDate` | satu tanggal per masa; multi-slip se-masa pakai tanggal slip terakhir terbit pada masa itu |
| 16 | `metode` | snapshot: `TER`/`LEGACY_PRE_TER`/`UNKNOWN` | dari `parsePph21TerSnapshot` existing |
| 17 | `jumlah_slip` | hitung slip se-masa | bukti agregasi |

Catatan DPP: permintaan "DPP/pengurang bila ada" terjawab —
sistem PPh21 TER tidak mengenal DPP per baris bulanan (F-026 §1:
pengurang terinternalisasi tabel TER). DPP hanya bermakna pada
hitung ulang masa terakhir (F-026 §4) dan BPMP resmi pun tidak
membawa kolom DPP — hanya `Gross` + `Rate`. Maka kolom 11 di atas
bersifat informatif rekap final, BUKAN input DJP.

**Lapis 2 — File impor Coretax BPMP (BELUM DIBUKA; syarat §D).**
Bila dibuka, targetnya BUKAN CSV ISF: hasil akhir wajib XML
sesuai template BPMP DJP (atau XLSX persis converter resmi v.3+
yang kemudian dikonversi converter DJP menjadi XML). Kolom
pemetaan ISF → BPMP: kolom 1→`TaxPeriodMonth`, 2→`TaxPeriodYear`,
5/6→`CounterpartTin` (NPWP 16 digit bila ada; selain itu NIK 16
digit — format `[0-9]{15,16}`), 7→`StatusTaxExemption`,
9→`TaxObjectCode`, 10→`Gross`, 12→`Rate`, 15→`WithholdingDate`.
Header file: `TIN` (NPWP pemotong) + `IDPlaceOfBusinessActivity`
(ID TKU) — keduanya dari master perusahaan, BUKAN dari slip.
`Position` dari `Employee.positionId`→nama posisi; kosong =
fail-closed baris itu (converter menuntut terisi).
Masa pajak terakhir (Desember / final resign) DILARANG masuk
BPMP — jalurnya BPA1, vonis terpisah sebelum dibangun.

### C. Rekonsiliasi rekap vs slip (mengikat)

Sumber kebenaran tunggal = slip. Rekap/ekspor adalah turunan
baca; selisih tidak pernah "dipilih" salah satu diam-diam.

1. **Persamaan wajib (persis sen).** Untuk masa `YYYY-MM`:
   `Σ Payroll.pph21` atas slip `status IN (approved, paid)` dan
   `period = masa` HARUS sama dengan total baris ekspor masa itu;
   sama untuk `Σ grossSalary`. Builder berjalan
   (`buildPph21Recap`, `PPH21_RECAP_STATUSES = [approved, paid]`,
   akumulasi `safeAdd(...,2)`) sudah menegakkan ini; ekspor wajib
   memakai builder/loader yang sama (`loadPph21Recap`), dilarang
   query agregasi kedua yang bisa menyimpang.
2. **Selisih > 0 sen = BLOKIR ekspor masa itu.** Bukan peringatan.
   Ekspor yang tidak cocok slip = berkas pajak salah; tidak ada
   ekspor parsial "yang cocok saja" tanpa daftar pengecualian
   eksplisit di berkas temuan. Peringatan (tidak memblokir) hanya
   untuk temuan data non-angka: NPWP/NIK kosong, metode
   LEGACY_PRE_TER/UNKNOWN ikut teragregasi, `overWithheld > 0`
   belum kembali, period tak terbaca (`unreadablePeriodSlips`),
   slip terkecuali (`excludedSlips`) — semuanya sudah dihitung
   builder dan WAJIB tampil di muka ekspor/rekap, bukan disembunyikan.
3. **Bukti rekonsiliasi per ekspor (wajib tersimpan bersama berkas):**
   masa, jumlah slip, jumlah karyawan distinct, Σ bruto, Σ PPh21
   dari builder, Σ PPh21 hasil jumlah baris file, selisih (wajib
   0,00), hitungan temuan butir 2, waktu + pelaku ekspor. Tanpa
   bukti ini berkas dianggap draf, bukan ekspor final.
4. **Agregasi se-masa.** `@@unique([employeeId, period])` berjalan
   + slip THR terpisah se-masa (F-026 §2/T7): ekspor mengelompokkan
   per (employeeId, period) — bruto dan PPh21 dijumlah dari semua
   slip approved/paid pada masa itu. Satu karyawan dua baris pada
   masa sama = cacat ekspor (BPMP satu baris per penerima per masa).
5. **Idempotency.** Ekspor ulang masa yang sama menghasilkan berkas
   identik (baris terurut employeeId, angka dari slip beku) selama
   tidak ada slip koreksi baru; koreksi slip sesudah ekspor TIDAK
   mengubah berkas lama — terbit ekspor pembetulan baru dengan
   rujukan masa + nomor urut pembetulan, berkas asal tetap.

### D. Syarat buka ekspor (untuk BOT 3, kelak — bukan kartu ini)

Ekspor internal (Lapis 1) boleh dibangun sesudah: (a) penjaga
rekonsiliasi §C.1-§C.3 teruji (§E); (b) tampilan temuan §C.2 ada.
Ekspor Coretax BPMP/BPA1 (Lapis 2) DILARANG dibangun sebelum:
(a) ID TKU + NPWP 16 digit pemotong tersedia di master dan
terverifikasi; (b) satu berkas hasil konversi converter resmi DJP
lolos unggah uji nyata di Coretax oleh manusia dan buktinya
dicatat di backlog; (c) vonis terpisah BOT 4 untuk BPA1 masa
terakhir. Tanpa (a)-(c), tombol "ekspor DJP/e-Bupot" tidak boleh
ada — label jujur tahap ini: "Rekap baca dari slip terbit — bukan
berkas ekspor DJP/e-Bupot" (sudah terpasang di
`pph21-recap-data.ts:69`, PERTAHANKAN).

### E. Acceptance untuk BOT 6 (kasus uji mengikat bila ekspor dibuka)

1. **Rekap = slip persis sen.** Fixture ≥2 karyawan, ≥2 masa,
   termasuk satu masa berisi slip REGULAR+THR se-karyawan: Σ baris
   ekspor per masa == `buildPph21Recap.periods[].pph21/gross`
   == Σ manual `Payroll.pph21/grossSalary` approved/paid. Selisih
   0,00. Falsifikasi: ubah satu `Payroll.pph21` sebesar 0,01 →
   penjaga §C.1 merah / ekspor terblokir.
2. **Selisih 1 sen tertangkap.** Suntik selisih 0,01 antara total
   file dan total builder (atau slip draft ikut terhitung): ekspor
   DITOLAK dengan pesan selisih, berkas final tidak terbit. Cabut
   penjaga rekonsiliasi → tes ini wajib merah.
3. **Periode tanpa payroll ditolak kosong.** Masa tanpa slip
   approved/paid: ekspor menolak "tidak ada data" — dilarang
   berkas berisi header saja berkedok ekspor sah; rekap tetap
   menampilkan notice kosong existing. Slip hanya draft pada masa
   itu = sama: tertolak + `excludedSlips` tampil.

### F. Batas (rujuk, tidak divonis ulang)

- Slip lama pra-TER: F-026 §5 — tidak dihitung ulang, tidak
  diterbitkan ulang; di ekspor tampil apa adanya dengan
  `metode=LEGACY_PRE_TER/UNKNOWN` sebagai temuan §C.2.
- Masuk/keluar tengah tahun + masa terakhir: F-026 §3-§4. Ekspor
  tidak mengubah perlakuan; masa final keluar dari BPMP (§A.4).
- Penghasilan tidak teratur: F-026 §2 — sudah tergabung di bruto
  se-masa; ekspor dilarang memisahkan tarif per komponen.
- Di luar cakupan: TER harian/bukan-pegawai/peserta kegiatan,
  PPh 26, bukti potong final pesangon (21-401-xx), jurnal
  akuntansi PPh21/lebih-potong — masing-masing butuh vonis sendiri.

### Handoff F-028 ekspor

- BOT 3 (backend): rekap baca selesai; ekspor internal hanya
  sesudah syarat §D lapis 1 + penjaga §C; ekspor Coretax menunggu
  §D lapis 2 penuh. Jangan buat query agregasi kedua, jangan
  tebak elemen XML di luar converter resmi v.3 di atas.
- BOT 6 (QA): acceptance §E.1-§E.3 + falsifikasi wajib (cabut
  penjaga → merah). Uji unggah Coretax nyata = manusia, bukan CI.
- BOT 2 (frontend): tampilkan snapshot/temuan backend apa adanya;
  label "bukan berkas ekspor DJP" dipertahankan sampai §D lapis 2
  terpenuhi; UI tidak menghitung ulang pajak.

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
- KEJADIAN 2026-10-22 — Tahap 3 RUTE PROVISI MATI dibangun (BOT 3,
  kartu t_d4ae15cc): pemanggil E2/E3 kini hidup di
  `src/lib/services/warranty-journal.service.ts` +
  `postWarrantyClaimCostAction`/`postWarrantySupplierRecoveryAction`
  (izin `approve_warranty_claims`); gerbang server `invoiceForbidden`
  ditegakkan di createSalesInvoice/createDifferenceInvoice/
  createProgressInvoice/postInvoice lewat jembatan
  quotationId/projectId/salesOrderId (SalesInvoice tak punya FK WO).
  Mapping `SystemSetting.warrantyExpenseAccountId`/
  `warrantyProvisionAccountId`/`supplierClaimReceivableAccountId`
  nullable fail-closed; CoA 510104/210205/110508 di `CHART_OF_ACCOUNTS`
  + seed migrasi `20261022030000_warranty_journal_mapping` instalasi
  berjalan + automap by-code persis (510103 tetap Penyesuaian
  Persediaan, DILARANG garansi). E2 rute MATI = reklasifikasi beban:
  Dr 510104 / Cr akun beban sumber WO repair (MaterialIssue completed
  sudah Dr beban material/Cr Persediaan di hook existing — Cr
  Persediaan kedua dilarang); ProductionCost WO-only belum punya GL
  sendiri existing (ceiling terdokumentasi di service). E1/E4 TETAP
  tidak dibangun dan tidak disaklarkan; rute provisi hanya hidup
  sesudah gerbang data §2 dinilai BOT 4.
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

## VONIS BOT 4 F-021 TAHAP 3 LANJUTAN — Penilaian gerbang G1-G7 (2026-10-22)

Pemutus: `accounting-finance-tax` (BOT 4). Kartu: t_0c38a33e.
Lanjutan vonis inti F-021 tahap 3 (PR #383 MERGED di main
6c1384f6). Tanpa kode, tanpa ubah src/lib/tax, tanpa vonis angka
baru di luar vonis inti §0-§9. Bukti live run ini: worktree
t_0c38a33e basis origin/main 3f6a08d9.

### 1. Tabel gerbang (bukti live per gerbang)

| Gerbang | Status | Bukti live run ini |
|---|---|---|
| G1 PUTUSAN Lead buka inti | BELUM | Board baris 814 masih "HANDOFF BOT 4 -> Lead: PUTUSAN buka inti = gerbang G1"; grep board tak menemukan PUTUSAN Lead membuka inti F-021 tahap 3 sesudah vonis inti terbit. Merge #383 = merge dokumen vonis, BUKAN putusan buka inti. |
| G2 Migrasi inti (3 akun + 3 kolom setting + koreksi header) | BELUM | grep `510104\|210205\|110508` di base-data.ts/schema.prisma = 0 hasil; SystemSetting tanpa kolom warranty*; header warranty-accounting.ts:51-53 masih kode usang 510103/2105xx/1108xx. Ini memang isi paket inti — belum dibangun bukan pelanggaran, tapi gerbang belum terpenuhi. |
| G3 Gerbang data §2 / mode provisi MATI | BELUM terbukti (rute MATI tersedia) | Model tahap 2 hidup (WarrantyCoverage schema:4068, WarrantyClaim:4109) tetapi usia data produksi tak dapat dibuktikan dari repo; 12 bulan/30 klaim closed per kelompok = bukti data operasional, bukan bukti kode. Vonis inti §6 G3 sendiri menyediakan rute sah: inti dibangun dengan provisi MATI (E1/E4 nonaktif, hanya E2 beban-saat-terjadi + E3). Rute itu yang divonis di §2 bawah. |
| G4 Sumber biaya E2 terverifikasi | TERPENUHI sebagian (struktur) | `WarrantyClaim.repairWorkOrderId` ada (schema:4121) + relasi repairWorkOrder; biaya WO repair dari MaterialIssue/ProductionCost = jalur WO existing. Belum ada pemanggil yang membuktikan rantai klaim->biaya di kode produksi (memang inti belum dibangun). Syarat bentuknya siap dipakai inti. |
| G5 invoiceForbidden di server | BELUM | grep invoiceForbidden/WarrantyClaim di jalur invoice (sales.actions.ts, invoice service) = 0; tak ada penjaga server yang menolak SalesInvoice dari WO repair covered. Wajib dibangun di inti, diuji AC-G2. |
| G6 assertPeriodOpen + anti-dobel + mapping fail-closed per pemanggil | BELUM (prasyarat pola TERSEDIA) | `journals_reference_unique` ada (schema:3024); 4 referenceType vonis inti (WarrantyProvisionAccrual dst.) grep di src = 0 pemanggil; mapping warranty belum ada (G2). Pola existing (assertPeriodOpen, cek POSTED non-REVERSED) tersedia untuk dipakai inti. |
| G7 Acceptance BOT 6 lulus | BELUM | AC-G1..G10 vonis inti §7 belum dijalankan siapa pun atas implementasi (implementasi belum ada). Berlaku sebagai syarat selesai inti, bukan syarat mulai. |

### 2. Putusan: TUNDA PENUH bukan; BUKA BERSYARAT rute provisi-MATI

Putusan BOT 4: **BUKA implementasi inti tahap 3 SESUDAH G1
terbit, HANYA dalam mode provisi MATI** (jalur G3 alternatif vonis
inti): E2 (beban klaim saat terjadi, seluruh biaya ke 510104
selama saldo provisi 0) + E3 (recovery virtually-certain) +
penjaga G5/G6. **E1/E4 (akrual + pelepasan provisi) TETAP
DITUNDA** sampai gerbang data §2 terbukti dari data operasional
nyata (12 bulan ATAU 30 klaim closed per kelompok + metode
tertulis disetujui finance) — bukti itu dinilai BOT 4 dari data,
bukan dari kode; BOT 3 dilarang mengarang saklar aktivasi provisi
sebelum penilaian itu.

Alasan satu kalimat: seluruh syarat bentuk (model tahap 1-2,
mesin F-49 teruji 10/10, unique jurnal, pola fail-closed) sudah
tersedia; yang belum ada hanya putusan Lead (G1) dan paket inti
itu sendiri (G2/G5/G6) — menunda keduanya atas nama gerbang data
provisi akan menahan juga jalur beban-saat-terjadi yang justru
diwajibkan vonis inti selama provisi belum andal.

### 3. Syarat sisa (mengikat kartu BOT 3)

1. Urutan bangun persis vonis inti §6 G2: 3 akun CoA -> 3 kolom
   SystemSetting -> koreksi header warranty-accounting.ts:51-53
   -> pemanggil E2/E3 saja. E1/E4 tidak dibangun, tidak disiapkan
   saklarnya.
2. G5 + G6 dibangun bersama pemanggil, bukan menyusul:
   invoiceForbidden server, assertPeriodOpen dalam tx, cek
   anti-dobel referenceType/referenceId, mapping fail-closed.
3. Acceptance kartu BOT 3 = AC-G2, AC-G3 (varian saldo 0: seluruh
   biaya 510104), AC-G4, AC-G5, AC-G6, AC-G7, AC-G8, AC-G10
   (rekonsiliasi trivial saldo provisi 0 + WAR-01) dari vonis inti
   §7. AC-G1 + AC-G9 DITUNDA bersama E1/E4. Falsifikasi wajib
   tetap: cabut fail-closed mapping -> merah; cabut
   invoiceForbidden -> merah; dobel posting E2 -> merah.
4. Aktivasi E1/E4 kelak = kartu terpisah dengan penilaian gerbang
   data BOT 4 (§2) sebagai syarat masuk; bukan flag admin bebas.

### 4. Yang tidak berubah

Seluruh vonis inti §0-§9 tetap berlaku: akun 510104/210205/
110508, recovery hanya virtually-certain, garansi service
DITUNDA, deductibility fiskal BUTUH-VONIS-AKUNTAN, koreksi jurnal
hanya reversal/jurnal lawan di periode terbuka.

### Handoff F-021 tahap 3 lanjutan

- Lead: terbitkan PUTUSAN G1 (atau tolak dengan alasan) — sesudah
  itu BOT 3 boleh mulai; tanpa G1 tetap jangan bangun.
- BOT 3: kartu inti rute provisi-MATI per §3; berhenti dan
  eskalasi BOT 4 bila bentuk akrual tambahan perubahan estimasi
  atau penyimpanan bukti butuh model baru di luar vonis inti.
- BOT 6: siapkan AC per §3 butir 3; AC-G1/AC-G9 ditunda bersama
  E1/E4, jangan diuji sebagai kegagalan inti rute ini.

---

---

## VONIS BOT 4 2026-10-21 23:43 WIB — F-2026-10-21-027 / BR-027-07 basis pajak per komponen (FINAL, tertulis saja)

Pemutus: `accounting-finance-tax` (BOT 4 / Salsa), kartu t_43cdbc95.
Sumber kartu: spec Wira t_2dcbf0f0 §H (BR-027-07), vonis akun F-027-V
t_e7624f49, kickoff Nara t_ae87a2a1. Tanpa kode; `src/lib/tax/**`,
`accounting.hook.ts`, schema TIDAK disentuh vonis ini. Bukti live:
origin/main 12e7dfc1 (fetch 2026-10-21 23:43) + PR #360 head d1fdb8a0
OPEN/BEHIND (struktur BR-027-I06). Tahap jurnal F-027 menunggu #360
merged — vonis ini tidak menunggu hijau, sesuai badan kartu.

### 0. Dua bruto, jangan dicampur (putusan dasar)

1. **Bruto kas/akuntansi** = base + Σ earning dibayar (tunai maupun yang
   kelak non-tunai diakui) + overtime + appreciation. Ini gross slip
   berjalan (buildPayrollWrite hrm.actions.ts origin/main: gross =
   base+allowances+overtime+appreciation) dan dasar kaki debit jurnal.
2. **Bruto pajak masa berjalan (basis TER)** = seluruh penghasilan
   Pegawai Tetap teratur + tidak teratur dari pemberi kerja dalam
   1 masa pajak, dikurangi hanya penghasilan yang BUKAN objek/tidak
   termasuk dipotong. Dasar: PMK 168/2023 Pasal 5 ayat (1) huruf a dan
   ayat (3), Pasal 6 ayat (1), Pasal 8 ayat (1) huruf a + ayat (2)
   huruf a. Masa terakhir: bruto tahunan − pengurang Pasal 10 −
   PTKP (Pasal 8 ayat (3)/(5), Pasal 10).
3. Konsekuensi nama snapshot: `taxableGross` = bruto pajak (butir 2),
   BUKAN bruto kas. Slip warisan tanpa snapshot = mode warisan agregat.

### 1. Tabel basis per jenis komponen (mengikat tahap split)

| # | Jenis komponen | Basis pajak | Syarat keras (gagal satu = taxable) |
|---|---|---|---|
| T1 | Earning teratur tunai (gaji, tunjangan tetap, uang lembur, apresiasi, tunjangan tunai kesehatan/asuransi ke karyawan) | TAXABLE penuh; masuk TER masa diterima | — (PMK 168/2023 Pasal 5 ayat (3) huruf a) |
| T2 | Earning tidak teratur (THR, bonus, tantiem, jasa produksi, gratifikasi, premi tidak teratur) | TAXABLE penuh; DIGABUNG bruto masa diterima lalu TER; masa terakhir masuk hitung ulang Pasal 17 | Bukan dipisah tarif sendiri (PMK 168/2023 Pasal 5 ayat (3) huruf b; PP 58/2023 TER atas bruto gabungan se-masa; DJP: THR+ gaji digabung, pajak.go.id artikel TER-THR). Vonis F-026 §2 tetap berlaku PENUH; adanya baris komponen tidak mengubahnya |
| T3 | Reimbursement biaya kerja tunai (penggantian pengeluaran nyata: perjalanan dinas, transport kerja, makan dinas luar) | NON-TAXABLE hanya sebesar nilai terbukti, dan hanya bila BUKAN natura/kenikmatan | (a) bukti pengeluaran pihak ketiga atas nama/tanggal pekerjaan; (b) penggantian ≤ pengeluaran nyata (selisih lebih = T1 taxable); (c) bukan tambahan penghasilan tetap berkedok penggantian. Tanpa bukti lengkap: TAXABLE (fail-safe). Catatan kejujuran dasar: reimbursement tunai murni BUKAN pengecualian PMK 66/2023 (itu mengatur natura); ia di luar penghasilan karena sifat penggantian biaya — klasifikasi dokumen, BUKAN flag bebas. Kupon/penggantian makan dinas luar dalam bentuk natura: PMK 66/2023 Pasal 5 ayat (3)-(5), batas Rp2.000.000/bln atau nilai penyediaan di tempat kerja (mana lebih besar); selisih lebih taxable |
| T4 | Natura/kenikmatan dikecualikan objek | NON-TAXABLE hanya dalam kategori + batas PMK 66/2023 | Wajib `kategori pengecualian terstruktur` per master (Pasal 4 huruf a-e; Lampiran jenis/batasan): makanan seluruh pegawai; daerah tertentu berpenetapan DJP (Pasal 8); wajib kerja K3 (Pasal 6: seragam, alat keselamatan, antar-jemput, penginapan awak, penanganan pandemi/bencana); APBN/APBD; jenis-berbatas (kupon makan ≤2jt/bln Pasal 5 ayat (4), tempat tinggal nonkomunal ≤2jt/bln, olahraga ≤1,5jt/bln, kendaraan syarat kumulatif bukan pemegang saham + bruto ≤100jt/bln — Lampiran). Selisih di atas batas = TAXABLE (Pasal 7 ayat (4)). Tanpa kategori terpilih: TAXABLE |
| T5 | Natura/kenikmatan objek + premi/iuran dibayar pemberi kerja yang menjadi objek (PMK 168/2023 Pasal 5 ayat (3) huruf d-f: JKK, JKM, premi asuransi dibayar pemberi kerja) | TAXABLE (nilai masuk bruto pajak) | Tetap DITUNDA-3 vonis akun (kaki kredit non-tunai belum didesain): master boleh disimpan NONAKTIF; generate MENOLAK baris ini aktif sampai tahap jurnal natura dibuka. Iuran pensiun/hari tua dibayar PEMBERI KERJA ke dana pensiun sah/BPJS TK/badan THT: BUKAN objek yang dipotong (PMK 168/2023 Pasal 7 huruf c) — tetapi itu komponen pemberi kerja (DITUNDA-1), DILARANG disisipkan sebagai earning/deduction karyawan |
| T6 | Tunjangan PPh21 / PPh21 ditanggung (gross-up) | DITUNDA-2 tetap | DILARANG aktif sebagai komponen earning biasa (objek kenikmatan; hitung iteratif). PMK 168/2023 Pasal 7 huruf h hanya mengecualikan PPh yang ditanggung PEMERINTAH (DTP), bukan ditanggung perusahaan |

### 2. Penetapan flag isTaxable (siapa boleh, bagaimana)

1. Flag hidup di MASTER `PayrollComponent`, disalin ke snapshot baris
   saat slip lahir (pola vonis akun §1 butir 3). Edit master tidak
   mengubah slip terbit.
2. `isTaxable=false` SAH hanya untuk T3/T4, dan hanya bila master
   memuat alasan terstruktur: kelas pengecualian (T3: penggantian-biaya
   berbukti; T4: kategori PMK 66/2023 + batas nilai bila berlaku).
   Flag false tanpa alasan terstruktur = data tidak sah; server tahap
   split WAJIB menolak simpan (bukan diam-diam menganggap taxable).
3. Penetap: peran pengelola master komponen (permission master SDM
   berjalan `create_employees`/`edit_employees` + scope all per spec
   Wira §C) BOLEH membuat komponen taxable. Menetapkan/mengubah
   `isTaxable=false` adalah keputusan pajak: tahap split WAJIB gerbang
   tambahan — perubahan flag ke non-taxable dicatat audit (siapa,
   kapan, alasan, kategori) dan TIDAK berlaku surut ke slip terbit.
   Permission khusus pajak terpisah = BUTUH-VONIS Lead (BR-027-09);
   sampai ada, gerbang audit + scope all adalah minimum, dan UI
   DILARANG membingkai flag sebagai "bebas pajak aktif" selama mode
   masih all-taxable-v1 (spec Wira §F/§C-akhir — ditegaskan ulang).
4. Deduction: `isTaxable` tidak bermakna; disimpan false, diabaikan
   (spec Wira §2). Dilarang memakai flag deduction untuk mengurangi
   basis (lihat §3).

### 3. Deduction pengurang basis — daftar tertutup

Basis TER masa berjalan TIDAK dikurangi deduction komponen apa pun.
Pengurang bruto hanya dikenal pada hitung ulang masa terakhir
(PMK 168/2023 Pasal 10 ayat (1)), daftar TERTUTUP:

| Pengurang sah (masa terakhir saja) | Perlakuan komponen |
|---|---|
| Biaya jabatan 5% bruto, maks Rp500.000/bln / Rp6.000.000/thn (Pasal 10 ayat (2)) | Dihitung mesin F-026; BUKAN komponen master; dilarang operator membuat komponen "biaya jabatan" |
| Iuran pensiun/hari tua terkait gaji dibayar PEGAWAI melalui pemberi kerja ke dana pensiun sah OJK/Menteri, BPJS TK, atau badan THT sah (Pasal 10 ayat (1) huruf b) — praktik berjalan: JHT+JP porsi karyawan (`employment` computeBpjsEmployee; BPJS Kesehatan TIDAK termasuk) | Satu-satunya kelas deduction yang boleh mengurangi bruto tahunan. Syarat tahap split: deduction terklasifikasi terstruktur `pengurangPensiun=true` hanya untuk iuran ke penerima Pasal 10 ayat (1) huruf b; selain itu false dan tidak mengurangi apa pun |
| Zakat/sumbangan keagamaan wajib dibayar melalui pemberi kerja ke BAZ/LAZ/lembaga disahkan pemerintah (Pasal 10 ayat (1) huruf c) | Boleh sebagai komponen deduction terklasifikasi `zakatWajib=true` hanya bila penerima terstruktur sah; bukti setor ke lembaga = syarat dokumen tahap jurnal |

Selain tiga baris di atas: deduction (koperasi, cicilan, denda,
potongan disiplin, angsuran) TIDAK mengurangi basis pajak pada masa
apa pun — hanya mengurangi net (kelas D1/D2 vonis akun §4 tetap:
D1 mengurangi bruto KAS akuntansi tanpa kredit Hutang Gaji; D2 wajib
akun liability penampung). Membuat deduction generik mengurangi TER =
salah potong, dilarang.

### 4. Komponen tidak tetap (variable)

1. Recurrence `variable` tidak pernah tertarik otomatis (vonis akun
   §6, spec Wira T2.1/E12). Masuk manual per slip draft, atau run
   khusus (mis. run THR `Payroll.type=THR` berisi komponen THR
   eksplisit).
2. Perlakuan pajak variable mengikuti §1 menurut JENISNYA (THR/bonus
   variable = T2 taxable gabungan se-masa; reimbursement variable =
   T3 bersyarat bukti). Label variable TIDAK memberi perlakuan pajak
   tersendiri.
3. Dua slip se-masa (reguler + THR terpisah): agregasi bruto se-masa
   F-026 T7 tetap mengikat — tahap split dilarang menghitung slip
   variable terisolasi dari slip lain se-masa karyawan sama.

### 5. Mode all-taxable-v1: SAH untuk tahap struktur, dengan batas

1. **SAH dan WAJIB dipertahankan** pada PR struktur F-027 (#360):
   snapshot berjalan `payrollComponents: { mode: "all-taxable-v1",
   taxableGross: grossSalary, nonTaxableEarningTotal: 0, ... }`
   (PR #360 head d1fdb8a0, payrollComponentsSnapshotValue) persis
   kontrak spec Wira §3/§D. `isTaxableSnapshot` disimpan, tidak dibaca
   mesin hitung apa pun. Bentuk kunci snapshot ini FINAL; tahap split
   hanya mengubah cara mengisi, bukan bentuk (spec Wira §D ditegaskan).
2. **FALSIFIKASI ANGKA — dinyatakan eksplisit:** fixture tanpa komponen
   menghasilkan gross/PPh21/net IDENTIK pra vs pasca fitur; fixture
   dengan baris earning menghasilkan angka sama dengan allowances
   agregat lama sebesar Σ baris. Bukti berjalan PR #360: tes "tanpa
   penugasan angka identik pra-fitur" (hrm-payroll-components.test.ts)
   + snapshot taxableGross=5.800.000 pada fixture berbaris. Cabut
   tarikan / cabut penjumlahan Σearning ke basis massal → tes paritas
   massal-vs-tunggal (AC-T4 spec Wira) wajib MERAH; pulih hijau.
3. Batas sah: mode ini berhenti sah pada hari tahap split diaktifkan.
   Sesudah split, slip BARU wajib mode split; slip all-taxable-v1 dan
   warisan tetap terbaca, tidak dihitung ulang surut (pola §7 vonis
   akun + F-026 titik berlaku).

### 6. Syarat buka tahap jurnal F-027 (gerbang, semua wajib)

Tahap jurnal (BR-027-08 implementasi + mode split) BOLEH dibuka hanya
bila SEMUA terpenuhi:

1. PR #360 merged ke main (struktur + mode all-taxable-v1 live).
   Status cek terakhir vonis ini: OPEN head d1fdb8a0, BEHIND,
   check berjalan — belum merged, jadi gerbang ini BELUM terpenuhi.
2. Mesin split: `taxableGross` diisi dari §1 (T3/T4 non-taxable keluar
   basis TER masa berjalan DAN keluar pengurang tak sah), snapshot
   menulis `mode: "split"` hanya untuk slip yang dihitung mesin split;
   penulisan mode split sebelum syarat ini = dilarang (spec Wira D2).
3. Gerbang approve tambahan (menjawab §H butir d spec Wira): slip mode
   split DITOLAK approve bila snapshot basis tidak lengkap (mode absen,
   taxableGross ≠ bruto kas − nonTaxableEarningTotal, atau ada baris
   isTaxable=false tanpa alasan terstruktur tersnapshot). Slip
   all-taxable-v1/warisan TIDAK kena gerbang baru ini.
4. Validasi akun tahap jurnal aktif bersamaan: accountId komponen
   EXPENSE aktif saat simpan untuk earning; D2 accountId LIABILITY
   wajib (generate ditolak bila kosong) — vonis akun §1.2/§3/§4 mulai
   berlaku di tahap ini, bukan di PR struktur (penyimpangan sadar
   spec Wira F3 berakhir di sini).
5. Koreksi D1 (late/absent/deduction pengurang bruto berhenti dikredit
   ke Hutang Gaji 210204) dibangun dalam scope khusus
   `accounting.hook.ts` terpisah, tidak dicampur PR struktur; jurnal
   tetap SATU per slip paid, komponen hanya memecah kaki debit
   (vonis akun §1 butir 1/4).
6. Tes falsifikasi §7 hijau di SHA tahap jurnal persis + gate repo
   (tsc, lint berkas, vitest berkas) hijau; PR terbuka tanpa merge
   menunggu verdict Qila di SHA persis.

### 7. Acceptance untuk tahap split (draf untuk Qila)

- AC-S1: reimbursement T3 Rp1.000.000 berbukti pada bruto kas
  Rp10.000.000: taxableGross Rp9.000.000, PPh21 sama dengan slip tanpa
  baris reimbursement; bukti dicabut → komponen tertolak non-taxable
  (atau terhitung taxable), PPh21 naik. Dua arah terbukti: flag dibalik
  ke taxable → PPh21 berubah; kedua arah wajib tes
  merah-bila-penjaga-dicabut (frasa falsifikasi dua-arah dari #369).
- AC-S2: natura T4 kupon makan Rp2.500.000/bln: Rp500.000 taxable,
  Rp2.000.000 non-taxable (PMK 66/2023 Pasal 5 ayat (4)-(5)).
- AC-S3: THR variable Rp10.000.000 se-masa dengan reguler
  Rp10.000.000: PPh21 slip kedua = selisih TER atas gabungan
  Rp20.000.000 (pola F-026 T7), bukan TER slip sendiri.
- AC-S4: deduction koperasi Rp500.000: basis pajak tidak berubah,
  net berkurang Rp500.000; deduction iuran JHT/JP karyawan hanya
  mengurangi pada hitung ulang masa terakhir, tidak pada TER berjalan.
- AC-S5: ubah flag master sesudah slip terbit: slip lama tidak
  berubah (snapshot); slip baru memakai flag baru.
- AC-S6: slip mode split tanpa snapshot basis lengkap → approve
  ditolak; slip all-taxable-v1 lama → approve tetap jalan.
- AC-S7: generate ulang periode sama: tidak ada slip/baris dobel;
  angka paritas massal vs tunggal tetap identik (AC-T4 hidup terus).

### 8. Sumber (diakses 2026-10-21)

- PMK 168/2023 (berlaku 1 Jan 2024): Pasal 5, 6, 7, 8, 10 —
  https://peraturan.go.id/files/permenkeu-no-168-tahun-2023.pdf ;
  ringkasan JDIH https://jdih.kemenkeu.go.id/dok/pmk-168-tahun-2023 ;
  PDF JDIH https://jdih.kemenkeu.go.id/api/download/e60a82e0-b218-40f5-9d18-b924aa1e11ce/2023pmkeuangan168.pdf
- PP 58/2023 TER (Lampiran tarif; bruto gabungan se-masa) — dirujuk
  lewat PMK 168/2023 Mengingat butir 4 + vonis F-026 backlog.
- PMK 66/2023 natura: Pasal 3, 4, 5, 6, 7, 8 + Lampiran —
  https://peraturan.go.id/files/permenkeu-no-66-tahun-2023.pdf ;
  https://jdih.kemenkeu.go.id/dok/pmk-66-tahun-2023/summary
- DJP, THR digabung gaji masa sama (TER): 
  https://www.pajak.go.id/id/artikel/meluruskan-narasi-kenaikan-pajak-atas-thr
- Produk (bukan dasar hukum): Zahir komponen tetap/tidak tetap +
  kena pajak; Accurate pencatatan gaji — URL di backlog F-027 induk.

### 9. Yang tetap DITUNDA / bukan vonis ini

DITUNDA-1..6 vonis akun t_e7624f49 tetap: BPJS pemberi kerja,
gross-up (T6), kaki kredit natura (T5), pisah akun Utang PPh21/BPJS,
cost center per baris, komponen rumus otomatis. Permission khusus
pajak untuk flag non-taxable = BR-027-09 milik Lead bila diminta.
Angka gaji personal tidak masuk vonis/board publik.

Pemilik berikutnya: Bara (backend) — tahap split + jurnal hanya
sesudah gerbang §6 butir 1 terpenuhi, kartu tahap jurnal TERPISAH;
Qila — AC-S1..S7; Fira — label flag tetap klasifikasi tersimpan,
bukan janji bebas pajak, sampai mode split live.

## VONIS BOT 4 2026-10-22 — F-2026-10-22-041 Tabrakan kode 210205: provisi garansi vs liabilitas PPh 4(2) sewa

Status: PUTUSAN FINAL BOT 4 (kartu t_956b5056). Menyelesaikan
tabrakan usulan akun antara vonis F-021 tahap 3 (merged #388) dan
vonis F-038/F-039 PPh 4(2) sewa (tertulis, menunggu rilis). Dokumen
saja; tanpa kode/schema/migrasi.

### Fakta terverifikasi live (origin/main 9f140792)

1. COA bawaan `src/lib/setup/base-data.ts` kelompok 2102 "Kewajiban
   Jangka Pendek Lainnya" (OCLY) terisi berurutan: 210201 PPN
   Keluaran, 210202 PPh 23 Pembelian, 210203 Hutang Pembelian Belum
   Ditagih, 210204 Hutang Gaji. Kode 210205 dan 210206 BELUM dipakai
   akun apa pun di COA bawaan (grep live run ini).
2. Vonis F-021 tahap 3 (backlog, merged) memakai 510104 Beban Provisi
   Garansi / 210205 Provisi Garansi / 110508 Klaim Garansi Dibayar di
   Muka + 3 mapping SystemSetting; kartu implementasi BOT 3
   t_d4ae15cc sudah READY dengan gerbang G1 Lead.
3. Vonis F-038 butir 2 menulis: "Akun liabilitas terpisah dari 210202
   (usulan akun baru Utang PPh Final Sewa, kode 210205 bebas
   terverifikasi di COA bawaan)". Kata "usulan ... bebas
   terverifikasi" berarti F-038 TIDAK mengunci 210205 — ia mengunci
   syaratnya: terpisah dari 210202 dan fail-closed. Vonis F-039
   mengulang "210205 usulan" pada jurnal sewa dibayar di muka.

### Putusan

1. **210205 = Provisi Garansi (tetap milik F-021).** Dilarang dipakai
   ulang untuk kewajiban pajak apa pun.
2. **210206 = akun baru "Utang PPh 4(2) Sewa Tanah/Bangunan"** (anak
   2102, OCLY) untuk liabilitas PPh Pasal 4(2) final persewaan tanah
   dan/atau bangunan per PP 34/2017 (F-038/F-039). Seluruh rujukan
   "Utang PPh Final Sewa (210205 usulan)" di vonis F-038 butir 2 dan
   F-039 (jurnal sewa dibayar di muka + rekap) DIGANTI 210206. Tarif,
   saat potong, kode objek, dan tenggat TIDAK berubah.
3. Perlakuan mapping mengikuti pola existing, bukan SystemSetting
   baru: jenis potong PPh menunjuk akun liabilitas per KODE COA lewat
   `WITHHOLDING_TAX_TYPES` (`liabilityAccountCode`, pola PPH23-BELI ->
   210202 di base-data.ts). Jenis bawaan PPh 4(2) sewa (kode jenis
   diusulkan `PPH42-SEWA`, tarif 10% master bertanggal efektif)
   membawa `liabilityAccountCode: "210206"`. Akun 210206 tidak ada /
   tidak aktif = jurnal pembayaran berpotongan GAGAL fail-closed
   berisik; dilarang fallback ke 210202 atau akun pajak lain.
   Provisi garansi TETAP lewat SystemSetting F-021
   (warrantyProvisionAccountId -> 210205) — dua jalur mapping berbeda
   untuk dua substansi berbeda, disengaja.

### Alasan (PSAK/CoA)

Provisi garansi adalah liabilitas ESTIMASI PSAK 57: kewajiban kini
dari peristiwa masa lalu yang jumlah dan waktunya tidak pasti, diukur
dari taksiran klaim, dipakai saat klaim, dan kelebihan provisi
dibebaskan kembali ke laba rugi. Utang PPh 4(2) adalah liabilitas
PASTI: jumlahnya persis 10% x DPP per masa, dibuktikan bukti potong,
dan lunas hanya dengan penyetoran ke kas negara (KJS 411128-403).
Satu kode akun untuk dua substansi itu merusak dua rekonsiliasi
sekaligus: (a) saldo potong-per-masa tidak bisa ditelusur dari bukti
potong ke GL untuk SPT Masa Unifikasi; (b) roll-forward provisi
(dibentuk-dibebani-dipakai-dibebaskan) tercemar mutasi setor pajak.
Prinsip COA yang sudah hidup di repo: satu kode = satu substansi;
pajak potong duduk berurutan di kelompok 2102 sesudah kewajiban
lancar lain (210204), provisi duduk di 210205 sesuai vonis yang lebih
dulu final dan sudah bergerbang implementasi.

### Batas build

- BOT 3 (t_c70095d5 F-038): seed akun 210206 + jenis PPH42-SEWA
  menunjuk 210206; JANGAN tanam 210205 untuk pajak. Kartu t_d4ae15cc
  F-021 tidak berubah (210205 sah miliknya).
- BOT 5 (spec F-040-S t_cbecc698, PR #393): sesuaikan tabel akun di
  spec ke 210206 sebelum spec dirilis; heartbeat "210205=Provisi
  Garansi (tabrak)" terjawab oleh vonis ini.
- BOT 6: falsifikasi wajib — pembayaran sewa bruto Rp100.000.000
  memotong Rp10.000.000 -> kredit 210206 (bukan 210202, bukan
  210205); hapus/nonaktifkan akun 210206 -> jurnal GAGAL fail-closed;
  jurnal provisi garansi tetap kredit 210205 dan tidak menyentuh
  210206.

Tanpa klaim kepatuhan baru: tarif/kode objek/tenggat tetap per vonis
F-038/F-039 beserta sumber resminya; vonis ini hanya memutus KODE
AKUN.

## VONIS BOT 4 2026-10-22 — F-2026-10-21-033 Q-033-1/2/4 (margin per kendaraan)

Status: PARSIAL — builder `vehicle-margin` + loader `vehicle-margin-data`
sudah merged (PR #305), belum ada konsumen UI. Vonis ini menjawab
Q-033-1/2/4 dari spec BOT 5 (PR #380). Q-033-3 (WO multi-kendaraan)
dan Q-033-6 (tempat permukaan) tetap milik BOT 1; Q-033-5 milik BOT 3.
Tanpa kode/schema/migrasi di vonis ini.

Bukti live (origin/main 63027748, diverifikasi ulang run ini):
- Kelas (a) proyek + (c) invoice langsung: pendapatan `subtotal -
  discount` (project-pl.ts header + buildProjectPl revenue). Kelas (b)
  WO non-proyek: `billedAmount` = Σ `grandTotal` invoice
  (vehicle-margin-data.ts INVOICE_BRIDGE_SELECT memuat grandTotal,
  bukan subtotal/discount).
- `SalesInvoice` punya subtotal/discount/taxAmount/grandTotal terpisah
  (schema.prisma:1393-1399) — basis DPP tersedia tanpa migrasi.
- Header job-estimate-vs-actual.ts:14-17: "Bahan tidak dijumlahkan
  terpisah: bahan perintah produksi sudah masuk ProductionCost saat
  issue, dan menjumlahkan keduanya akan menghitung bahan dua kali."
- `MaterialIssue` punya projectId + workOrderId nullable
  (schema.prisma:2179-2180); jalur produksi masuk ProductionCost/
  totalActualCost lewat issueMaterial (production-cost.service.ts:1-16),
  sedangkan MI manual langsung ditangani onMaterialIssueCompleted
  (Dr Beban Material/Cr Persediaan) tanpa baris ProductionCost.

### Q-033-1 — basis pendapatan: SAMAKAN ke DPP (tanpa PPN)

Keputusan: SATU basis untuk margin kendaraan = pendapatan DPP
`subtotal - discount`, tanpa PPN. Kelas (b) wajib diubah ke basis itu.

Alasan: PPN keluaran bukan pendapatan — ia liabilitas (akun PPN
Keluaran 210201) yang disetor ke negara; memasukkan PPN ke
"pendapatan" kelas (b) menaikkan margin% baris kendaraan yang sama
secara sistematis dibanding kelas (a)/(c), sehingga perbandingan
antar baris dan marginPercent agregat tidak lagi sebanding. Definisi
akuntansi pendapatan = DPP, konsisten project-pl yang sudah jadi
sumber tunggal F-029.

Batas build (BOT 3, kartu terpisah):
1. Ubah HANYA loader `vehicle-margin-data.ts` kelas (b): select
   tambah `subtotal` + `discount`, billed per invoice =
   safeSubtract(subtotal, discount) sen-aman. Field sumber sudah ada;
   tanpa migrasi.
2. JANGAN ubah `job-billing-summary` / `BILLED_INVOICE_STATUSES`:
   "sudah ditagih" = grandTotal bruto adalah definisi piutang yang
   benar untuk sisa tagihan. Vonis ini hanya menyamakan basis
   MARGIN, bukan definisi tagihan.
3. Semantik field builder `VehicleMarginJobInput.billedAmount`
   berubah menjadi pendapatan DPP; perbarui komentar kontrak di
   `vehicle-margin.ts` header kelas (b) + `VehicleMarginJobInput`
   supaya tidak ada pembaca mengira bruto. Nama field boleh tetap
   (diff terkecil) asal komentar eksplisit "DPP subtotal-diskon".
4. Falsifikasi wajib (BOT 6): invoice DPP Rp100.000.000 + PPN 11%
   (grandTotal Rp111.000.000) di WO non-proyek -> revenue kendaraan
   Rp100.000.000, bukan 111.000.000; cabut pengurangan PPN (kembali
   grandTotal) -> tes MERAH. Tes vehicle-margin existing yang memakai
   billedAmount sebagai angka bebas tetap sah (builder tidak tahu
   sumbernya) — tes baru wajib di lapisan loader.

### Q-033-2 — MaterialIssue WO non-proyek: ProductionCost-only + penanda parsial

Keputusan: kelas (b) TETAP ProductionCost-only. DILARANG menambahkan
MaterialIssue ke biaya kelas (b).

Alasan: untuk WO ber-ProductionOrder, material sudah masuk
ProductionCost/totalActualCost saat issueMaterial (bukti header
job-estimate-vs-actual.ts:14-17 di atas). Menjumlahkan MaterialIssue
lagi = biaya material dobel, margin kendaraan terlalu rendah secara
diam-diam — cacat lebih berbahaya daripada kekurangan yang ditandai.

Sisa kekurangan yang nyata (diakui, ditangani dengan label, bukan
angka): MI manual `completed` yang tertaut langsung ke WO non-proyek
(workOrderId terisi, tanpa jalur ProductionOrder) membebankan GL lewat
onMaterialIssueCompleted tetapi tidak melahirkan ProductionCost,
sehingga tidak terlihat di kelas (b).

Batas build (BOT 3, kartu yang sama dengan Q-033-1):
1. Loader kelas (b): bila ada MaterialIssue `completed` ber-workOrderId
   pada WO non-proyek dalam cakupan, baris kendaraan ditandai parsial
   dengan penanda baru (usulan `hasUnlinkedMaterial: boolean` di
   VehicleMarginRow, pola `hasUnlinkedRevenue` existing). TIDAK
   dijumlahkan ke materialCost/productionCost.
2. UI (BOT 2) wajib menampilkan penanda itu sebagai "biaya material
   langsung belum termasuk" — bukan menyembunyikan, bukan mengira-ngira
   nominalnya dari MI (menghindari dobel jalur produksi).
3. Falsifikasi wajib: WO non-proyek dengan MI completed langsung ->
   hasUnlinkedMaterial true dan totalCost TIDAK berubah; hapus
   penanda -> tes MERAH. WO yang materialnya lewat ProductionOrder
   saja -> penanda false (jangan tandai parsial palsu bila MI tertaut
   itu sudah tercermin ProductionCost — bila loader tidak bisa
   membedakan, penanda berbunyi "ada pengeluaran material langsung,
   periksa rincian", bukan klaim nominal).

Catatan kejujuran batas: loader saat ini tidak punya tautan
MaterialIssue -> ProductionOrder, jadi penanda bersifat peringatan
keberadaan, bukan rekonsiliasi nominal. Rekonsiliasi nominal MI vs
ProductionCost per WO = pekerjaan terpisah bila dibutuhkan, bukan
syarat F-033.

### Q-033-4 — pemakaian margin: informatif saja, DILARANG jadi dasar harga/komisi/payroll

Keputusan: `profit` dan `marginPercent` kendaraan hanya boleh tampil
informatif dengan label verbatim "margin job kendaraan". DILARANG
dipakai sebagai dasar penetapan harga job berikutnya, dasar komisi,
dasar payroll/bonus, atau dasar jurnal — sampai vonis pemakaian baru
terbit.

Alasan: angka ini (1) belum memuat alokasi overhead tidak langsung,
(2) tidak dikurangi retur penjualan (BR-VEH-11: retur terpisah tidak
mengurangi agregat), (3) periode = tanggal dokumen sumber, bukan
penyelesaian job — biaya WO lintas periode ikut terbawa, dan (4)
sesudah Q-033-1 pun tetap read-model tanpa dimensi GL. Memakainya
untuk harga akan mengunci kesalahan cakupan menjadi keputusan uang.

Yang BOLEH: pertanyaan estimator ("job plat X rugi — buka rincian"),
penanda parsial, dan perbandingan internal antar kendaraan pada
periode yang sama sesudah basis DPP seragam (Q-033-1 selesai).

Syarat vonis pemakaian kelak (semua wajib): basis DPP seragam sudah
merged + retur masuk agregat atau dinyatakan eksplisit + dasar
alokasi overhead disetujui tertulis + rekonsiliasi ke GL per periode
uji. Tanpa itu, BR-VEH-10 tetap: baca informatif saja.

### Handoff F-033 vonis

- BOT 3: kartu loader kelas (b) basis DPP + penanda
  hasUnlinkedMaterial per batas build Q-033-1/Q-033-2 di atas;
  tanpa migrasi/schema; falsifikasi loader wajib.
- BOT 2: permukaan F-2026-10-22-001 boleh jalan sesudah Q-033-6
  diputus BOT 1; tampilkan label verbatim + penanda parsial +
  hasUnlinkedMaterial; dilarang hitung ulang dan dilarang memakai
  angka untuk harga/komisi (Q-033-4).
- BOT 6: acceptance tambah dua falsifikasi di atas (PPN 11% dan
  penanda material) ke draf acceptance spec F-033.
- BOT 1: Q-033-3/Q-033-6 tetap menunggu putusanmu; vonis ini tidak
  menahan tampilan informatif read-only.

---

## VONIS BOT 4 2026-10-22 — F-2026-10-22-044-V: Angka paparan kredit F-017 (komponen + ambang advisory, syarat gate)

Kartu: t_90328b72. Nomor: tabrakan F-042-V ditutup run ini — Q-SEWA
tetap F-2026-10-22-042-V (dirujuk PR #390/#393, selesai t_f0e26b31
PR #399); vonis ini F-2026-10-22-044-V. Dokumen vonis saja: tanpa
kode/schema/migrasi, tanpa jurnal baru, tanpa sentuh src/lib/tax/**.

Basis verifikasi live run ini (origin/main 602b803a):
- Builder existing buildCustomerCreditExposure
  (src/lib/reports/customer-receivables.ts, merged PR #283):
  paparan = outstanding + openOrderAmount; status unset|ok|
  warning(>=80)|over(>=100); limit <= 0 = unset "Limit belum
  diatur". Loader halaman piutang: invoice recognised
  posted/partial/paid, outstanding = grandTotal - paidAmount sen,
  K2 = max(0, SO.grandTotal - Sigma invoice recognised per SO),
  SO status confirmed/processing/completed. Buckets hanya dari
  invoice -> pelanggan SO-only/WO-only hilang.
- PR #334 OPEN 205ddbb4 (5/5): K3 pengurang DP confirmed +
  jepit >= 0 + agregat sen. BELUM merged: main masih tanpa
  pengurang DP (paparan overstatement untuk pelanggan ber-DP).
- PR #351 OPEN: inti hard gate F-017 DITUNDA (Lead, sejalan
  vonis BOT 4 2026-10-21 22:18 board).
- Spec BOT 5 F-2026-10-21-017-S selesai (t_e5e0ce2b, PR #396
  91b050bc): K1-K5, PaparanBersih = max(0, K1+K2+K5-K3-K4),
  AC-CR-01..15, BR-CR-01..10. Spec konsumen UI F-043-S selesai
  (t_35754cac, PR #398 14fc14a3): T1-T3 + eskalasi manusia.
- Schema: Customer.creditLimit Decimal(15,2) default 0
  (schema:325); CustomerCredit received/allocated/refunded +
  status open (schema:361-380; jurnal reklas 210102 nol-net,
  alokasi Dr 210102/Cr Piutang, refund Dr 210102/Cr Kas);
  DownPayment status default pending, confirmed = kas diterima
  (schema:1295-1315); WorkOrder tanpa nilai jual, nilai job =
  Quotation.grandTotal (schema:2605+; job-billing-summary.ts).
- BUKTI KUNCI jembatan DP: onDownPaymentConfirmed
  (down-payment.hook.ts) membuat WO+SO+Invoice sekaligus dan
  mengalokasikan DP ke SalesPayment -> paidAmount invoice
  (baris 209-253, 564-615). Artinya DP confirmed pada quotation
  yang sudah terkonversi SUDAH mengurangi K1 lewat paidAmount.
  Pengurang K3 global tanpa kaitan quotation MEN-DOBEL-kurangi
  porsi yang sama. Inilah putusan inti vonis ini (V2/V3).

### Putusan V1 — Status vonis

1. Lapis read-model advisory SAH dibangun per rumus V4 di bawah
   (mengikat BOT 3 kartu t_9b2fd1eb). Tidak ada jurnal baru,
   tidak ada tulis DB, tidak ada penahan dokumen.
2. BR-CR-05 spec (CustomerCredit pengurang) DIESAHKAN untuk
   lapis advisory dengan syarat V3. BR-CR-06 (K5 WO) DIESAHKAN
   untuk lapis advisory dengan pagar V3. Untuk INTI GATE kedua
   butir itu BELUM disahkan — lihat V7.
3. Inti gate blokir kredit TETAP DITUNDA SADAR (V7). Vonis ini
   bukan pembuka gate.

### Putusan V2 — Komponen paparan sah (masuk / tidak + alasan)

| Komponen | Putusan | Alasan akuntansi anti-dobel |
|---|---|---|
| K1 piutang outstanding (posted/partial/paid, outstanding>0) | MASUK, persis existing | Piutang recognised di GL (Dr Piutang/Cr Pendapatan saat posting). Satu-satunya komponen yang sudah jurnal. |
| K2 SO belum tertagih (confirmed/processing/completed, dikurangi invoice recognised per SO) | MASUK, persis existing | Komitmen tertagih masa depan, belum piutang. Pengurangan PER SO (bukan global) wajib dipertahankan: SO terinvoice penuh memberi K2=0. |
| K3 DP confirmed | MASUK SEBAGAI PENGURANG, DENGAN KOREKSI V3 | DP confirmed = kas diterima, kewajiban UMP 210102 (bukan pendapatan, vonis F-2026-10-20-03). Mengurangi risiko kas. TAPI alokasi DP ke invoice sudah menaikkan paidAmount -> K3 mentah global dobel-hitung (V3). |
| K4 CustomerCredit terbuka (status open, saldo per baris max(0, received-allocated-refunded)) | MASUK SEBAGAI PENGURANG (advisory), tampil terpisah | Dana pelanggan di tangan bengkel, liabilitas 210102; alokasi mengurangi piutang (Dr 210102/Cr Piutang). Bukan tagihan, bukan pendapatan. Sebagai pengurang = konsisten sisaEfektif job-billing. Pengurang hanya sejauh belum teralokasi: allocated sudah keluar dari saldo, jadi tidak dobel dengan pembayaran invoice. |
| K5 WO berjalan belum terwakili | MASUK (advisory) HANYA lewat jalur quotation tanpa SO dan tanpa invoice, persis V3 | Nilai jual belum tertagih yang belum masuk K1/K2. Bukan ProductionCost (biaya aktual bukan nilai jual — BR-CR-10 ditegaskan). WO quotationId null = 0 + bendera, DILARANG angka karangan. |
| DP pending / CustomerCredit non-open / invoice draft-approved-sent-cancelled / SO draft-cancelled / WO completed-closed-cancelled | TIDAK MASUK | Belum kas, belum recognised, atau sudah selesai: memasukkannya menaikkan paparan fiktif. Status dibaca persis, tanpa fallback menebak. |
| Overdue (subset K1 lewat dueDate) | BUKAN komponen tambah; penanda saja | Overdue sudah di dalam K1. Menambahkannya lagi = dobel-hitung murni. |

Urutan anti-dobel mengikat (satu nilai job tepat satu jalur):
invoice (K1) > SO (K2) > WO/quotation (K5); pengurang K3/K4
hanya mengurangi, tidak pernah menambah, dan dijepit lantai 0
pada PaparanBersih saja (bukan per komponen).

### Putusan V3 — Koreksi wajib atas rumus spec (mengikat BOT 3)

Spec F-017-S §2/AC-CR benar untuk K1/K2/K4/K5, tetapi K3
perlu koreksi sumber. BOT 3 dilarang mengimplementasikan
K3 = Sigma DownPayment confirmed per customerId mentah,
karena DP yang sudah teralokasi ke invoice (jalur hook DP)
sudah mengurangi K1 lewat paidAmount: paparan akan
ter-understate dan pelanggan over-limit bisa tampil aman.

Perlakuan sah (pilih SATU, BOT 3 nyatakan pilihan di kartu
t_9b2fd1eb sebelum kode):
- (a) K3-efektif = Sigma DP confirmed per pelanggan DIKURANGI
  porsi DP yang sudah teralokasi sebagai pembayaran invoice
  (jejak SalesPayment/paidAmount dari jalur DP, pola marker
  notes hook existing); atau
- (b) bila jejak alokasi per DP tidak dapat direkonstruksi
  murah, K3 dibatasi pada DP confirmed yang quotation-nya
  BELUM punya invoice recognised sama sekali (DP murni
  pra-tagihan), dan DP atas quotation terkonversi dianggap
  sudah tercermin di K1.
DEFAULT AMAN bila keduanya ragu: tampilkan K3 sebagai kolom
informatif terpisah TANPA mengurangi status (status dari
K1+K2+K5-K4), beri label "DP tampil informatif — pengurang
status menunggu rekonsiliasi alokasi". Understate status
lebih berbahaya daripada overstate advisory.

Untuk K5 hal serupa berlaku pada sisi quotation: K5 per
quotation = max(0, Quotation.grandTotal - Sigma invoice
recognised ber-quotationId - Sigma SO non-cancelled
ber-quotationId); WO memberi K5>0 hanya bila hasil per
quotation itu > 0 DAN belum ada SO. Dua WO pada quotation
sama TIDAK menggandakan K5 (hitung per quotation, bukan
per WO).

K4 tidak perlu koreksi serupa: saldo open sudah bersih dari
allocated/refunded menurut definisi barisnya.

### Putusan V4 — Rumus agregat read-model (final advisory)

- PaparanKasar = K1 + K2 + K5 (sen-aman, safeAdd pola existing)
- Pengurang = K3-efektif (V3) + K4
- PaparanBersih = max(0, PaparanKasar - Pengurang)
- utilization = creditLimit > 0 ? round2(PaparanBersih /
  creditLimit x 100) : null
- remainingCredit = creditLimit - PaparanBersih (BOLEH negatif,
  pola existing; jangan dijepit)
- Tanpa jurnal baru, tanpa tulis DB, satu builder murni dipakai
  laporan + titik tampil; UI tidak hitung ulang (F-043-S).

### Putusan V5 — Ambang status advisory (FINAL untuk lapis ini)

- creditLimit <= 0 (termasuk 0 default dan negatif data-rusak)
  -> status `unset`, utilization null, teks persis "Limit
  belum diatur". 0/unset BUKAN 0 keras, BUKAN tanpa limit,
  BUKAN blokir. (Menegaskan BR-CR-02; AC-CR-04 dipertahankan.)
- utilization >= 100 -> `over` "Lewat batas"
- utilization >= 80 -> `warning` "Mendekati batas"
- selain itu -> `ok` "Aman"
Ambang 80/100 ini VONIS BOT 4 untuk lapis advisory (bukan
sekadar konstanta existing): alasan — 80% menyisakan ruang
satu job bengkel menengah sebelum limit habis; mengubah ambang
kelak = perubahan vonis tertulis, bukan geser diam-diam di
builder/UI. Ambang berbasis persen SAJA (tanpa ambang nominal
kedua): nominal kedua akan memberi dua status bertentangan
untuk pelanggan limit kecil; pecahan sen mengikuti pembulatan
utilization 2 desimal existing (79,995 -> 80,00 = warning;
itulah perilaku builder existing, diterima sadar).
Tidak ada status yang menahan simpan/terbit/posting dokumen
di lapis ini; pengabaian peringatan tidak dicatat (belum ada
log override — syarat gate V7).

### Putusan V6 — Cakupan baris & titik tampil

- Baris pelanggan = gabungan pelanggan yang punya K1>0 ATAU
  K2>0 ATAU K5>0 ATAU (K3/K4>0 dan tampil di laporan); pelanggan
  SO-only/WO-only WAJIB tampil (menutup gap buckets existing).
  Pelanggan tanpa transaksi apa pun tidak tampil di laporan
  (AC-CR-11 dipertahankan); di master pelanggan tampil
  PaparanBersih 0 + status per limit-nya.
- Kolom K3 dan K4 tampil TERPISAH dari PaparanBersih (operator
  harus bisa rekonsiliasi: kasar - DP - kredit = bersih).
- Titik tampil T1/T2/T3 per spec F-043-S; T3 form hanya lencana
  advisory dari builder yang sama, tombol simpan tidak pernah
  di-disable oleh status kredit di lapis ini.

### Putusan V7 — Inti gate: TETAP DITUNDA SADAR + syarat buka

Gate penahan dokumen (tolak SO/Invoice/WO saat over) DITUNDA.
Buka gate hanya bila SEMUA syarat berikut terpenuhi sekaligus
dan vonis lanjutan BOT 4 terbit sesudahnya:
1. PUTUSAN BOT 1 tertulis membuka perubahan perilaku penahan
   dokumen (bukan sekadar merge builder).
2. PR #334 merged + implementasi K4/K5 (V3/V4) merged dan
   lulus acceptance BOT 6 termasuk falsifikasi pengurang —
   definisi paparan inti harus SAMA dengan yang terbukti di
   advisory; gate di atas rumus yang belum terbukti dilarang.
3. Rekonsiliasi K3-efektif (V3 pilihan a/b) terbukti dengan
   data alokasi DP nyata, bukan asumsi; bila hanya pilihan
   DEFAULT AMAN yang tersedia, paparan inti belum sah untuk
   gate.
4. Keputusan tertulis perlakuan limit unset untuk gate
   (usulan BOT 4: unset TIDAK memblokir, hanya peringatan
   keras tercatat — limit belum diatur adalah kekurangan
   master, bukan pelanggaran pelanggan).
5. Jalur override berizin: permission baru disetujui BOT 1,
   alasan wajib, log override teraudit (siapa/kapan/dokumen/
   paparan saat override), dan jurnal tidak berubah oleh
   override (override = izin operasional, bukan jurnal).
6. Titik penahan di server action (bukan UI saja) + tes
   falsifikasi: cabut penahan -> dokumen over tetap tersimpan
   = tes MERAH; periode terkunci tetap assertPeriodOpen.
7. Kebijakan dokumen berjalan: SO/WO lahir sebelum gate aktif
   tidak dibatalkan retroaktif; gate menilai dokumen BARU dan
   perubahan nilai dokumen berjalan secara eksplisit.
Selama syarat belum lengkap: larangan keras membangun flag
blokir parsial, disable tombol, atau validasi diam-diam di
action dengan dalih advisory.

### Yang TIDAK divonis di sini

- Jurnal apa pun dari paparan/status/override advisory: tidak
  ada. Paparan adalah bacaan risiko, bukan peristiwa akuntansi.
- Perubahan creditLimit menjadi wajib isi / ambang nominal
  absolut / notifikasi proaktif / snapshot historis paparan:
  di luar kartu ini (spec §7, YAGNI tercatat).
- Akun COA baru: tidak ada; K3/K4 menunjuk liabilitas UMP
  210102 existing lewat jurnal sumbernya masing-masing.

### Handoff F-2026-10-22-044-V

- BOT 5 (spec F-017-S PR #396 + F-043-S PR #398): vonis angka
  terbit — BR-CR-05/06 disahkan advisory dengan V3; tidak ada
  angka yang perlu ditebak lagi. Perbarui label BR-CR-05 dari
  USULAN menjadi VONIS-044-V bila menyentuh spec lagi.
- BOT 3 (kartu t_9b2fd1eb): bangun per V2-V6; nyatakan pilihan
  K3-efektif (a)/(b)/DEFAULT di kartu SEBELUM kode; PR #334
  merged dulu; status enum jangan digeser; tanpa N+1.
- BOT 6 (kartu t_7417e4d1): AC-CR-01..15 spec + tambahan
  falsifikasi vonis ini: (i) DP confirmed yang sudah teralokasi
  ke invoice TIDAK mengurangi dua kali (fixture DP->invoice
  paidAmount, PaparanBersih tidak understated); (ii) cabut
  jepit lantai 0 -> AC-CR-03 MERAH; (iii) K4 baris non-open
  ikut -> AC-CR-10 MERAH; (iv) dokumen over tetap tersimpan
  (advisory murni). Gate jangan dinilai — DITUNDA V7.
- BOT 2: T2/T3 sesudah kontrak builder BOT 3 final; teks status
  verbatim V5; tidak hitung ulang.
- BOT 1: merge PR #334 + PR vonis ini bila gate hijau; PUTUSAN
  gate hanya lewat jalur V7.
---

## 2026-10-22 01:12 WIB — Spec kontrak bisnis F-2026-10-21-033 (margin per kendaraan, BOT 5, tanpa kode)

Sifat: kontrak bisnis penutup F-033. Bukan F-ID baru — F-033 tetap ID
fitur. Handoff implementasi susulan memakai F-2026-10-22-001 di bawah.

### Status prasyarat (TERVERIFIKASI-KODE, origin/main 6bf76702)
- Builder F-029 TERGABUNG: `src/lib/reports/project-pl.ts` +
  `project-pl-data.ts` (PR #293); halaman L/R proyek memakai builder
  (PR #299). Guliran F-033 SUDAH TERGABUNG: `vehicle-margin.ts` +
  `vehicle-margin-data.ts` (PR #305 MERGED 2026-10-21T10:39:22Z,
  `loadVehicleMarginReport`) + tes builder/loader. Yang BELUM ada:
  permukaan UI/ekspor yang mengonsumsi loader itu (grep
  `loadVehicleMarginReport` di luar reports+tes = 0) → F-2026-10-22-001.
- Kunci guliran `customerVehicleId` (BUKAN plat teks): Project
  `schema.prisma:3717`, WorkOrder `:2602`, SalesInvoice `:1374`
  (FK polos tanpa relasi — loader ambil plat via query massal
  terpisah), Quotation `:1195`. Plat = label tampil saja.
- MaterialIssue `schema.prisma:2168` TIDAK punya customerVehicleId —
  biaya kendaraan hanya sah lewat projectId/WO tertaut. ProductionCost
  `:2559` sama: lewat workOrderId/productionOrderId.

### Kontrak agregat per kendaraan (satu baris per customerVehicleId)
Tiga kelas sumber, TIDAK dicampur tanpa jejak (sesuai implementasi
PR #305, diverifikasi header vehicle-margin.ts:1-40):
- (a) Proyek ber-kendaraan: seluruh hasil `buildProjectPl` proyek itu
  masuk apa adanya. Pendapatan = Σ(subtotal − discount) invoice
  status posted/partial/paid, deletedAt null, dedup per invoice id
  lewat DUA jembatan: projectId langsung + quotation WO proyek;
  invoice ber-projectId proyek lain tidak dipinjam. Biaya =
  MaterialIssue completed (projectId langsung atau WO proyek, dedup
  per MI id, nilai Σ qty×cost) + ProductionCost.amount WO proyek
  (termasuk labor pull-timesheet & cerminan subkontrak PO jasa) +
  Expense approved + PettyCash OUT + VendorBill
  confirmed/posted/partial/paid BER-projectId SESUDAH saringan
  anti-dobel (VendorBill yang purchaseOrderId-nya sudah tercermin
  sebagai ProductionCost dikeluarkan).
- (b) WO non-proyek (projectId null) ber-kendaraan: billed = Σ
  grandTotal invoice posted/partial/paid belum terhapus via jembatan
  quotation→SalesOrder/quotation langsung (dedup per id; invoice
  ber-projectId dikeluarkan — milik ember (a)); biaya = Σ
  ProductionCost.amount terikat WO atau lewat ProductionOrder-nya.
  MaterialIssue WO non-proyek TIDAK ikut kelas ini (lihat Q-033-2).
- (c) Invoice langsung ber-kendaraan tanpa jembatan apa pun
  (quotationId/salesOrderId/projectId semua null): pendapatan
  subtotal−discount saja, biaya 0, dihitung `directInvoiceCount`,
  baris tertanda `hasUnlinkedRevenue` = margin PARSIAL, bukan margin
  penuh. Dilarang menampilkan kelas (c) seolah margin job lengkap.

Aturan turunan (wajib di permukaan apa pun):
- profit kendaraan = revenue − totalCost dari AGREGAT kendaraan;
  marginPercent = profit/revenue×100 dari agregat (revenue 0 → 0).
  DILARANG merata-ratakan marginPercent per proyek/WO.
- Baris terurut profit menurun; ember Tanpa kendaraan selalu terakhir.
- Total semua ember WAJIB rekonsiliasi ke total sumber per kelas;
  selisih = cacat, bukan dibulatkan hilang (sen-aman via safeSum/
  safeSubtract/safeRound existing).

### Register aturan bisnis
| ID | Aturan | Label |
|---|---|---|
| BR-VEH-01 | Kunci guliran = customerVehicleId; plat hanya label | TERVERIFIKASI-KODE (schema+PR #305) |
| BR-VEH-02 | Pendapatan proyek & invoice langsung = subtotal−discount, tanpa pajak, status posted/partial/paid, non-cancelled, belum terhapus | TERVERIFIKASI-KODE (project-pl.ts PROJECT_PL_INVOICE_STATUSES) |
| BR-VEH-03 | Pendapatan WO non-proyek = grandTotal (TERMASUK pajak) per definisi job-billing existing | TERVERIFIKASI-KODE (BILLED_INVOICE_STATUSES + vehicle-margin-data) — konsistensi antar kelas = Q-033-4 BUTUH-VONIS BOT 4 |
| BR-VEH-04 | Biaya sah hanya dari MaterialIssue completed / ProductionCost.amount / Expense approved / PettyCash OUT / VendorBill tersaring anti-dobel; angka bebas form project BUKAN biaya | TERVERIFIKASI-KODE (project-pl.ts) |
| BR-VEH-05 | Estimasi (quotation/ProjectItem) tidak pernah masuk agregat aktual | TERVERIFIKASI-KODE (builder hanya baca dokumen aktual) |
| BR-VEH-06 | Label tampil wajib persis "margin job kendaraan" (VEHICLE_MARGIN_LABEL) — BUKAN laba akuntansi; tanpa alokasi overhead, tanpa jurnal, tanpa dimensi GL | TERVERIFIKASI-KODE (vehicle-margin.ts) + USULAN penempelan di UI (F-2026-10-22-001) |
| BR-VEH-07 | Timesheet belum ditarik = memo JAM saja (unpulledTimesheetHours), tanpa rupiah ditebak, tidak mengurangi margin | TERVERIFIKASI-KODE (project-pl.ts) |
| BR-VEH-08 | Invoice tanpa kendaraan / WO tanpa kendaraan / proyek tanpa kendaraan masuk ember eksplisit "Tanpa kendaraan" dan tetap dihitung di total — tidak dibuang, tidak ditebak kendaraannya | TERVERIFIKASI-KODE (bucket null PR #305) |
| BR-VEH-09 | Kendaraan sama plat di pelanggan berbeda = baris berbeda | TERVERIFIKASI-KODE (tes vehicle-margin.test.ts) |
| BR-VEH-10 | Angka margin kendaraan TIDAK dipakai sebagai dasar harga/komisi/payroll sebelum vonis pemakaian | USULAN — pemakaian uang = BUTUH-VONIS BOT 4 |
| BR-VEH-11 | Retur/pembatalan: cancelled & deletedAt tidak pernah dihitung; invoice retur terpisah tidak mengurangi agregat kecuali dokumen sumbernya berubah status | TERVERIFIKASI-KODE (saringan builder) — perlakuan retur penjualan terpisah = di luar F-033 |

Tidak ada aturan di atas ditegaskan tanpa label. Tidak ada persentase
DP, ambang margin, atau angka statutori di spec ini.

### Perlakuan kasus khusus
- WO multi-kendaraan: TIDAK ADA di skema — WorkOrder.customerVehicleId
  tunggal nullable (`schema.prisma:2602`). WO yang melayani >1
  kendaraan secara bisnis TIDAK didukung model; JANGAN dibagi rata /
  dibagi proporsional oleh UI atau builder (itu angka karangan).
  Perlakuan sah saat ini: kendaraan utama WO menanggung seluruh job;
  kebutuhan nyata multi-kendaraan = Q-033-3 BUTUH-VONIS BOT 1
  (inti model, migrasi, di luar F-033).
- Satu quotation/invoice dipakai banyak WO (jembatan bersama):
  atribusi ke WO PERTAMA urut (date, documentNo) — deterministik,
  TERVERIFIKASI-KODE loader vehicle-margin-data (pola
  job-estimate-vs-actual). Invoice TIDAK dihitung sekali per WO.
- Invoice ber-ProjectId + jembatan quotation proyek sama: dedup per
  id, dihitung SATU kali di ember proyek.
- Invoice tanpa kendaraan sama sekali: masuk ember Tanpa kendaraan
  lewat kelas sumbernya (proyek/WO/invoice langsung tanpa kendaraan),
  tetap tampil dan terhitung total.
- Biaya WO non-proyek selain ProductionCost (MaterialIssue langsung,
  Expense tanpa projectId): TIDAK teratribusi kendaraan di F-033 —
  tampil hanya di L/R proyek bila ber-projectId; di margin kendaraan
  kelas (b) absen. Lihat Q-033-2.

### Periode pengakuan
- Periode = tanggal DOKUMEN sumber (invoice/MaterialIssue/Expense/
  PettyCash/VendorBill/WO `date` dalam rentang), pola
  loadProjectPlReport existing — BUKAN tanggal bayar, bukan tanggal
  selesai job. TERVERIFIKASI-KODE (dateWhere project-pl-data).
- ProductionCost TANPA saringan tanggal sendiri di loader F-029:
  ikut bila WO-nya jembatan proyek aktif periode itu. Konsekuensi:
  margin kendaraan satu periode dapat memuat biaya WO lintas periode.
  Dipertahankan apa adanya di F-033 (konsisten builder tunggal);
  ubah = ubah F-029 untuk semua konsumen, Q-033-5.
- Pengakuan pendapatan mengikuti status dokumen (posted+), BUKAN kas
  diterima. Dokumen draft/sent/approved belum pendapatan. Ini aturan
  read-model existing, BUKAN vonis akuntansi baru.

### Role/permission matrix (permukaan F-2026-10-22-001)
| Aksi | Permission | Bukti |
|---|---|---|
| Lihat kartu/halaman margin kendaraan | `view_reports` | TERVERIFIKASI-KODE pola halaman laba-rugi-proyek page.tsx:23 + navigation.ts:243 |
| Ekspor margin kendaraan | jalur registry ekspor existing, permission sama | USULAN (ikuti pola report-registry laba-rugi-proyek) |
| Ubah data sumber dari layar margin | TIDAK ADA — read-only | USULAN (konsisten semua read-model reports) |
Selain `view_reports`, tidak ada permission baru diusulkan. Data ini
bukan data gaji/pribadi — scope HR tidak berlaku.

### Draf acceptance
BOT 3 (builder — verifikasi, bukan bangun ulang; builder sudah merged):
1. Fixture 2 proyek kendaraan sama + 1 WO non-proyek kendaraan sama:
   baris kendaraan = jumlah persis output buildProjectPl + billed/
   ProductionCost WO; marginPercent dari agregat (bukan rata-rata).
2. Invoice muncul di jembatan langsung + quotation: terhitung 1x.
   Invoice ber-projectId lain tidak dipinjam WO non-proyek.
3. Invoice langsung saja: directInvoiceCount>0, hasUnlinkedRevenue
   true, biaya 0. Ember Tanpa kendaraan ada dan total rekonsiliasi.
4. Falsifikasi: samakan dua kendaraan berplat sama beda pelanggan →
   tetap 2 baris; hapus dedup → tes no.2 MERAH.
BOT 2 (kartu UI, F-2026-10-22-001):
1. Kartu menempel label persis "margin job kendaraan" + caption
   periode dari loader; angka = output loader apa adanya, UI tidak
   menghitung ulang, tidak merata-ratakan persen.
2. Baris hasUnlinkedRevenue tampil tertanda parsial; ember Tanpa
   kendaraan tampil terakhir berlabel eksplisit, tidak disembunyikan.
3. Rincian material/production/other per baris tampil dari field
   loader; tanpa tombol ubah/jurnal/bayar dari layar ini.
BOT 6 (audit):
1. Rekonsiliasi: total loader = Σ kelas (a)+(b)+(c) per periode
   fixture; cancelled/deletedAt/draft tidak ikut di kelas mana pun.
2. Timesheet belum ditarik tidak mengurangi margin (memo jam saja,
   di permukaan proyek); ProductionCost hasil pull tidak dobel
   dengan MaterialIssue sumber yang sama — verifikasi rantai
   pull existing, bukan asumsi builder.
3. Permission: tanpa view_reports halaman/kartu tertolak; tidak ada
   nominal gaji/pribadi di payload margin.

### Pertanyaan terbuka (eksplisit)
- Q-033-1 → BOT 4 (BUTUH-VONIS): dua definisi pendapatan hidup
  berdampingan — proyek/invoice-langsung subtotal−discount (tanpa
  pajak) vs WO non-proyek grandTotal (termasuk pajak). Satu baris
  kendaraan bisa mencampur keduanya. Samakan (pilih satu, ubah
  builder asal) atau tampilkan penanda definisi per kelas? Spec ini
  TIDAK menyamakan sendiri — angka uang bukan milik BOT 5.
- Q-033-2 → BOT 4 + BOT 3 (BUTUH-VONIS/USULAN): MaterialIssue WO
  non-proyek tidak masuk margin kendaraan kelas (b). Masukkan
  (samakan kelas proyek) atau biarkan ProductionCost-only dengan
  label parsial seperti kelas (c)?
- Q-033-3 → BOT 1 (BUTUH-VONIS): WO multi-kendaraan tidak didukung
  skema. Tetap kendaraan-tunggal (status quo spec ini) atau buka
  inti model relasi WO↔kendaraan jamak? Di luar F-033 sampai diputus.
- Q-033-4 → BOT 4: marginPercent agregat & profit kendaraan boleh
  dipakai untuk keputusan harga job berikutnya? Sampai vonis: baca
  informatif saja (BR-VEH-10).
- Q-033-5 → BOT 3 (USULAN): ProductionCost tanpa saringan tanggal
  menembus periode. Pertahankan (konsistensi F-029) atau saring per
  tanggal WO? Mengubah ini mengubah SEMUA konsumen F-029.
- Q-033-6 → BOT 1: permukaan F-2026-10-22-001 sebagai halaman
  /laporan/margin-kendaraan sendiri atau kartu di halaman kendaraan
  pelanggan existing? Spec menyerahkan bentuk ke BOT 2 sesudah
  putusan tempat ini.

#### F-2026-10-22-001 (j) P2 — Permukaan margin job kendaraan (UI + ekspor) sesudah kontrak F-033
- Status Silengkap: PARSIAL. Bukti: loader `loadVehicleMarginReport`
  merged PR #305 tanpa konsumen UI/ekspor (grep di luar reports=0).
- Adaptasi: halaman/kartu read-only memakai loader apa adanya +
  label VEHICLE_MARGIN_LABEL + penanda parsial/ember Tanpa kendaraan
  per acceptance BOT 2 di spec F-033 atas; ekspor lewat registry
  existing. TANPA builder kedua, tanpa hitung ulang di UI.
- Modul disentuh: halaman laporan/kendaraan (frontend), report
  registry/catalog/navigation (permission view_reports existing).
- Effort: S. Risiko: label terbaca laba akuntansi — mitigasi label
  verbatim + caption bukan-laba. Pemilik: BOT 2 (UI), BOT 3 verifikasi
  loader, BOT 6 audit. Butuh putusan accountant: YA untuk Q-033-1/2/4
  SEBELUM angka ditampilkan sebagai dasar keputusan; tampilan
  informatif read-only boleh jalan tanpa menunggu itu.

### Yang TIDAK diusulkan run ini
- Builder margin kedua / jalur nilai kendaraan terpisah dari F-029:
  dilarang kontrak F-033 (sumber nilai tunggal).
- Alokasi overhead/gaji tidak langsung ke kendaraan: tanpa dasar
  alokasi yang disetujui = angka karangan; BUTUH-VONIS BOT 4 dulu.
- Relasi WO multi-kendaraan: inti model, Q-033-3, bukan diam-diam
  dibagi rata.

---
## 2026-10-22 01:11 WIB — Spec F-2026-10-21-031 earned value sederhana (Bot 5, tanpa kode)

Spec lengkap: komentar kartu t_983f6b86 #184 (BR-031-01..11, gerbang
G1–G3, kasus A1–A4). Ringkasan putusan:

- Status: LAYAK-BERSYARAT, implementasi DITUNDA. Basis terverifikasi:
  rerata persen sama rata live (proyek/[slug]/page.tsx:109-119,
  project-stages.tsx:71-80); ProjectStageProgress.percentage ada
  (schema:3753-3766); ProjectStage tanpa tanggal rencana per tahap
  (schema:3733-3751); WorkOrderOperation absen di main (F-020 baru spec).
- Koreksi istilah wajib: CPI hanya level proyek (EV / realizedTotal
  F-029/F-030; AC per tahap tidak ada selama BR-09 F-030 ditunda);
  SPI klasik ditolak — pengganti "SPIw basis waktu proyek"
  (EV / (totalBudget × fraksi waktu startDate→endDate)), label wajib
  berkualifikasi, absen (null) bila tanggal proyek absen.
- Bobot tahap = anggaran tahap RAB terkunci / totalBudget dari output
  buildProjectBudget PR #370 (head 2fbdc5f8, BOT 6 PASS, BELUM merged);
  tahap tanpa anggaran bobot 0 berlabel, dilarang bagi rata; RAB belum
  terkunci = blok EV absen. Label overrun/tertinggal informatif saja,
  penonton view_projects existing.
- Ditolak eksplisit: Gantt/jadwal tahap baru, jurnal EV ke GL, kurva S /
  hitung ulang historis, CPI/SPI per tahap, blokir dokumen berdasar EV.
- Gerbang buka: G1 PR #370 merged; G2 bukti pemakaian RAB terkunci
  (ambang USULAN ≥3 proyek terkunci + ≥1 revisi, atau ≥4 minggu UI RAB
  live — angka final BUTUH-VONIS Lead); G3 UI RAB F-030 live. Pemilik
  berikut: BOT 3 builder, BOT 2 UI, BOT 6 acceptance A1–A4.
- Butuh putusan accountant: TIDAK untuk fase read-only ini; vonis baru
  wajib bila EV kelak dipakai penagihan/termin (fase ini tidak).


---

## SPEC BOT 5 2026-10-22 — F-2026-10-22-045-S aturan reservasi stok per WO/gudang (inti F-2026-10-21-012)

Pemilik spec: BOT 5 (sales-crm-hr-payroll-business-workflow). Dokumen spec
saja, tanpa kode/schema/migrasi. Membuka lapis aman BOT 3 (ATP per gudang
sudah ada di builder, lihat verifikasi) lalu inti `StockReservation`
sesudah Lead membuka inti. Label bukti wajib di tiap aturan:
TERVERIFIKASI-KODE / BENCHMARK / USULAN / BUTUH-VONIS.

Benchmark resmi (akses 2026-10-22):
- Accurate Pemenuhan Pesanan — ketersediaan vs pesanan, per gudang,
  pengiriman sebagian: https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pemenuhan-pesanan/membuat-pemenuhan-barang-sesuai-pesanan/
  dan https://accurate.id/online/fitur/persediaan/
- Zahir Order Penjualan — administratif, belum mengurangi stok sampai
  pengiriman/invoice; gudang per transaksi (multi-warehouse):
  https://help.zahironline.com/portal/id/kb/articles/order-penjualan
  dan https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang

### 0. Verifikasi live origin/main 8f621ea0 (2026-10-22, run ini)

Sudah ada (TERVERIFIKASI-KODE):
- Builder kebutuhan material WO: `src/lib/reports/work-order-material-needs.ts`
  header baris 1-52 menyatakan ATP read-only, BUKAN reservasi mengikat;
  field `qtyOnHandAtWarehouse` + `warehouseShortageQty` (F-012 lapis aman)
  sudah di builder. Loader `work-order-material-needs-data.ts`: gudang
  relevan per item = gudang MI `completed` WO ini ∪ `Item.defaultWarehouseId`;
  stok per gudang dari `InventoryLayer.remaining`; `committedOtherQty` =
  sisa kebutuhan WO aktif lain (`ACTIVE_WORK_ORDER_STATUSES` =
  draft/pending/in_progress, `work-order-queue.ts:25`).
- `grep StockReservation` di src/prisma = 0 model/field (hanya sebutan di
  komentar/docs). Reservasi mengikat ABSEN.
- WorkOrder: status string draft/pending/in_progress/completed/cancelled
  (`src/lib/constants/status.ts:40-46`) + closed/reopen (F-2026-10-21-009-V,
  schema WorkOrder closedAt/closedBy). TIDAK ada aksi cancel WO di
  `manufacturing.actions.ts` — hanya `deleteWorkOrder` (draft/pending
  saja), `startWorkOrder` (pending/draft → in_progress, klaim atomik
  updateMany + inisialisasi tahap satu tx, `manufacturing.actions.ts:1390`),
  `completeWorkOrder` (in_progress/pending → completed, wajib MI completed,
  `:1476`), `closeWorkOrder`/`reopenWorkOrder` (`:2260/:2315`).
  "WO cancel" di backlog F-012 = status cancelled yang belum punya aksi
  lahir — spec ini menetapkannya (BR-RES-11).
- MaterialIssue: `warehouseId` wajib di header (schema:2174-2196);
  `createMaterialIssueFromWorkOrder(workOrderId, warehouseId)` dipilih
  pembuat + `assertWarehouseAccess` (`manufacturing.actions.ts:1681`);
  satu MI per WO (guard existingMi). Konsumsi stok hanya saat MI completed
  via `onMaterialIssueCompleted` → `consumeFifoLayers(tx,{itemId,
  warehouseId: issue.warehouseId, qty, documentDate: issue.date})`
  (`material-issue.hook.ts`), shortfall ditoleransi hook MI (fallback cost
  master) — bedakan dari guard stok negatif jalur penjualan.
- FIFO per gudang: `availableQty(tx,itemId,warehouseId)` jumlah
  `InventoryLayer.remaining` per (item,warehouse) (`inventory-fifo.ts:39-60`).
  `Item.qtyOnHand` = total global semua gudang.
- WorkOrder TIDAK punya warehouseId. `Item.defaultWarehouseId` nullable
  (schema Item). Gudang WO hari ini hanya tersirat dari MI.
- Izin nyata (`module-catalog.generated.ts:224-257`): view/create/edit/
  delete_material_issues, view/create/edit/delete/complete_work_orders.
  TIDAK ada izin reservasi khusus. Cakupan gudang per user:
  `getWarehouseScope`/`assertWarehouseAccess` (`warehouse-scope.ts`;
  role semua-gudang di `role-names.ts`).

Belum ada: model reservasi, expiresAt, lepas otomatis, prioritas antar WO,
kata UI status reservasi. Semua di bawah = USULAN kecuali ditandai lain.

### 1. Workflow specification

Aktor: Admin/Perencana bengkel (membuat WO), Kepala Bengkel (memulai WO,
menyetujui lepas manual), Petugas Gudang (membuat/menyelesaikan MI),
Sistem (lepas otomatis kedaluwarsa/selesai/batal).

Dokumen masuk: WorkOrder + WorkOrderItem (qty kebutuhan per item,
itemId>0 saja; baris jasa itemId=0 tanpa kebutuhan stok), Item +
defaultWarehouseId, InventoryLayer per gudang, MaterialIssue.
Dokumen keluar: baris StockReservation (inti), status ATP per gudang di
kartu kebutuhan material WO (lapis aman, sudah ada), peringatan UI.

Alur inti (USULAN, sesudah Lead buka inti):
S0 WO draft/pending: TIDAK ada reservasi. Kartu kebutuhan material hanya
menampilkan ATP peringatan (perilaku existing, jangan diubah maknanya).
S1 `startWorkOrder` menang klaim (pending/draft → in_progress): dalam
transaksi yang sama, lahir satu StockReservation per (item stok,
gudang sumber) dengan qty = sisa kebutuhan baris WO (qty − sudah
ter-issue completed) pada saat start. Start TIDAK diblokir kekurangan
stok (BR-RES-07) — baris yang tak tertutup lahir sebagai reservasi
parsial + penanda kekurangan, bukan gagal start.
S2 MaterialIssue completed untuk WO itu: konsumsi mengurangi reservasi
aktif WO pemilik dulu sampai habis (consumed), lalu kelebihan dicatat
tanpa menyentuh reservasi WO lain (BR-RES-08). Reservasi WO lain tidak
pernah dikonsumsi oleh MI WO lain.
S3 WO completed/closed: sisa reservasi aktif WO itu → released otomatis
dalam transaksi penyelesaian yang sama.
S4 WO dibatalkan (aksi baru BR-RES-11) atau WO dihapus sebelum start:
reservasi belum lahir (lahir hanya di start) — tidak ada yang dilepas;
WO in_progress yang dibatalkan → semua sisa aktif → released.
S5 Kedaluwarsa: reservasi aktif melewati expiresAt → expired oleh
pekerjaan terjadwal/idempoten saat dibaca (lazy-expire di loader +
tugas berkala), stoknya kembali tersedia untuk ATP WO lain; WO pemilik
melihat penanda "reservasi kedaluwarsa" dan boleh reservasi ulang manual
(BR-RES-06) selama WO masih in_progress.

### 2. Keputusan eksplisit (a)-(g)

(a) Kapan lahir + gudang sumber + qty (USULAN):
- Lahir HANYA di `startWorkOrder` (transaksi klaim start yang sama),
  BUKAN di WO approved/pending. Alasan: pending/draft belum mengikat bay
  dan kendaraan; reservasi lebih awal mengunci stok untuk job yang belum
  tentu jalan (risiko reservasi menggantung yang sudah diingatkan
  backlog F-012). WO pending tetap dilayani ATP peringatan existing.
- Gudang sumber per baris, urutan putus: (1) gudang MaterialIssue WO ini
  bila MI sudah ada (warehouseId MI — tempat material benar-benar
  keluar); (2) `Item.defaultWarehouseId`; (3) bila keduanya kosong:
  baris TIDAK direservasi, ditandai "gudang belum ditentukan" di kartu
  kebutuhan (jangan tebak gudang pertama/sembarang). Gudang disimpan
  eksplisit di baris reservasi saat lahir; perubahan defaultWarehouseId
  item sesudahnya TIDAK memindahkan reservasi berjalan.
- Qty per baris = sisa kebutuhan WorkOrderItem non-replaced itemId>0:
  qty baris − qty MI completed tertaut baris itu (workOrderItemId).
  Sumber qty = baris WO (yang berasal dari BOM/quotation/manual saat WO
  dibuat) — spec ini TIDAK membuat sumber qty kedua; revisi baris WO
  (jalur revisi existing) menyesuaikan reservasi aktif: tambah bila qty
  naik (sebatas tersedia, sisanya penanda kekurangan), kurangi/lepas
  selisih bila qty turun atau baris diganti (replaced).

(b) Siapa boleh buat/lepas manual (USULAN, pakai izin existing):
- Reservasi lahir otomatis oleh sistem di start — bukan aksi manual.
- Reservasi ulang sesudah kedaluwarsa + tambah reservasi manual untuk
  baris tanpa reservasi: `edit_work_orders` DAN akses gudang sumber
  (`assertWarehouseAccess`). Tanpa izin/gudang di luar cakupan = ditolak
  server, bukan tombol disembunyikan saja.
- Lepas manual (membebaskan stok untuk WO lain sebelum WO selesai):
  `complete_work_orders` (peran kepala bengkel/setara penjaga selesai)
  + wajib alasan teks; tercatat siapa/kapan/alasan (jejak audit di
  ActivityLog pola existing). Petugas gudang (izin material_issues saja)
  TIDAK boleh lepas manual — ia mengonsumsi lewat MI completed.
- Tidak ada izin katalog baru di spec ini; bila Lead ingin izin khusus
  `release_stock_reservations`, itu penambahan katalog terpisah
  (BUTUH-VONIS Lead, bukan syarat inti).

(c) expiresAt (USULAN): default = startDate WO + 14 hari kalender, atau
endDate WO bila endDate lebih awal dari itu (pakai yang lebih awal);
bila endDate kosong pakai +14 hari. Nilai 14 hari = USULAN Bot 5, belum
disetujui pemilik proses — jadikan konstanta bernama satu tempat yang
mudah diganti setting, jangan sebar angka. Perilaku kedaluwarsa: status
→ expired, stok bebas lagi untuk ATP/reservasi WO lain, WO pemilik
menampilkan peringatan persis §(g) dan tombol reservasi ulang (b).
Kedaluwarsa TIDAK membatalkan WO dan TIDAK memblokir MI berikutnya —
MI completed tetap boleh jalan (BR-RES-08 jalur tanpa reservasi).

(d) Tumpang tindih dua WO, item+gudang sama (USULAN):
- Prioritas = urutan start yang menang (first-started, first-reserved),
  BUKAN tenggat endDate. Alasan: endDate bisa kosong/geser dan kendaraan
  yang sudah dibongkar (WO yang sudah start) secara fisik sudah memakai
  bay; menggeser stoknya ke WO bertenggat lebih awal yang belum mulai
  justru memblokir bay. Tenggat hanya tampil sebagai informasi di kartu,
  bukan penentu.
- WO kedua yang start saat stok gudang tak menutup sisa kebutuhannya:
  start TETAP jalan (tidak diblokir), reservasinya parsial sebatas sisa
  tersedia (bisa 0), baris ditandai kekurangan persis seperti ATP
  existing. Blokir start = BUTUH-VONIS Lead/pemilik proses (mengubah
  perilaku startWorkOrder existing yang hari ini tak pernah menolak
  karena stok) — spec ini merekomendasikan peringatan keras, bukan
  blokir, sampai pemilik proses menyatakan job boleh ditolak mulai
  karena part.

(e) Konsumsi MI melebihi reservasi / tanpa reservasi (USULAN):
- MI completed qty ≤ sisa reservasi aktif WO pemilik+gudang MI: reservasi
  berkurang sejumlah itu; habis → consumed.
- MI qty > sisa reservasi: kelebihan TETAP keluar mengikuti perilaku
  FIFO existing (hook MI hari ini menoleransi shortfall lapisan);
  reservasi pemilik habis (consumed), kelebihan dicatat sebagai
  "keluar tanpa cadangan" di kartu kebutuhan — JANGAN ambil reservasi
  WO lain, JANGAN tolak MI completed karenanya (menolak = mengubah
  guard MI existing, perlu vonis terpisah).
- Item/WO tanpa reservasi sama sekali (kedaluwarsa, gudang belum
  ditentukan, WO belum start tapi MI manual tertaut): MI berjalan
  seperti hari ini; tidak ada reservasi negatif lahir.
- MI dari gudang berbeda dari gudang reservasi: konsumsi mengurangi
  reservasi hanya bila gudang sama; gudang beda = jalur tanpa cadangan
  untuk porsi itu + peringatan beda gudang di kartu (stok fisik memang
  keluar dari gudang lain).

(f) Batal/sebagian (USULAN): WO in_progress dibatalkan → semua sisa
aktif released proporsional penuh per baris (yang sudah consumed tetap
consumed, riwayat tak diubah). Penyelesaian sebagian tidak ada sebagai
status WO (completed = seluruh WO) — "sebagian" terjadi per baris:
baris WO selesai/diganti/qty turun → sisa reservasi baris itu released
sejumlah selisih belum terpakai. WO completed dengan sisa tak terpakai
→ released otomatis (S3). WO closed/reopen tidak menghidupkan lagi
reservasi yang sudah released/expired; reopen completed → tidak ada
reservasi baru otomatis.

(g) Kata UI Indonesia persis (USULAN — BOT 2 pakai verbatim, jangan
parafrase):
- active → "Terreservasi"
- consumed (habis terpakai) → "Terpakai Habis"
- consumed sebagian (masih ada sisa aktif) → tetap "Terreservasi"
  dengan teks pendamping "terpakai {qtyTerpakai} dari {qtyAwal}"
- released → "Dilepas"
- expired → "Kedaluwarsa — reservasi ulang bila masih dibutuhkan"
- baris tanpa reservasi karena gudang belum ditentukan →
  "Belum direservasi — gudang belum ditentukan"
- kekurangan saat start/kedaluwarsa WO lain mengikat stok →
  "Stok gudang ini sudah terreservasi untuk perintah kerja lain"
- keluar tanpa cadangan → "Keluar tanpa cadangan reservasi"
Status mentah Inggris (active/released/consumed/expired) TIDAK tampil
ke pengguna; hanya label Indonesia di atas.

### 3. Role/permission matrix (izin nyata, TERVERIFIKASI-KODE namanya)

| Aksi | Admin/Perencana | Kepala Bengkel | Petugas Gudang | Sistem |
|---|---|---|---|---|
| Lihat kartu kebutuhan+reservasi WO | view_work_orders | view_work_orders | view_work_orders (+gudang dlm scope) | — |
| Start WO (reservasi lahir) | edit_work_orders | edit_work_orders | — | lahirkan baris |
| Reservasi ulang/manual | edit_work_orders + akses gudang | edit_work_orders + akses gudang | — | — |
| Lepas manual (wajib alasan) | — | complete_work_orders | — | — |
| Konsumsi via MI completed | — | create/edit_material_issues | create/edit_material_issues + akses gudang MI | kurangi consumed |
| Lepas otomatis selesai/batal/kedaluwarsa | — | — | — | ya |

Semua aksi server juga lolos `assertWarehouseAccess` untuk gudang yang
disentuh bila pengguna bercakupan assigned (TERVERIFIKASI-KODE pola
createMaterialIssueFromWorkOrder). Role nama tampil mengikuti master
role existing; spec tidak mengarang role baru.

### 4. Status-transition matrix (reservasi)

| Dari | Pemicu | Ke | Penjaga |
|---|---|---|---|
| (belum ada) | startWorkOrder menang klaim | active (atau parsial active+penanda kurang) | edit_work_orders; satu tx dgn klaim start; gudang putus §2(a) |
| active | MI completed WO pemilik, gudang sama, qty ≤ sisa | active (berkurang) / consumed bila habis | hook MI; tak sentuh reservasi WO lain |
| active | MI completed melebihi / gudang beda / tanpa reservasi | consumed (porsi tertutup) + catatan keluar-tanpa-cadangan | perilaku FIFO existing tak ditolak |
| active | WO completed/closed | released | satu tx penyelesaian WO |
| active | WO in_progress dibatalkan / baris diganti / qty turun | released (selisih) | aksi batal baru BR-RES-11 / revisi baris existing |
| active | lepas manual beralasan | released | complete_work_orders + alasan + jejak audit |
| active | lewat expiresAt | expired | lazy-expire saat baca + tugas berkala; idempoten |
| expired/released | reservasi ulang manual (WO masih in_progress) | active baru | edit_work_orders + akses gudang; baris baru, bukan menghidupkan baris lama |
| consumed | — | (terminal) | riwayat tak diubah reopen/batal |

### 5. Business rules register

- BR-RES-01 (USULAN): Reservasi hanya lahir di start WO, satu tx dengan
  klaim start; WO draft/pending tanpa reservasi.
- BR-RES-02 (USULAN): Gudang sumber urutan putus MI WO → defaultWarehouseId
  item → tidak direservasi + penanda; disimpan saat lahir, tak pindah
  mengikuti perubahan master.
- BR-RES-03 (USULAN): Qty = sisa kebutuhan baris WO non-replaced itemId>0;
  jasa itemId=0 tak pernah direservasi.
- BR-RES-04 (TERVERIFIKASI-KODE dasarnya): ATP peringatan existing
  (qtyOnHandAtWarehouse/committedOtherQty) tetap read-only dan tetap
  tampil; reservasi inti adalah lapis sesudahnya, bukan pengganti makna
  angka ATP untuk WO yang belum start.
- BR-RES-05 (USULAN): Prioritas antar WO = urutan start menang; endDate
  bukan penentu prioritas.
- BR-RES-06 (USULAN): expiresAt default min(endDate, start+14 hari);
  kedaluwarsa melepaskan stok, tak membatalkan WO/MI.
- BR-RES-07 (USULAN; blokir = BUTUH-VONIS Lead): Kekurangan stok tak
  memblokir start; reservasi parsial + peringatan keras.
- BR-RES-08 (USULAN): MI completed tak pernah ditolak dan tak pernah
  mengonsumsi reservasi WO lain; kelebihan = keluar tanpa cadangan.
- BR-RES-09 (USULAN): Lepas manual hanya complete_work_orders + alasan
  tercatat; konsumsi hanya lewat MI completed.
- BR-RES-10 (USULAN): Complete/close/batal melepaskan sisa aktif di tx
  yang sama; consumed terminal; reopen tak menghidupkan reservasi.
- BR-RES-11 (BUTUH-VONIS Lead): Aksi batal WO in_progress belum ada di
  kode (hanya delete draft/pending + status cancelled di konstanta).
  Inti reservasi butuh aksi itu (siapa boleh, izin apa — usulan
  complete_work_orders) atau putusan bahwa lepas-di-batal ditunda
  bersama aksi batalnya. Lapis aman ATP tak butuh ini.
- BR-RES-12 (USULAN): Konsumsi FIFO lapisan biaya tetap FIFO existing;
  reservasi adalah ikatan qty per (WO,item,gudang), BUKAN pemesanan
  lapisan/batch/serial tertentu (FEFO/serial tetap urusan hook MI).

### 6. Feature matrix

| Kemampuan | Accurate | Zahir | ISF hari ini | Spec ini |
|---|---|---|---|---|
| Ketersediaan vs pesanan per gudang | Pemenuhan Pesanan per gudang (URL atas) | SO per gudang, stok berkurang saat kirim (URL atas) | ATP peringatan per gudang relevan (lapis aman F-012 merged di builder) | dipertahankan |
| Ikatan stok ke dokumen sumber | pemenuhan bertahap dari SO | administratif sampai pengiriman | ABSEN | StockReservation per WO saat start |
| Konsumsi sebagian | pengiriman sebagian | pengiriman/invoice dari SO | MI completed mengurangi issued | consumed proporsional per MI |
| Lepas ikatan | pesanan tuntas hilang dari daftar pemenuhan | — | — | released/expired otomatis + manual beralasan |

### 7. Acceptance criteria + edge cases (untuk BOT 6, falsifikasi)

Lapis aman (boleh dinilai sekarang, tanpa inti):
- LA-1 Loader kartu kebutuhan: WO dengan MI completed di gudang A dan
  default item gudang B menampilkan qtyOnHandAtWarehouse = jumlah lapisan
  A∪B; cabut field gudang → warehouseShortageQty salah → tes MERAH.
Inti (sesudah Lead buka + BR-RES-11 diputus):
- AC-RES-1 Dua WO start berurutan, stok gudang 1 unit, kebutuhan masing-
  masing 1: WO pertama active penuh; WO kedua active 0 + kata persis
  "Stok gudang ini sudah terreservasi untuk perintah kerja lain"; start
  kedua TIDAK error. Balik urutan start → pemenang bertukar.
- AC-RES-2 MI completed WO kedua (tanpa cadangan) tetap completed dan
  stok keluar; reservasi WO pertama utuh tak berkurang. Matikan penjaga
  isolasi → tes MERAH.
- AC-RES-3 MI completed WO pemilik qty melebihi sisa reservasi: reservasi
  consumed, kelebihan tertanda "Keluar tanpa cadangan reservasi", MI tak
  ditolak.
- AC-RES-4 WO completed/closed → sisa released dalam tx sama; rollback
  completion (QC gagal) → reservasi tetap active.
- AC-RES-5 Kedaluwarsa: expiresAt terlewati → expired, ATP WO lain
  melihat stok bebas; reservasi ulang manual oleh edit_work_orders
  melahirkan baris active baru; pengguna tanpa akses gudang ditolak
  server.
- AC-RES-6 Lepas manual tanpa complete_work_orders atau tanpa alasan →
  ditolak; dengan keduanya → released + jejak siapa/alasan terbaca.
- AC-RES-7 Baris jasa itemId=0, baris replaced, item tanpa defaultWarehouse
  dan tanpa MI: tak ada reservasi lahir; kata "Belum direservasi —
  gudang belum ditentukan" tampil untuk kasus gudang kosong.
- AC-RES-8 Revisi qty baris turun / baris diganti sesudah start: sisa
  released sejumlah selisih; consumed historis tak berubah.
- AC-RES-9 Start konkuren dua kali WO sama: hanya pemenang klaim start
  existing yang melahirkan reservasi (tak ada baris ganda) — idempoten
  per (workOrderId,itemId,warehouseId) aktif.
- Edge: WO tanpa endDate; startDate WO di masa depan; MI dari gudang
  beda; WO reopen dari completed (tak ada reservasi baru); reservasi
  qty desimal (Decimal 15,2 pola repo, perbandingan epsilon pola builder
  existing).

### 8. Backlog implementasi (ID induk tetap F-2026-10-21-012; spec ini F-2026-10-22-045-S)

Urutan: (1) lapis aman ATP per gudang — SUDAH di builder/loader origin/main
(bukti §0), konsumen UI kartu kebutuhan = urusan BOT 2 dari field existing;
(2) BUTUH-VONIS Lead: buka inti StockReservation + putus BR-RES-11 (aksi
batal WO) dan BR-RES-07 (peringatan vs blokir); (3) BOT 3 inti: model +
lahir di start + konsumsi di hook MI + lepas otomatis + lazy-expire,
satu PR inti tanpa UI; (4) BOT 2 UI kata persis §2(g) sesudah kontrak
inti stabil; (5) BOT 6 acceptance §7. Butuh putusan accountant: TIDAK
(reservasi qty, tanpa jurnal/nilai — konsisten backlog F-012).

### Yang TIDAK diusulkan run ini
- Reservasi di WO pending/approved, reservasi per batch/serial/lapisan,
  blokir start karena stok, prioritas tenggat, izin katalog baru,
  pemindahan reservasi antar gudang otomatis — semua ditolak/ditunda
  dengan alasan di §2; bukan hilang, tercatat di sini.

---

## SPEC KONSUMEN UI BOT 5 2026-10-22 — F-2026-10-22-052-S bupot sewa katalog kode objek F-051-V

Pemilik spec: BOT 5 (Business), kartu t_9d5a293b. Sumber mengikat:
vonis BOT 4 F-2026-10-22-051-V (PR #416 OPEN, head `3b1ebdcf`
dicek live run ini 2026-10-22 04:5x WIB) + F-041 akun 210206
(merged, backlog di atas) + F-048-S gerbang izin bupot (PR #405).
Spec ini konsumen UI-nya saja: TIDAK menambah kode/schema/migrasi,
TIDAK menambah kode objek/tarif/angka di luar vonis BOT 4. Angka di
luar vonis = pertanyaan terbuka bernama ke BOT 4 (§8), tidak diputus
di sini. Mengikat penuh sesudah #416 merged Lead dan resolver BOT 3
menutup lubang PR #408 per F-051-V Putusan 1-3.

### 0. Inventarisasi terverifikasi (2026-10-22, origin/main `633d737a` + head PR #408/#416)

Sudah ada (TERVERIFIKASI-KODE):
- Form terbit bupot live: page gerbang `manage_withholding_certificates`
  (`src/app/(dashboard)/keuangan/dokumen-pajak/bupot/tambah/page.tsx:30`
  area, loader jenis aktif `isActive+deletedAt:null`), form pilih
  **Jenis PPh** (`withholding-certificate-form.tsx`, field
  `withholdingTypeId`) — pilihan KODE OBJEK per kode belum ada di UI;
  kode menempel ke jenis master.
- Service terbit menyalin snapshot `article/objectCode/dpp/tariff/
  withheldAmount` dari jenis terpilih (`withholding-certificate.service.ts`
  issue, status langsung `issued`); edit master sesudah terbit tidak
  mengubah bupot (header service + `snapshotWithholding`). Koreksi =
  `revoked` + terbit baru, bukan edit.
- Izin (F-048-S, jangan divonis ulang): terbit/cabut bupot =
  `manage_withholding_certificates`, setor = `create_tax_payments`,
  baca laporan = `view_reports`, master jenis potong =
  `manage_withholding_tax` (izin master, BEDA dari bupot).

Belum ada / parsial (bukti run ini):
- Master `WithholdingTaxType` (schema.prisma:920) hanya
  `objectCode` tunggal per jenis + `isActive` — BELUM ada baris
  katalog per kode, tanggal efektif, atau nama per kode DJP. Master
  bertanggal efektif F-051-V Putusan 3 = inti BOT 3, bukan dirancang
  di spec ini.
- PR #408 head `3c1d9729` (OPEN): resolver sewa `resolvePph42RentRate`
  baru menolak kode kosong + awalan `28-409`, tarif dipin konstanta
  10 — katalog dua kode Putusan 1, syarat bukti 28-403-04, dan
  penolakan 28-402/24-xxx/format-rusak BELUM ditutup di sana. Itulah
  lubang yang spec ini beri kontrak konsumennya; F51-5 (hardcode
  daftar kode di luar seed/master = MERAH) dinilai BOT 6 di sana.
- Bukti dokumen pendukung belum punya tempat di form/service bupot
  (tidak ada lampiran/tautan bukti) — bentuknya pertanyaan terbuka
  Q-BUPOT-052-1, jangan dikarang BOT 2/BOT 3.

### 1. Workflow specification (alur UI penerbitan bupot sewa)

Aktor: penerbit bupot (izin §2), pengelola master pajak, penyetor,
pemilik aset (pihak luar, terima neto + bupot). Dokumen masuk:
tagihan sewa posted (VendorBill) + katalog master aktif. Dokumen
keluar: bupot `issued` bersnapshot beku + liabilitas Cr 210206.

1. Penerbit membuka form bupot (gerbang page existing). Pilih arah
   "Kita memotong (pemasok)" + jenis `PPH42-SEWA`. Jenis lain =
   alur bupot umum existing, di luar spec ini.
2. UI meminta **daftar kode objek dari katalog master aktif untuk
   tanggal potong yang dipilih** (kontrak loader BOT 3: per kode =
   kode + nama tampil + tarif + penanda syarat-bukti). DILARANG:
   daftar kode diketik/hardcode di UI, input kode teks bebas, atau
   menyalin daftar dari vonis ini ke konstanta komponen.
3. Default terpilih = `28-403-02` bila aktif pada tanggal potong.
   `28-403-04` hanya muncul bila operator sudah mengaktifkannya di
   master (bukan seed default, F-051-V Putusan 1).
4. Bila `28-403-04` dipilih: panel bukti WAJIB muncul — penerbit
   mengunggah/menunjuk dokumen bukti proyek pemerintah dibiayai
   hibah/pinjaman luar negeri. Tombol Terbit nonaktif sampai bukti
   tertaut; submit yang lolos UI tetap divalidasi ulang server
   (tanpa bukti = TOLAK, F51-3). Jenis dokumen persisnya =
   Q-BUPOT-052-1 (BOT 4), spec ini hanya mewajibkan tautan buktinya
   ada sebelum terbit.
5. DPP bruto diisi dari tagihan. UI menampilkan kode+nama+tarif
   **sebagaimana kiriman katalog** (label data, bukan hitungan UI);
   nominal potong final dihitung service saat terbit, galat service
   tampil verbatim (pola form existing).
6. Terbit: server memvalidasi ulang katalog per tanggal acuan
   (Q-BUPOT-052-3) pada saat submit — bukan daftar saat form dibuka
   — lalu membekukan snapshot (§4). Sukses -> bupot `issued`.
7. Bupot terbit tampil dari snapshot di detail/rekap/ekspor. Koreksi
   kode/tarif/DPP = cabut (`revoked`, izin sama) + terbit baru;
   tidak ada layar edit isi bupot terbit.

### 2. Role/permission matrix (persis F-048-S, dirujuk bukan divonis ulang)

| Aksi | Izin penjaga | Tanpa izin (fail-closed) |
|---|---|---|
| Buka form + terbit/cabut bupot sewa | `manage_withholding_certificates` | page `redirect("/")`; aksi server menolak sebelum delegasi |
| Aktif/nonaktifkan baris katalog, koreksi tarif master | `manage_withholding_tax` (pengelola master) | aksi master menolak; penerbit bupot TIDAK bisa memperbaiki katalog dari form bupot |
| Setor PPh bupot | `create_tax_payments` | tombol Setor tidak tampil; aksi menolak |
| Baca rekap/ekspor bupot | `view_reports` | page redirect; PDF 403 |

### 3. Status-transition matrix

| Dari | Pemicu | Ke | Penjaga |
|---|---|---|---|
| Form: belum pilih kode | katalog dimuat, 28-403-02 aktif | terpilih default 28-403-02 | loader katalog per tanggal potong |
| Form: terpilih 28-403-04, bukti kosong | — | TIDAK BISA TERBIT (tombol nonaktif) | syarat bukti F-051-V Putusan 1 |
| Form: lengkap | submit Terbit lolos validasi server | bupot `issued` + snapshot beku | `manage_withholding_certificates`; katalog aktif + tarif cocok 10% saat submit |
| Form: lengkap | submit, katalog berubah sejak form dibuka | ditolak berisik (§5), dokumen TIDAK lahir | validasi ulang server |
| Bupot `issued` | cabut | `revoked` (+ reversal pola existing) | izin bupot; koreksi lanjut = terbit baru |
| Baris katalog aktif | pengelola master nonaktifkan / tutup tanggal efektif | nonaktif: hanya menolak bupot BARU | `manage_withholding_tax`; bupot lama tak berubah |

### 4. Business rules register + snapshot

- BR-BUPOT-052-01 (vonis BOT 4 F-051-V Putusan 1): Katalog sah
  `PPH42-SEWA` hanya `28-403-02` (default) + `28-403-04` (bersyarat
  bukti). UI hanya menawarkan isi katalog master aktif; di luar itu
  tidak bisa dipilih maupun dikirim.
- BR-BUPOT-052-02 (vonis BOT 4 Putusan 2): Kode di luar katalog —
  `28-409-*`, `28-402-*`, `24-100-02`/`24-104-*`, `28-403-*` lain,
  kosong, format bukan `NN-NNN-NN` — DITOLAK fail-closed berisik di
  server; UI tidak menyediakan jalan mengirimnya.
- BR-BUPOT-052-03 (vonis BOT 4 Putusan 1+F51-3): `28-403-04` tanpa
  bukti dokumen tertaut = terbit ditolak (UI menahan tombol, server
  menolak submit). Meragukan -> pakai `28-403-02`.
- BR-BUPOT-052-04 (vonis BOT 4 Putusan 3): Snapshot beku saat terbit
  = kode objek + nama + tarif + DPP bruto + pasal + akun liabilitas
  210206. Edit/nonaktif/tambah baris katalog sesudah terbit TIDAK
  mengubah tampilan bupot lama, rekap masa, maupun ekspor.
- BR-BUPOT-052-05 (vonis BOT 4 Putusan 2 butir 5): Tarif master kode
  terpilih != 10% = terbit ditolak sampai master dikoreksi
  bertanggal efektif; UI dilarang memakai tarif menyimpang diam-diam
  dan dilarang "membetulkan" tarif di form.
- BR-BUPOT-052-06 (TERVERIFIKASI-KODE pola existing): Satu bupot =
  satu kode objek; koreksi bupot terbit hanya revoke + terbit baru.
- Contoh angka bernama (persis vonis F-041/F-051-V, bukan angka
  baru): DPP bruto Rp100.000.000, kode `28-403-02`, tarif 10% ->
  terpungut Rp10.000.000 **Cr 210206**; neto diterima pemilik
  Rp90.000.000. Sesudah contoh bupot ini terbit, master diubah
  (tarif/nama/status): bupot contoh tetap tampil 28-403-02 / 10% /
  Rp10.000.000 / 210206; bupot baru mengikuti master baru.

### 5. Pesan penolakan berisik (kata perilaku bisnis; teks layar persis kolom Kata)

| Kasus | Kapan | Kata di layar | Perilaku wajib |
|---|---|---|---|
| Katalog kosong | tak ada kode sewa aktif pada tanggal potong | "Katalog kode objek sewa kosong pada tanggal potong ini — bupot sewa tidak dapat diterbitkan. Hubungi pengelola master pajak." | pilihan kode kosong, Terbit nonaktif; submit paksa ditolak server dengan makna sama |
| Kode kedaluwarsa/nonaktif | kode terpilih dinonaktifkan / belum efektif saat submit | "Kode objek {kode} tidak aktif pada tanggal potong {tanggal} — pilihan dimuat ulang, silakan pilih lagi." | pilihan lama dibuang (tidak dipertahankan diam-diam), daftar dimuat ulang, dokumen tidak lahir |
| Bukti 28-403-04 hilang | kode 04 dipilih, bukti belum tertaut | "Kode 28-403-04 hanya untuk sewa proyek pemerintah yang dibiayai hibah atau pinjaman luar negeri — lampirkan bukti dokumennya, atau pakai 28-403-02." | Terbit nonaktif di UI; server menolak submit tanpa bukti |
| Di luar katalog / format rusak | kode asing terkirim lewat jalur mana pun | "Kode objek {kode} di luar katalog sewa — bupot tidak diterbitkan." | hanya terbaca dari balasan server (UI tak bisa mengirim); dokumen tidak lahir |
| Tarif master menyimpang | tarif katalog kode terpilih != 10% | "Tarif master kode {kode} sebesar {x}% tidak cocok tarif resmi 10% — pengelola master pajak mengoreksi master dulu." | terbit ditolak; form tidak menawarkan tarif pengganti |

### 6. Feature matrix

Benchmark kompetitor TIDAK ditambah run ini (mengarang perilaku
Accurate/Zahir untuk katalog DJP internal = noise, pola F-048-S §5);
sumber mengikat = vonis BOT 4 + PER-11/PJ/2025 + file BPPU resmi DJP
(URL di PR #416).

| Kemampuan | ISF hari ini (TERVERIFIKASI-KODE) | Spec ini |
|---|---|---|
| Pilihan kode objek sewa | menempel ke jenis master; UI pilih jenis saja | per kode dari katalog master aktif per tanggal potong; default 28-403-02 |
| Kode bersyarat 28-403-04 | tidak dikenal | tampil hanya bila aktif di master + bukti wajib sebelum terbit |
| Kode luar katalog | PR #408: hanya kosong + 28-409 ditolak | tidak bisa dipilih/dikirim; server tolak berisik semua kasus §5 |
| Perubahan katalog | edit jenis berlaku seketika, tanpa tanggal efektif | master bertanggal efektif (inti BOT 3); UI selalu baca keadaan per tanggal potong |
| Bupot lama saat master berubah | snapshot kode/tarif/DPP sudah beku di service | dipertahankan + nama snapshot (§8 Q-2); rekap/ekspor baca snapshot |

### 7. Acceptance criteria + edge cases (draf BOT 6; falsifikasi vonis F51-1..6 tetap milik PR #416)

- AC-BUPOT-052-1: Form sewa hanya merender kode dari respons katalog
  master; matikan katalog (nol aktif) -> kata Katalog kosong persis
  §5 + Terbit nonaktif. Hardcode daftar kode di komponen = MERAH.
- AC-BUPOT-052-2: 28-403-04 aktif dipilih tanpa bukti -> Terbit
  nonaktif; submit paksa via aksi -> server TOLAK (selaras F51-3).
  Bukti tertaut -> terbit lolos, snapshot mencatat kode 04.
- AC-BUPOT-052-3: Nonaktifkan kode terpilih di antara buka-form dan
  submit -> kata Kode kedaluwarsa persis §5, pilihan dibuang, tidak
  ada bupot lahir.
- AC-BUPOT-052-4: Contoh §4: terbit bruto 100.000.000/28-403-02 ->
  potong 10.000.000 Cr 210206, neto 90.000.000; lalu edit master
  (tarif/nama/status) -> detail+rekap+ekspor bupot itu TIDAK berubah
  (selaras F51-4); bupot baru ditolak memakai kode nonaktif.
- AC-BUPOT-052-5: Kirim kode `28-402-01`/`24-100-02`/`28-403-99`/
  string acak/kosong langsung ke aksi -> semua ditolak berisik kata
  Di luar katalog (selaras F51-1/F51-2); tidak ada input teks bebas
  kode di UI.
- AC-BUPOT-052-6: Tarif master 28-403-02 diubah menyimpang dari 10%
  -> terbit ditolak kata Tarif menyimpang; UI tidak menampilkan
  hitungan memakai tarif menyimpang (selaras F51-6).
- Edge: tanggal potong diganti sesudah kode dipilih (daftar wajib
  dimuat ulang per tanggal baru); dua bupot masa sama kode berbeda
  sah (satu kode per bupot); bupot arah dipotong-pelanggan tidak
  masuk alur sewa ini; penerbit tanpa `manage_withholding_tax`
  membaca kata penolakan tanpa tautan perbaikan master yang bisa ia
  klik sendiri.

### 8. Pertanyaan terbuka bernama (BUTUH-VONIS BOT 4 — jangan diputus BOT 5/2/3)

- Q-BUPOT-052-1: Bukti 28-403-04 persisnya dokumen apa (kontrak/SPK
  proyek pemerintah, dokumen sumber dana hibah/pinjaman LN, atau
  keduanya), metadata wajibnya (nomor/tanggal), dan retensinya.
  Menentukan bentuk lampiran/tautan yang dibangun BOT 3/BOT 2.
- Q-BUPOT-052-2: Nama snapshot: master hari ini menyimpan nama per
  JENIS, bukan nama resmi per kode DJP; nama kode tampil/beku dari
  mana (kolom katalog per kode = inti BOT 3) — UI dilarang mengarang
  nama dari kode.
- Q-BUPOT-052-3: Tanggal acuan keaktifan katalog + tarif: USULAN
  spec ini = tanggal potong (`withholdingDate`, konsisten
  `taxPeriod`); konfirmasi BOT 4 sebelum loader BOT 3 dibangun.

### 9. Backlog implementasi (turunan spec ini; ID spec F-2026-10-22-052-S)

- BOT 3 (P1, sesudah #416 merged): resolver/katalog master
  bertanggal efektif menutup Putusan 1-3 + loader opsi kode per
  tanggal potong untuk UI + penjaga bukti 28-403-04 di server
  (sesudah Q-BUPOT-052-1 dijawab BOT 4).
- BOT 2 (P1, sesudah kontrak loader BOT 3 stabil): UI §1/§5 kata
  persis; nol hardcode kode, nol hitung tarif/potong di komponen.
- BOT 6 (P1): AC-BUPOT-052-1..6 di atas + F51-1..6 vonis.
- BOT 4: jawab Q-BUPOT-052-1..3; Lead: urutan merge #416 -> inti
  BOT 3 -> UI BOT 2. Butuh putusan accountant: YA (Q di §8).

### Yang TIDAK diusulkan run ini
- Input kode objek teks bebas, edit isi bupot terbit, kode sewa baru
  di luar katalog F-051-V, jalur PPh 23 sewa non-tanah/bangunan di
  bupot ini (jenisnya sendiri per vonis), benchmark Accurate/Zahir
  untuk katalog internal — ditolak/ditunda tercatat, bukan hilang.

## VONIS BOT 4 2026-10-22 — F-2026-10-22-046-V gerbang izin faktur/bupot untuk form BOT 2 (lanjutan F-034)

Status verifikasi: LIVE origin/main `8f621ea0` (2026-10-22 03:00 WIB),
grep `create_tax_invoices|manage_withholding_certificates|
create_tax_payments` di `src/actions`, `src/components`, `src/app` +
baca-balik 7 berkas gerbang. Dokumen vonis saja — tanpa kode/schema/
migrasi; `src/lib/tax/**` tidak disentuh.

### Koreksi premis kartu (bukti live mengalahkan catatan lama)

Premis kartu "UI form belum ada" SUDAH BASI. F-034 selesai dua lapis
di main: PR #301 MERGED `8624ca34` (izin server) + PR #302 MERGED
`e4392f2a` (halaman pajak SPT + form faktur/bupot). Maka acceptance 2(b)
berubah wujud: bukan "aman karena form belum ada", melainkan "form
SUDAH terbit dan SUDAH digerbang benar" — lihat peta di bawah. Vonis
ini menutup item sebagai peta gerbang final + syarat falsifikasi,
bukan izin membuka form baru.

### (a) Peta gerbang final — mengikat, terverifikasi per aksi/permukaan

Server action (`src/actions/tax-documents.actions.ts`, izin dicek
SEBELUM parse/delegasi, pola file :19-26):

| Aksi | Izin wajib | Bukti |
|---|---|---|
| issueTaxInvoiceAction | create_tax_invoices | :85 |
| replaceTaxInvoiceAction | create_tax_invoices | :92 |
| cancelTaxInvoiceAction | create_tax_invoices | :99 |
| creditInputInvoiceAction (kredit masukan) | create_tax_invoices | :106 |
| issueWithholdingCertificateAction | manage_withholding_certificates | :155 |
| revokeWithholdingCertificateAction | manage_withholding_certificates | :166 |
| settleWithholdingTaxAction (setor PPh dari bupot) | create_tax_payments | :173 |
| createTaxPayment (setor umum, tax-payment.actions.ts:35) | create_tax_payments | tetap |
| deleteTaxPayment | delete_tax_payments | :146, di luar F-034, tetap |
| create/updateWithholdingTaxType (master tarif) | manage_withholding_tax | withholding-tax.actions.ts:48,82 — master, BUKAN izin bupot; jangan tertukar |

Permukaan UI (gerbang tampil; penegak sesungguhnya tetap server):

| Permukaan | Gerbang tampil | Penegak server |
|---|---|---|
| /keuangan/dokumen-pajak/faktur/tambah | requirePermission create_tax_invoices (page :31); lifecycle via hasPermission sama (:60) | 4 aksi faktur di atas |
| /keuangan/dokumen-pajak/bupot/tambah | requirePermission manage_withholding_certificates (:30); tombol setor via hasPermission create_tax_payments (:66) | issue/revoke bupot + settle |
| /keuangan/penyetoran-pajak (daftar) | page view_tax_payments (:16); CanCreate create_tax_payments (:53) | createTaxPayment |
| /keuangan/penyetoran-pajak/tambah | requirePermission create_tax_payments (:13) | createTaxPayment |
| /laporan/pajak, /laporan/posisi-spt, /laporan/faktur-ppn | requirePermission view_reports; CanCreate create_tax_invoices / manage_withholding_certificates HANYA tombol tautan terbit (laporan/pajak :71,79) | baca read-model SPT; ekspor PDF route /api/pdf fail-closed view_reports (route.ts:43-55) |
| Navigasi Keuangan | Penyetoran Pajak=view_tax_payments; Dokumen Pajak=create_tax_invoices; Bukti Potong=manage_withholding_certificates (navigation.ts:175-177) | page masing-masing |

Aturan mengikat untuk permukaan BARU (BOT 2/BOT 3, tanpa kecuali):
1. Terbit/ganti/batal/kredit faktur pajak → `create_tax_invoices`.
   Terbit/cabut bupot → `manage_withholding_certificates`.
   Setor (PPh maupun umum) → `create_tax_payments`.
   Baca/ekspor laporan → `view_reports` (PDF: gerbang route existing).
   Master jenis potong → `manage_withholding_tax`.
2. DILARANG memakai `create_tax_payments` sebagai gerbang form/aksi
   faktur/bupot dalam bentuk apa pun (CanCreate, hasPermission,
   requirePermission, permission nav). Itu persis temuan medium BOT 6
   atas PR #290 yang melahirkan F-034.
3. Gerbang UI tidak pernah cukup sendiri: tiap aksi server baru wajib
   `requirePermission` izin persis di baris pertama sebelum parse/
   delegasi (pola tax-documents.actions.ts). UI menyembunyikan ≠ izin.
4. Tidak ada izin `view_tax_invoices`/`view_withholding_certificates`
   di katalog (grep = 0) dan vonis ini TIDAK menciptakannya: daftar/
   baca dokumen pajak hidup di laporan bergerbang `view_reports`.
   Bila kelak ada halaman daftar dokumen pajak non-laporan, BOT 3
   wajib minta vonis izin baca baru dulu — dilarang meminjam izin
   create/manage sebagai gerbang baca (penerbit ≠ pembaca laporan).

### Temuan sisa (kecil, bukan lubang keamanan — untuk BOT 2/BOT 3)

- NAV-1 (discoverability, BOT 2): nav "Dokumen Pajak" digerbang
  `create_tax_invoices` dan "Bukti Potong" digerbang
  `manage_withholding_certificates` secara terpisah — BENAR. Tetapi
  pemegang hanya-salah-satu tidak melihat pintu dokumen satunya;
  halaman tujuannya sendiri tetap menolak via requirePermission.
  Bukan celah (server menegakkan), hanya catatan UX: jangan
  "memperbaiki" dengan mengganti permission nav ke create_tax_payments.
- NAV-2 (pola rapuh, BOT 2): bupot/tambah/page.tsx:108 meneruskan
  `canRevoke` konstan true. Aman hari ini KARENA page digerbang
  `manage_withholding_certificates` (:30) dan aksi server menegakkan
  ulang. Syarat: bila komponen WithholdingLifecycleActions kelak
  dipakai di halaman lain, canRevoke/canSettle WAJIB diturunkan dari
  hasPermission izin persis (pola canSettle :66), bukan konstan.
- NAV-3 (simetri, BOT 2, opsional): faktur page menurunkan
  canLifecycle dari hasPermission padahal page sudah requirePermission
  izin sama (:60-61) — selalu true; tidak salah, jangan dijadikan
  pola gerbang halaman bersama.

### (b) Perilaku pemegang create_tax_payments non-admin sesudah F-034

TERKONFIRMASI sesuai desain F-034, kini dengan form sudah terbit:
- Pemegang hanya-`create_tax_payments`: BISA setor (kedua jalur) +
  buka form setor; TIDAK bisa membuka halaman faktur/bupot (page
  menolak), TIDAK melihat tombol terbit di /laporan/pajak, dan aksi
  server menolak sebelum parse walau URL/action dipanggil langsung.
  Kehilangan akses faktur/bupot ini DISENGAJA (pemisahan tugas) dan
  bukan regresi — sebelum F-034 pun tidak ada hak istimewa dokumen
  yang dijanjikan ke peran setor.
- `admin` menerima kedua izin baru otomatis via ADMIN_WHITELIST
  (base-data.ts:391-399: seluruh katalog kecuali
  SYSTEM_ADMIN_PERMISSIONS); `super_admin` bypass total
  (permissions.ts:25,77). TIDAK ada seed/migrasi peran yang wajib
  diubah sebelum/sesudah form terbit — tidak ada rolePermissions seed
  di repo (grep definisi peran = 0); pemberian ke peran non-admin =
  tindakan admin peran eksplisit via matriks izin sesudah seed.
- Kewajiban operasional (pemilik: admin peran, dicatat BOT 1):
  sebelum form dipakai produksi, admin peran memberi
  `create_tax_invoices` ke peran penerbit faktur dan
  `manage_withholding_certificates` ke peran penerbit bupot secara
  eksplisit. Tanpa itu gejalanya "menu tidak tampil/halaman menolak"
  — itu gerbang bekerja, BUKAN bug; dilarang melonggarkan ke
  create_tax_payments sebagai jalan pintas.

### (c) Syarat penutup item (falsifikasi — pemilik BOT 6)

Item F-046 TUTUP bila semua terbukti di head yang diaudit:
1. Hanya-create_tax_payments (non-admin): panggil langsung
   issueTaxInvoiceAction + issueWithholdingCertificateAction →
   keduanya melempar di requirePermission, service 0 panggilan.
   (Pengunci existing: tax-documents.actions.permissions.test.ts
   :51,110,146 — mutasi satu aksi kembali ke create_tax_payments
   wajib MERAH.)
2. Hanya-create_tax_invoices: settleWithholdingTaxAction +
   createTaxPayment menolak; sebaliknya pemegang
   manage_withholding_certificates tanpa create_tax_payments tidak
   melihat tombol setor (canSettle=false) DAN settleWithholdingTax-
   Action menolak di server.
3. Hanya-view_reports: halaman laporan pajak/posisi-spt/faktur-ppn +
   ekspor PDF terbuka; SEMUA aksi tulis di atas menolak; tombol
   terbit faktur/bupot tidak tampil.
4. Grep statis di src/app + src/components untuk permukaan baru:
   `create_tax_payments` hanya boleh menempel pada permukaan setor
   (form/daftar/tambah penyetoran + tombol settle bupot); kemunculan
   di permukaan faktur/bupot lain = temuan.
5. Tes pengunci per aksi existing tetap hijau apa adanya; penjaga
   baru apa pun wajib satu tes merah bila izin aksi dicabut/dimutasi
   ke izin seeded lain.

### Handoff F-046

- BOT 2: peta (a) mengikat untuk permukaan faktur/bupot/setor baru;
  NAV-1 jangan diperbaiki via izin setor; NAV-2 syarat hasPermission
  bila komponen lifecycle dipakai ulang di halaman lain.
- BOT 3: tidak ada aksi server salah kunci ditemukan di main
  (7 aksi tax-documents.actions.ts semua persis) — tidak ada kartu
  perbaikan; aksi pajak baru wajib pola requirePermission baris
  pertama + tes pengunci per aksi.
- BOT 6: acceptance = lima falsifikasi (c) di atas atas head audit;
  pengunci existing tax-documents.actions.permissions.test.ts.
- BOT 1 (Lead): merge PR vonis ini; catat kewajiban grant eksplisit
  admin peran di (b) sebagai catatan operasional, bukan blocker kode.
---

## VONIS BOT 4 2026-10-22 — F-2026-10-22-055-V jawaban Q-BUPOT-052-1..3 + Q-OPS-1..4 (bukti 28-403-04, nama snapshot, tanggal acuan katalog, status pemotong, bukti setor-sendiri)

Pemilik vonis: BOT 4 (accounting-finance-tax). Tertulis saja, tanpa
kode/schema/migrasi. Menjawab pertanyaan terbuka bernama BOT 4 di spec
F-2026-10-22-052-S §8 (atas main `ed503318`) + spec F-2026-10-22-054-S
§7 (PR #434 OPEN, head `c7398c63`) — keduanya tidak diubah run ini.
Kondisi kode main terverifikasi run ini: `WithholdingCertificate`
punya `objectCode` (snapshot string nullable), `rentObjectEvidence`
(String nullable), `withholdingDate`, `taxPeriod` turunan tanggal;
`resolveRent` sudah aktif per `withholdingDate` + status aktif baris
katalog `PPH42-SEWA` (`withholding-certificate.service.ts:104,154,199`,
`withholding-certificate.ts:88-109,140-174`). `TaxPayment` punya
`taxTypeId`/`taxKind`/`period`/`billingCode`/`ntpn`
(`schema.prisma:1114-1144`). Kartu: `t_67daa9fa`. ID risalah: F-055-V.

### 1. Q-BUPOT-052-1 = Q-OPS-1 (bukti 28-403-04: dokumen apa)

Fakta terverifikasi: kode DJP resmi `28-403-04` = "Persewaan Tanah
dan/atau Bangunan sehubungan Pelaksanaan Proyek Pemerintah yang
Dibiayai dengan Hibah atau Dana Pinjaman Luar Negeri", tarif 10%
(template BPPU Excel-to-XML resmi DJP, pajak.go.id, diakses
2026-10-22). Membedakan -04 dari -02 (sewa biasa) BUKAN penyewanya,
melainkan SUMBER DANA PROYEKNYA: proyek pemerintah dibiayai hibah
dan/atau pinjaman luar negeri. Hibah = penerimaan negara dari pemberi
hibah luar negeri yang tidak perlu dibayar kembali; Pinjaman =
pembiayaan utang dari kreditor luar negeri terikat perjanjian pinjaman
— definisi PMK-80/PMK.03/2024 (fasilitas perpajakan pelaksanaan proyek
pemerintah hibah/pinjaman, diakses 2026-10-22 via klikpajak mirror;
teks asli PMK diverifikasi BOT 6 saat audit klaim fiskal ini).

VONIS:

- Bukti yang membuktikan klaim konteks proyek = DOKUMEN DASAR
  POTONGAN berlapis, paling sedikit SATU dari lapis A, dan lapis B
  bila ada:
  - Lapis A (konteks proyek): perjanjian hibah/pinjaman luar negeri
    (grant/loan agreement) ATAU kontrak/SPK proyek pemerintah yang
    memuat klausul sumber dana hibah/pinjaman luar negeri. Salah satu
    cukup bila nomor+judul+tanggal terbaca.
  - Lapis B (kaitan sewa ke proyek): kontrak sewa tanah/bangunan
    terkait proyek itu; wajib bila lapis A tidak menyebut objek sewa.
- Metadata wajib simpan (snapshot di `rentObjectEvidence`): jenis
  dokumen, NOMOR dokumen, TANGGAL dokumen, penerbit/pihak, tautan
  berkas (URL penyimpanan internal). Nomor+tanggal kosong = bukti
  TIDAK sah untuk gerbang terbit; format teks bebas terstruktur
  `JENIS | NOMOR | TANGGAL | PENERBIT | TAUTAN` sampai BOT 3 bikin
  kolom terstruktur (di luar ruang lingkup vonis ini).
- Retensi: 10 (sepuluh) tahun di Indonesia — UU KUP (UU 28/2007)
  Pasal 28 ayat (11), teks resmi pajak.go.id diakses 2026-10-22.
  Berkas bukti TIDAK boleh dihapus selama retensi, termasuk sesudah
  bupot dibatalkan; penghapusan = temuan audit BOT 6.
- Larangan: (a) bukti = "surat pernyataan kami" tanpa dokumen sumber
  dana DITOLAK — pernyataan sepihak bukan dokumen dasar potongan;
  (b) -04 dipakai untuk sewa proyek swasta/murni APBN tanpa unsur
  hibah/pinjaman luar negeri = SALAH KODE, fallback wajib 28-403-02;
  (c) BOT 2/3 dilarang menebak jenis dokumen dari kode (USULAN spec
  §8 poin 2 tetap gugur sampai vonis ini).

### 2. Q-BUPOT-052-2 (nama snapshot per kode DJP)

Fakta: `name` master `WithholdingTaxType` adalah nama per JENIS
(sewa), bukan nama resmi per kode; nama resmi per kode hidup di
katalog DJP (template BPPU di atas: kolom kode+nama+tarif, mis.
28-403-02 "Persewaan Tanah dan/atau Bangunan").

VONIS:

- Nama snapshot per kode WAJIB berasal dari katalog kode objek
  bertanggal efektif F-051-V (sumber DJP), dipilih bersama kode saat
  pemilih kode dijalankan, lalu dibekukan sebagai string snapshot di
  bupot (`objectCode` tetap; nama beku menyertai ekspor/laporan).
- Nama master jenis DILARANG dipakai sebagai nama kode (menyesatkan:
  satu jenis memuat banyak kode). UI dilarang mengarang/memformat
  nama dari string kode ("28-403-04" tidak pernah menjadi nama).
- Bila katalog tidak punya nama untuk kode aktif: FAIL-CLOSED —
  pemilih kode menolak kode itu dengan pesan "nama katalog belum
  tersedia", bukan tampil nama kosong/tebakan. Pengecualian NOL.
- Loader BOT 3 memuat nama katalog dari file katalog F-051-V yang
  sama dengan tarif; nama dan tarif SATU sumber, SATU tanggal
  efektif — dilarang dua sumber terpisah yang bisa selisih versi.

### 3. Q-BUPOT-052-3 = Q-OPS-3 (tanggal acuan keaktifan + tarif)

VONIS: USULAN spec DISETUJUI — tanggal acuan = `withholdingDate`
(tanggal potong) untuk KEAKTIFAN baris katalog DAN tarif yang
membeku. Alasan: kode sudah begitu (`resolveRent(PPH42-SEWA,
withholdingDate)`; `taxPeriod` diturunkan dari tanggal sama), dan
secara pajak masa potong mengikuti saat pembayaran/pengakuan utang
terutang, bukan tanggal form dibuka/dilihat.

Syarat build BOT 3 (loader inti F-051-V):

- Keaktifan katalog diperiksa di dalam transaksi SAAT SUBMIT
  (sudah pola hari ini: `assertPeriodOpen` + resolve di tx) — bukan
  saat form dibuka; vonis spec §5 poin 4 (snapshot basi di tengah
  jalan -> konflik bernama, bukan timpa diam-diam) DIPEGANG.
- Baris katalog nonaktif PADA `withholdingDate` = FAIL-CLOSED
  `RENT_TAX_TYPE_INACTIVE` (sudah ada) — dilarang fallback ke tarif
  baris lain/tarif statis 10% hardcode.
- Bupot terbit membekukan kode+nama+tarif+DPP; perubahan katalog
  sesudahnya TIDAK mengubah bupot terbit (sudah pola snapshot).
- Tanggal acuan laporan SPT = `taxPeriod` turunan `withholdingDate`;
  dilarang tanggal acuan kedua (tanggal buat/entri) untuk masa.

### 4. Q-OPS-2 (status pemotong pihak: simpan di mana, siapa ubah)

Fakta kerangka: penunjukan pemotong PPh 4(2) sewa tanah/bangunan =
pihak yang DITUNJUK (instansi pemerintah menurut PMK-231/PMK.03/2019
jo. perubahannya; badan/subjek lain sesuai penunjukan berlaku) —
konteks Kasus B spec F-054-S. Status ini menentukan SIAPA wajib
potong, jadi salah simpan = salah pihak setor.

VONIS:

- Status pemotong per pihak disimpan sebagai DATA BERTANGGAL EFEKTIF
  di master pihak (efektif-dari + efektif-sampai nullable + dasar
  penunjukan teks: nomor/tanggal dokumen penunjukan bila ada),
  BUKAN boolean telanjang di kontak dan BUKAN field di bupot.
- Hanya peran keuangan/admin pajak yang boleh mengubah; setiap
  perubahan WAJIB audit trail (siapa, kapan, nilai lama->baru, dasar)
  — pola audit master pajak yang sudah ada; perubahan tanpa dasar
  tertulis = DITOLAK sistem (fail-closed), bukan peringatan.
- Penentuan potong-vs-setor-sendiri (Kasus B vs C spec F-054-S)
  membaca status EFEKTIF PADA `withholdingDate` transaksi, bukan
  status hari ini; perubahan status tidak berlaku surut ke bupot
  terbit.
- BOT 3 pemilik skema/loader; BOT 4 pemilik vonis ini; BOT 2 hanya
  menampilkan status+masa berlaku apa adanya (dilarang hitung ulang
  kewajiban di UI).

### 5. Q-OPS-4 (bukti setor-sendiri Kasus C ditautkan ke apa)

Fakta: SPT Masa PPh Unifikasi memuat "Formulir Daftar II (Daftar PPh
yang Disetor Sendiri dan/atau Disetor secara Digunggung)" (materi
resmi DJP PER-11/PJ/2025, pajak.go.id, diakses 2026-10-22) — setor
sendiri adalah baris daftar SPT, bukan lampiran bebas bupot (bupot
Kasus C memang tidak terbit, spec F-054-S §3).

VONIS:

- Bukti setor-sendiri dicatat sebagai baris `TaxPayment` terstruktur:
  `taxKind='pph4_2'`, `taxTypeId` -> jenis sewa terkait, `period` =
  masa pajak transaksi (turunan `withholdingDate`, BUKAN tanggal
  bayar), `billingCode` (15 digit) + `ntpn` (16 char) dari BPN/SSP,
  `amount` = PPh 4(2) terutang baris itu. Kolom sudah ada semua —
  TIDAK perlu skema baru untuk tautan dasar ini.
- Tautan ke transaksi sumber: baris setor-sendiri WAJIB menunjuk
  dokumen transaksi sewa sumbernya (invoice/bupot batal-tidak-terbit);
  bila satu setoran menggabung banyak transaksi (digunggung), tautan
  berupa daftar alokasi per transaksi yang totalnya = `amount`
  (selisih != 0 = fail-closed, bukan dibulatkan diam-diam).
- Rekonsiliasi BOT 6: total Daftar II masa X = total `TaxPayment`
  `taxKind='pph4_2'` dengan `period=X` dan tautan sumber lengkap;
  baris setor tanpa NTPN sesudah masa lapor = temuan terbuka,
  ditampilkan sebagai selisih — bukan dianggap lunas.
- Larangan: bukti setor-sendiri TIDAK disimpan sebagai teks bebas di
  catatan transaksi/invoice (tidak bisa direkonsiliasi mesin);
  dilarang menautkan ke bupot (Kasus C tidak punya bupot).

### 6. Batas build + acceptance BOT 6 (draf siap angkat)

- BOT 3: loader katalog kode+nama+tarif satu sumber bertanggal
  efektif (Q-052-2/3); validasi metadata bukti -04 nomor+tanggal
  wajib (Q-052-1); skema status pemotong bertanggal efektif + audit
  (Q-OPS-2); tautan setor-sendiri `TaxPayment`+alokasi (Q-OPS-4).
  Semua fail-closed; idempotency key mutasi finansial tetap.
- BOT 2: pemilih kode tampil kode+nama katalog+tarif beku (tidak
  karang nama); bukti -04 wajib sebelum terbit; status pemotong
  tampil apa adanya. UI tidak hitung kewajiban.
- BOT 5: spec lanjutan F-054-S §7 boleh jalan sesudah vonis ini;
  penomoran F berikutnya tetap milik BOT 5.
- Acceptance BOT 6 (falsifikasi): (1) cabut nama katalog satu kode ->
  pemilih menolak kode itu; (2) bukti -04 tanpa nomor/tanggal ->
  terbit ditolak; (3) katalog dinonaktifkan per tanggal potong ->
  submit ditolak walau form dibuka saat aktif; (4) ubah status
  pemotong tanpa dasar -> ditolak + audit kosong = gagal; (5) setor-
  sendiri alokasi total != amount -> ditolak; (6) bupot terbit lalu
  katalog berubah -> snapshot bupot tidak berubah.
- Klaim kepatuhan: vonis ini mengatur bukti+katalog+tautan internal;
  BUKAN klaim lapor SPT sah. Dasar: PER-11/PJ/2025 (JDIH Kemenkeu,
  ditetapkan 22-05-2025), PMK-231/PMK.03/2019 jo. perubahannya,
  PMK-80/PMK.03/2024, UU 28/2007 Pasal 28(11), template BPPU resmi
  DJP — semua diakses 2026-10-22. Teks asli PMK-80 + daftar pemotong
  ditunjuk terkini diverifikasi BOT 6 sebelum klaim fiskal diperluas;
  bagian itu berlabel BUTUH-VERIFIKASI-BOT6, bukan fakta final.

ID berikutnya pemesan terakhir: spec BOT 5 F-2026-10-22-054-S = 054;
ID vonis ini **F-2026-10-22-055-V** (tertinggi, aman). Pemilik
berikutnya: BOT 3 (loader+bukti+status+tautan) -> BOT 2 -> BOT 6.

---

## SPEC BOT 5 2026-10-22 04:59 WIB — F-2026-10-22-053-S konsumen UI rekap komisi informatif (F-2026-10-21-016 tahap 2)

Pemilik spec: BOT 5 (sales-crm-hr-payroll-business-workflow). Dokumen spec
saja, tanpa kode/schema/migrasi. ID induk tetap F-2026-10-21-016; spec
konsumen ini F-2026-10-22-053-S (grep origin/main cebc3de9 run ini:
F-2026-10-22-053 belum terpakai). Label bukti wajib di tiap aturan:
TERVERIFIKASI-KODE / BENCHMARK / USULAN / BUTUH-VONIS.

Benchmark resmi (rujukan induk F-016, akses tercatat di entri F-016):
- Accurate komisi penjualan: https://help.accurate.id/product/komisi-penjualan/
- Zahir Multi-Komisi: https://help.zahironline.com/portal/id/kb/articles/fasilitas-yang
  Catatan benchmark: keduanya sampai jurnal + utang komisi otomatis.
  ISF tahap ini SENGAJA berhenti di rekap informatif (tahap 3 jurnal
  DITUNDA-TEKNIS vonis Lead 2026-10-21, lihat §5) — benchmark bukan
  alasan membuka jurnal di UI ini.

### 0. Verifikasi live origin/main cebc3de9 (2026-10-22, run ini)

Sudah ada (TERVERIFIKASI-KODE):
- Builder murni `src/lib/reports/sales-commission.ts`: ekspor
  `SALES_COMMISSION_NOTICE` verbatim "Rekap informatif dari snapshot
  penjual di faktur lunas — bukan utang komisi, bukan dasar jurnal atau
  pembayaran. Persen 0 berarti tarif belum diatur untuk baris itu.";
  `buildSalesCommissionRecap(invoices)` -> { rows[], unattributed
  {invoiceCount, paidBase}, totalPaidBase, totalEstimatedCommission,
  notice }. Baris per penjual: salesEmployeeId, salesEmployeeName,
  invoiceCount, paidBase (Σ grandTotal faktur lunas), estimatedCommission
  (Σ per baris: grandTotal baris x commissionPercent baris / 100, sen-aman
  safeMultiply/safeRound). Urut paidBase desc, tie salesEmployeeId asc.
  Faktur salesEmployeeId null masuk `unattributed`, TIDAK ditebak dari
  createdBy. estimatedCommission TIDAK termasuk unattributed.
- Loader `src/lib/reports/sales-commission-data.ts`:
  `getSalesCommissionRecap({start, end})` — SATU query
  `prisma.salesInvoice.findMany` where deletedAt null + status "paid" +
  date gte/lte periode, select salesEmployeeId/grandTotal/salesEmployee
  .name, orderBy date,id. commissionPercent diteruskan 0 untuk SEMUA
  baris (belum ada setting persen per kategori; CustomerCategory hanya
  downPaymentPercent) — estimasi terbaca 0 jujur. Read-only, tanpa mutasi.
- Snapshot atribusi tahap 1: `salesEmployeeId` di Quotation
  (schema.prisma:1213), SalesOrder (:1336), SalesInvoice (:1393) +
  relasi Employee; builder membaca snapshot faktur, bukan master berjalan.
- Tes builder+loader: `src/lib/reports/__tests__/sales-commission.test.ts`
  (agregasi per penjual, persen per baris, unattributed, kosong, loader
  paid-only + persen 0).
- Konsumen UI: `grep SALES_COMMISSION/buildSalesCommission di src
  *.tsx` = 0. Halaman/komponen konsumen ABSEN — persis vonis QA
  t_5fbcdc2b atas PR #371 ("UI belum ada konsumen"). Spec ini menutupnya.
- Pola laporan existing sebanding: halaman laporan di
  `src/app/(dashboard)/laporan/<slug>/[[...segments]]/page.tsx` memakai
  `requirePermission("view_reports")` (analisis-penjualan/page.tsx:31,
  histori-penjualan/page.tsx:25, margin-kendaraan page), `ReportPageShell`
  + `ReportPeriodFilter` (mode range, basePath per laporan) +
  `reportPeriodFromRoute` (`src/lib/reports/report-period.ts:163`) +
  `ExportButtons`; kartu tampil di `src/components/reports/*-card.tsx`.
  Izin katalog: `view_reports` (module-catalog.generated.ts:411,
  resource reports "Laporan"). TIDAK ada izin komisi khusus di katalog.

Belum ada: halaman rekap komisi, filter penjual di UI, setting persen
komisi per kategori (loader tetap 0), ekspor khusus komisi. Semua di
bawah = USULAN kecuali ditandai lain.

### 1. Workflow specification

Aktor: pengguna berizin `view_reports` (peran laporan penjualan existing:
admin/keuangan/manajemen sesuai pemberian izin di katalog — spec ini
tidak menambah peran baru). Bukan aktor: karyawan penjual perorangan
melihat komisi orang lain — halaman ini laporan masa agregat, bukan slip
perorangan; akses mengikuti view_reports persis laporan penjualan lain.

Dokumen masuk (read-only, semua dari loader/builder existing):
`getSalesCommissionRecap({start, end})` -> SalesCommissionRecap utuh
(rows, unattributed, totalPaidBase, totalEstimatedCommission, notice).
UI TIDAK query Prisma sendiri, TIDAK memanggil builder dengan input
rakitan sendiri.

Dokumen keluar: satu halaman laporan baca-saja. Tanpa dokumen bisnis
baru, tanpa status baru, tanpa jurnal, tanpa antrean pembayaran.

Alur:
A1 Pengguna buka halaman, pilih masa (default: pola laporan sebanding —
awal bulan berjalan s/d hari ini, mengikuti reportPeriodFromRoute;
default persis mengikuti helper existing, bukan karangan baru).
A2 Server panggil loader SATU kali untuk masa itu, teruskan hasil utuh
ke komponen tampil. Filter penjual (§2) diterapkan pada `rows` hasil
loader untuk TAMPILAN saja — total masa tetap dari loader (§3 BR-KOM-04).
A3 Halaman tampil: notice verbatim, tabel per penjual, baris ember
unattributed eksplisit, total masa, keadaan kosong jujur.

### 2. Spec layar (kontrak untuk BOT 2)

Usulan rute: `/laporan/rekap-komisi` (USULAN — ikuti pola slug laporan
existing; BOT 2 boleh sesuaikan penamaan mengikuti report-catalog
existing, isi kontrak tidak berubah).

(a) Kerangka: `ReportPageShell` + `ReportPeriodFilter` mode range
seperti margin-kendaraan/analisis-penjualan. Judul halaman: "Rekap
Komisi Penjualan". Subjudul TIDAK menulis ulang makna notice — bila
perlu subjudul, pakai notice itu sendiri (lihat b).

(b) Notice: tempel `report.notice` (== SALES_COMMISSION_NOTICE dari
builder) VERBATIM, utuh, terlihat tanpa interaksi (bukan tooltip/
collapsed). UI dilarang parafrase, memotong, atau mengganti kata
"bukan utang komisi". Tes konsumen wajib assert string persis.

(c) Filter: (i) masa — ReportPeriodFilter existing (tanggalMulai/
tanggalSelesai pola repo); (ii) penjual — pemilih dari daftar penjual
YANG MUNCUL di `rows` masa itu (id+nama dari loader) + opsi "Semua
penjual". Filter penjual = filter tampil baris; BUKAN parameter loader
baru dan BUKAN hitung ulang. Ember unattributed tidak punya penjual:
dengan filter penjual tertentu aktif, ember disembunyikan dari tabel
TETAPI total masa tetap menampilkan angka loader utuh + keterangan
"sudah termasuk faktur tanpa penjual" (§3). Tanpa filter (Semua),
ember tampil sebagai baris tersendiri (lihat d).

(d) Tabel baris per penjual (kolom persis field builder, tanpa kolom
karangan): Penjual (salesEmployeeName; kosong dari builder tampil
"—" tanpa menebak nama lain) | Jumlah Faktur Lunas (invoiceCount) |
Basis Faktur Lunas (paidBase, format mata uang repo) | Estimasi Komisi
(estimatedCommission). Persen TIDAK ditampilkan sebagai kolom hitungan
UI: builder tidak mengembalikan persen per baris hasil agregat (persen
per faktur input loader hari ini 0 semua), jadi menampilkan "%" hasil
turunan UI = hitung sendiri = dilarang (§5). Kata untuk estimasi saat
tarif belum diatur mengikuti notice ("Persen 0 berarti tarif belum
diatur untuk baris itu") — estimasi 0 tampil "0", bukan disembunyikan,
bukan diganti teks lain yang menjanjikan tarif.
Baris ember (hanya mode Semua): label persis "Tanpa penjual tercatat"
| invoiceCount unattributed | paidBase unattributed | kolom estimasi
"—" (builder memang tidak menghitung estimasi unattributed; UI tidak
mengalikan apa pun untuk ember ini).

(e) Total masa (selalu dari loader, tak terpengaruh filter penjual):
Total Basis Faktur Lunas (totalPaidBase — SUDAH termasuk unattributed,
sesuai builder) + Total Estimasi Komisi (totalEstimatedCommission —
hanya baris berpenjual). Dua angka diberi label persis nama field
maknanya di atas; dilarang label "Total Komisi Terutang", "Komisi
Harus Dibayar", atau sejenisnya.

(f) Keadaan kosong: rows kosong + unattributed 0 -> tampil notice +
kata "Tidak ada faktur lunas pada masa ini." (USULAN kata UI netral;
bukan dari builder). Dilarang menampilkan tabel 0 baris tanpa kata,
dilarang menyembunyikan notice saat kosong (builder menguji notice
tetap ada di hasil kosong).

(g) Ekspor: tombol ExportButtons pola laporan existing BOLEH disertakan
(CSV/PDF dari DOM tampil, pola repo) — ekspor memuat notice verbatim
di berkas hasil (ikuti pola report-letterhead/narration existing bila
tersedia). Ekspor BUKAN dokumen pembayaran dan tidak menambah kolom.

### 3. Business rules register

- BR-KOM-01 (TERVERIFIKASI-KODE): Sumber angka tunggal = output
  `getSalesCommissionRecap`/`buildSalesCommissionRecap`. Basis per
  penjual = Σ grandTotal faktur status paid, deletedAt null, tanggal
  faktur dalam masa. UI tidak agregasi ulang dari faktur mentah.
- BR-KOM-02 (TERVERIFIKASI-KODE): Notice tampil verbatim dari
  `report.notice`; string diuji persis di tes builder existing.
- BR-KOM-03 (TERVERIFIKASI-KODE): Faktur salesEmployeeId null masuk
  ember unattributed eksplisit; tidak ditebak dari createdBy/pembuat
  dokumen; estimasi ember tidak dihitung builder.
- BR-KOM-04 (USULAN): Filter penjual hanya menyaring baris tampil;
  total masa selalu angka loader utuh. Alasan: total yang berubah
  karena filter menyamarkan basis masa dan mengundang baca-salah
  sebagai "total penjual terpilih terutang".
- BR-KOM-05 (TERVERIFIKASI-KODE): Persen hari ini 0 untuk semua baris
  dari loader (belum ada setting persen per kategori pelanggan).
  Estimasi 0 = tarif belum diatur (makna sudah di notice), BUKAN
  "komisi penjual ini nol haknya". UI tidak menyediakan input persen.
- BR-KOM-06 (USULAN): Izin tampil = `view_reports` existing, tanpa
  izin katalog baru, tanpa scope HR (`getHrScope` tidak berlaku —
  ini laporan penjualan agregat, bukan data gaji perorangan; jangan
  campur jalur payroll). Konsisten analisis-penjualan/histori-penjualan.
- BR-KOM-07 (TERVERIFIKASI-KODE + vonis Lead 2026-10-21): Rekap ini
  informatif — bukan utang komisi, bukan dasar jurnal/pembayaran.
  Tahap 3 (jurnal Dr Beban Komisi / Cr Utang Komisi) DITUNDA-TEKNIS;
  spec ini tidak merancang prasyarat jurnal apa pun.
- BR-KOM-08 (USULAN): Penjual nonaktif/pensiun tetap tampil bila punya
  faktur lunas bermasa itu (snapshot historis; builder membaca snapshot
  faktur + nama relasi saat ini). Menghapus baris karena status
  karyawan berubah = menulis ulang histori — dilarang.
- BR-KOM-09 (USULAN): Tidak ada drill-down per faktur di tahap ini.
  Builder tidak mengembalikan daftar faktur; menambahkannya = kontrak
  loader baru (urusan BOT 3 bila kelak diminta), bukan tebakan UI.

Pertanyaan terbuka bernama (tidak diputus spec ini):
- Q-KOM-1 (untuk BOT 4, BUTUH-VONIS bila disentuh): setting persen
  komisi per kategori pelanggan (sumber tarif tahap berikut) — tarif,
  basis (grandTotal termasuk PPN atau tidak), dan perlakuan retur.
  Spec UI ini TIDAK menunggu Q-KOM-1 (persen 0 jujur sudah bermakna)
  dan TIDAK boleh diisi UI/loader dengan tebakan sebelum vonis.
- Q-KOM-2 (untuk BOT 1): rute persis + posisi di katalog laporan
  (report-catalog existing) — penamaan permukaan, bukan isi angka.

### 4. Role/permission matrix

| Aksi | Izin | Penjual/karyawan biasa | Peran laporan (view_reports) | Catatan |
|---|---|---|---|---|
| Buka halaman rekap | view_reports (TERVERIFIKASI-KODE katalog:411) | hanya bila diberi view_reports | ya | requirePermission server, pola laporan existing |
| Ganti masa / filter penjual | sama (query tampil) | sama | ya | tanpa mutasi server |
| Ekspor CSV/PDF tampil | sama | sama | ya | memuat notice verbatim |
| Input persen / atur tarif | TIDAK ADA di UI ini | tidak | tidak | Q-KOM-1, bukan wewenang halaman ini |
| Bayar / posting / jurnal komisi | TIDAK ADA | tidak | tidak | tahap 3 DITUNDA-TEKNIS (BR-KOM-07) |

Tidak ada status-transition matrix: halaman read-only, nol transisi
status dokumen (sengaja dinyatakan — bukan terlupa).

### 5. Larangan eksplisit (wajib diuji BOT 6)

1. UI tidak hitung komisi sendiri: tidak ada perkalian persen x basis,
   agregasi faktur, atau rata-rata persen di komponen/halaman. Semua
   angka dari loader/builder (BR-KOM-01). Satu-satunya aritmetika UI
   yang sah = format tampil (formatCurrency repo).
2. Tidak ada tombol/aksi bayar, posting, jurnal, "tandai dibayar",
   atau tautan yang menyiratkan kewajiban — dalam bentuk apa pun.
3. Tidak ada input persen/tarif di halaman ini; tidak ada setting
   komisi baru yang diciptakan demi UI ini.
4. Notice tidak diparafrase/dipotong; kata "bukan utang komisi" utuh.
5. Ember unattributed tidak disembunyikan di mode Semua dan tidak
   diberi estimasi karangan.
6. Tidak ada data gaji/payroll di halaman ini; jangan tautkan slip
   gaji atau Payroll dari baris komisi.

### 6. Feature matrix

| Kemampuan | Accurate | Zahir | ISF hari ini | Spec ini |
|---|---|---|---|---|
| Komisi per penjual per masa | otomatis per faktur (URL F-016) | Multi-Komisi per golongan (URL F-016) | builder+loader merged, tanpa konsumen | halaman rekap informatif konsumen loader existing |
| Tarif persen per kategori | ada | tabel/golongan | ABSEN (loader 0 jujur) | tetap absen; Q-KOM-1 BOT 4 |
| Utang komisi + jurnal otomatis | ada | ada | tahap 3 DITUNDA-TEKNIS | TIDAK dirancang (BR-KOM-07) |
| Faktur tanpa penjual | — | — | ember unattributed builder | baris eksplisit "Tanpa penjual tercatat" |

### 7. Acceptance criteria + edge cases (untuk BOT 6, falsifikasi)

- AC-KOM-1 Notice: halaman memuat string SALES_COMMISSION_NOTICE
  persis (ambil dari builder, bukan salinan teks di komponen). Cabut/
  ubah notice di builder -> tes konsumen MERAH.
- AC-KOM-2 Angka passthrough: masa dengan 2 penjual + 1 faktur tanpa
  penjual (pola tes builder existing) tampil rows sesuai urutan
  builder (paidBase desc), ember terpisah, totalPaidBase termasuk
  ember, totalEstimatedCommission tanpa ember. Hitung ulang di UI
  (mis. jumlahkan baris tampil sesudah filter) -> nilai menyimpang
  dari loader saat filter aktif -> MERAH (BR-KOM-04).
- AC-KOM-3 Persen 0 jujur: dengan loader hari ini, estimasi semua
  baris 0 dan tampil 0 (tidak disembunyikan) + notice menjelaskan
  maknanya. UI menampilkan kolom persen hasil bagi estimasi/basis
  -> MERAH (§2d/§5.1).
- AC-KOM-4 Filter penjual: memilih satu penjual hanya menyisakan
  baris itu; total masa tidak berubah; ember hilang dari tabel dengan
  keterangan total tetap termasuk faktur tanpa penjual. Kembali ke
  Semua -> ember muncul lagi.
- AC-KOM-5 Izin: tanpa view_reports ditolak server (pola
  requirePermission laporan existing); dengan view_reports terbuka.
  Halaman dapat diakses lewat jalur tanpa izin -> MERAH.
- AC-KOM-6 Tanpa aksi uang: DOM halaman tidak memuat tombol/tautan
  bayar/posting/jurnal dan tidak ada form mutasi apa pun. Muncul
  satu saja -> MERAH.
- AC-KOM-7 Kosong: masa tanpa faktur lunas -> notice tetap tampil +
  kata kosong §2(f), tanpa baris hantu dan total 0 dari loader.
- AC-KOM-8 Snapshot: faktur penjual yang kini nonaktif tetap tampil
  (BR-KOM-08); mengganti salesEmployeeId master/quotation berjalan
  tidak mengubah rekap masa lalu (snapshot faktur).
- Edge: dua penjual bernama sama (dibedakan salesEmployeeId, bukan
  digabung berdasar nama); nama penjual kosong dari relasi (tampil
  "—"); masa satu hari; batas masa inklusif mengikuti loader
  (date gte/lte); grandTotal desimal (sen-aman builder, UI hanya
  format); ekspor memuat notice.

### 8. Backlog implementasi (ID induk F-2026-10-21-016; spec ini F-2026-10-22-053-S)

Urutan: (1) BOT 2 bangun halaman + kartu dari §2 memakai loader
existing apa adanya (tanpa perubahan src/lib/reports/**; bila merasa
perlu ubah loader = berhenti, HANDOFF BOT 3/BOT 5 — kontrak berubah);
(2) BOT 6 nilai §7 atas head BOT 2; (3) Q-KOM-1 hanya bila tarif akan
diatur (BOT 4 vonis dulu, lalu BOT 3 setting+loader, UI persen menyusul
sesudahnya — bukan di PR UI ini); (4) tahap 3 jurnal tetap
DITUNDA-TEKNIS sampai vonis Lead + BOT 4 dibuka kembali. Butuh putusan
accountant untuk UI ini: TIDAK (tidak ada angka baru; Q-KOM-1 terpisah).

### Yang TIDAK diusulkan run ini
- Setting persen per kategori, drill-down per faktur, target penjualan
  per penjual (F-2026-10-21-018 wilayahnya), slip/komisi perorangan
  untuk karyawan, jurnal/pembayaran komisi — ditolak/ditunda dengan
  alasan di §3/§5; bukan hilang, tercatat di sini.

---

## VONIS BOT 4 2026-10-22 — F-2026-10-22-038 PPh 4(2) final sewa tanah dan/atau bangunan ABSEN

Catatan terbit (2026-10-22): vonis ini ditulis sebagai draf lokal
02:25 WIB sebelum implementasi; implementasi BOT 3 PR #408 merged
8645dc1d mendahuluinya. Substansi tidak berubah; rujukan akun pada
putusan 2 dikoreksi ke final 210206 per vonis F-041 (PR #394 merged).
Status kata "ABSEN" di bawah adalah kondisi saat vonis ditulis.

Status: ABSEN (grep origin/main 2026-10-22). `src/lib/tax/withholding-certificate.ts`
hanya mengenal PPh 4(2) konstruksi (`Pph42ConstructionObject`, tarif ikut
kode 1,75/2,65/3,5/4/6%; tes `tax-verdicts.test.ts` hanya `28-409-01`);
kata "sewa" nol di berkas itu. Seed `WITHHOLDING_TAX_TYPES`
(`src/lib/setup/base-data.ts`) hanya PPH22/PPH23-JUAL/PPH23-BELI tertaut
210202; komentar seed mengakui final "tetap dibuat manual". COA sudah
punya 600019 Beban Sewa Gedung + 110502 Sewa Gedung Dibayar Dimuka —
transaksinya nyata, perlakuan pajaknya belum.

Dasar: PP No. 34 Tahun 2017 tentang Pajak Penghasilan atas Penghasilan
dari Persewaan Tanah dan/atau Bangunan (JDIH BPK
https://peraturan.bpk.go.id/Details/64693/pp-no-34-tahun-2017, diakses
2026-10-22): persewaan tanah dan/atau bangunan terutang PPh Pasal 4 ayat
(2) final 10% dari jumlah bruto. Final = bukan kredit pajak.

Keputusan BOT 4:
1. Jenis bawaan baru PPh 4(2) sewa: tarif 10% di master bertanggal
   efektif, pasal snapshot `PPh4(2)`, kode objek WAJIB dipilih per
   penerbitan bupot sesuai ketentuan DJP berlaku (tanpa kode = tolak,
   pola `resolvePph42Rate`; JANGAN pinjam kode konstruksi 28-409-xx).
2. Akun liabilitas terpisah dari 210202: akun baru Utang PPh Final
   Sewa. Usulan awal kode 210205 DIGANTI vonis F-041 (PR #394 merged)
   menjadi 210206 "Utang PPh 4(2) Sewa Tanah/Bangunan" (210205 tetap
   Provisi Garansi F-021); akun kosong = fail-closed berisik, dilarang
   fallback akun PPh 23. Sudah terimplementasi PR #408 merged 8645dc1d.
2. Akun liabilitas terpisah dari 210202 (usulan akun baru Utang PPh
   Final Sewa, kode 210205 bebas terverifikasi di COA bawaan); akun
   kosong = fail-closed berisik, dilarang fallback akun PPh 23.
3. Jurnal penyewa (kita memotong): terima tagihan Dr Beban Sewa/Cr
   Utang Usaha bruto; bayar Dr Utang Usaha bruto / Cr Kas 90% / Cr
   Utang PPh Final Sewa 10%; setor Dr Utang PPh Final Sewa / Cr Kas.
   Sewa dibayar di muka tetap lewat 110502; potongan saat pembayaran.
4. Jurnal pihak menyewakan (kita dipotong): pendapatan bruto penuh;
   terima Dr Kas 90% + Dr Beban PPh Final 10% / Cr Piutang bruto.
   DILARANG catat sebagai PPh dibayar di muka/kredit pajak.
5. Snapshot beku: tarif/kode/DPP disalin ke bupot saat terbit; edit
   master sesudah itu tidak mengubah bupot terbit (pola falsifikasi
   F-003f yang sudah teruji).
6. Cakupan: HANYA persewaan tanah dan/atau bangunan. Komponen jasa
   pendamping dinilai terpisah; pengalihan hak tanah/bangunan (PP
   34/2016) di luar vonis ini — `BUTUH-VONIS-AKUNTAN` bila dibangun.

Falsifikasi wajib (BOT 6): bruto Rp100.000.000 → potong Rp10.000.000,
kas neto Rp90.000.000; cabut penjaga kode-objek-wajib → MERAH; ganti
resolver sewa ke tarif konstruksi → MERAH; edit tarif master sesudah
bupot terbit → bupot tidak berubah.

Pemilik berikutnya: BOT 3 (backend: seed jenis + resolver + tes),
BOT 2 (UI sesudah kontrak stabil), BOT 6 (acceptance di atas). Artikel
Feed: feed-2026-10-22-pph42-sewa-tanah-bangunan-gap.

## VONIS BOT 4 2026-10-22 — F-2026-10-22-039 Komponen pendamping + sewa dibayar di muka PPh 4(2) final

Status: PUTUSAN BOT 4, lanjutan non-duplikat F-038. F-038 telah putus tarif
10%, jenis bawaan, kode objek wajib, akun liabilitas sewa, snapshot beku, dan
10%, jenis bawaan, kode objek wajib, akun usulan 210205, snapshot beku, dan
"komponen jasa pendamping dinilai terpisah". F-039 ini memutus rincian kata
"terpisah" itu (batas DPP final vs PPh 23), saat potong sewa dibayar di muka,
peta pemotong, dan bukti/setor/lapor. Spec operasional BOT 5 t_64afcbb5 masih
running saat vonis ini ditulis — vonis ini tidak menunggu spec itu dan tidak
bertentangan dengan F-038; BOT 5 wajib menyesuaikan tabel operasionalnya ke
peta di bawah, pertanyaan klasifikasinya yang menyentuh putusan 1-2 ditutup
oleh vonis ini. Tanpa kode/schema/migrasi.

Dasar resmi (semua diakses 2026-10-22):
- PP No. 34/2017 Pasal 2-4 (berlaku 02-01-2018; JDIH BPK
  https://peraturan.bpk.go.id/Details/64693/pp-no-34-tahun-2017 + teks PDF
  JDIH Kemenkeu https://jdih.kemenkeu.go.id/api/download/fulltext/2017/34TAHUN2017PP.pdf):
  PPh final 10% x jumlah bruto nilai persewaan; bruto = "semua jumlah yang
  dibayarkan atau yang diakui sebagai utang oleh Penyewa dengan nama dan
  dalam bentuk apapun yang berkaitan dengan tanah dan/atau Bangunan yang
  disewa termasuk biaya perawatan, biaya pemeliharaan, biaya keamanan,
  biaya layanan, dan biaya fasilitas lainnya, baik yang perjanjiannya dibuat
  secara terpisah maupun yang disatukan" (Pasal 4 ayat (2)). Penjelasan
  Pasal 4 ayat (2) memberi contoh resmi: sewa Rp200jt + service charge
  (keamanan/kebersihan/perawatan, kewajiban pemilik gedung) Rp15jt ditagih
  lewat pengelola -> dipotong final 10% x Rp215jt = Rp21,5jt oleh penyewa;
  fee manajemen yang dibayar pemilik gedung ke pengelola = jasa manajemen,
  kena rezim jasa (bukan final sewa).
- PP 34/2017 Pasal 3: pemotong = badan pemerintah, subjek pajak badan
  dalam negeri, penyelenggara kegiatan, BUT, kerja sama operasi, perwakilan
  perusahaan luar negeri, dan orang pribadi WP dalam negeri yang DITUNJUK
  DJP. Penyewa bukan pemotong -> penerima penghasilan setor sendiri.
  Keduanya wajib setor + lapor. Halaman DJP "PPh Pasal 4 ayat (2)"
  (https://pajak.go.id/id/pph-pasal-4-ayat-2): orang pribadi ditunjuk =
  pekerjaan bebas tertentu (akuntan/arsitek/dokter/notaris/PPAT selain
  Camat/pengacara/konsultan) + orang pribadi berusaha menyelenggarakan
  pembukuan, terdaftar WP dalam negeri.
- Saat terutang: pemotong wajib potong "saat pembayaran atau terutangnya
  sewa (mana yang lebih dahulu)" — diringkas DJP/Kring Pajak, dikutip DDTC
  (https://news.ddtc.co.id/berita/nasional/1802427/pph-final-sewa-tanahbangunan-dipotong-penyewa-begini-aturannya,
  akses 2026-10-22). PP 34/2017 sendiri tidak memuat pasal saat-terutang
  eksplisit selain definisi bruto "dibayarkan atau diakui sebagai utang";
  BOT 4 memakai patokan DJP itu sebagai dasar build (label: interpretasi
  administrasi DJP, bukan bunyi PP).
- Bukti potong: PER-24/PJ/2021 Lampiran B memuat kode objek 28-403-02
  "Persewaan tanah dan/atau bangunan" (PDF DJP
  https://www.pajak.go.id/sites/default/files/Lampiran_PER-24_PJ_2021.pdf);
  satu bupot = 1 pihak dipotong + 1 kode objek + 1 Masa Pajak. Sejak era
  Coretax berlaku PER-11/PJ/2025 (berlaku 22-05-2025; PDF DJP
  https://www.pajak.go.id/sites/default/files/lampiran/PER-11_PJ_2025_0.pdf)
  — kode objek WAJIB dibaca dari lampiran peraturan DJP yang berlaku saat
  implementasi, jangan hardcode dari vonis ini selain nilai referensi
  28-403-02 di atas. KJS setor 411128-403 "PPh Final Pasal 4 ayat (2) atas
  Persewaan Tanah dan/atau Bangunan" (DJPb Kemenkeu
  https://djpb.kemenkeu.go.id/kppn/tapaktuan/id/informasi/perpajakan/pph-pasal-4-ayat-2.html).
- Batas setor/lapor BERUBAH di era Coretax: PMK 81/2024 (berlaku 01-01-2025;
  JDIH Kemenkeu https://jdih.kemenkeu.go.id/dok/pmk-81-tahun-2024) Pasal 94
  ayat (2): pembayaran/penyetoran PPh Pasal 4 ayat (2) — dipotong MAUPUN
  setor sendiri — paling lambat tanggal 15 bulan berikutnya sesudah Masa
  Pajak berakhir (Pasal 100: jatuh tempo hari libur -> hari kerja
  berikutnya). Ini MENGGANTIKAN rezim lama PMK 242/PMK.03/2014 (potong tgl
  10 / sendiri tgl 15) yang masih tampil di halaman DJP/DJPb lama di atas —
  halaman lama itu JANGAN dijadikan dasar tenggat build. Pelaporan SPT
  Masa PPh Unifikasi tetap paling lama 20 hari sesudah Masa Pajak berakhir
  (PER-24/PJ/2021 -> PER-11/PJ/2025). Sistem WAJIB menyimpan tenggat sebagai
  master bertanggal efektif, bukan konstanta kode (prinsip BOT 4).

Putusan 1 — komponen pendamping: IKUT 10% atau pisah PPh 23?
Uji dua gerbang, urutan wajib:
(a) Uji penerima + dasar kewajiban: komponen (perawatan, pemeliharaan,
    keamanan, kebersihan, service charge, fasilitas) yang menjadi
    kewajiban pemilik/pihak menyewakan untuk menyediakan tanah/bangunan
    siap pakai, dan dibayar/diutang penyewa KEPADA pemilik (termasuk
    ditagih/diteruskan lewat pengelola gedung sebagai penagih pemilik)
    = masuk DPP PPh 4(2) final 10%, WALAU perjanjian/invoice terpisah.
    Pemisahan dokumen TIDAK mengubah perlakuan (Pasal 4 ayat (2) eksplisit).
(b) Komponen hanya keluar dari DPP final bila KEDUANYA terbukti: (i)
    penerima sebenarnya pihak ketiga independen (bukan pemilik, bukan
    penagih untuk pemilik), dan (ii) jasa itu bukan kewajiban pemilik
    dalam persewaan (dipilih/dicontract penyewa sendiri, mis. jasa
    keamanan khusus tenant, cleaning unit khusus, utilitas atas nama
    tenant dibayar langsung ke PLN/pengelola sebagai penerima jasa).
    Maka ikut rezim jasa PPh 23 2% dari jumlah bruto (UU PPh Pasal 23;
    DJP https://pajak.go.id/id/pph-pasal-2326 — sewa/jasa yang sudah kena
    PPh 4(2) dikecualikan dari PPh 23) dengan kode objek jasa terkait,
    BUKAN kode sewa.
(c) Satu tagihan tercampur tanpa rincian penerima/komponen yang dapat
    dibuktikan = SELURUHNYA DPP final 10% (fail-closed ke final; memecah
    tanpa bukti = tolak). Reimburse utilitas ke pemilik tanpa bukti pihak
    ketiga = ikut 10%. Dilarang memilih tarif lebih rendah demi neto.
Jurnal (ISF penyewa, bruto sebulan sewa 10.000.000 + service charge
kewajiban pemilik 1.500.000): Dr Beban Sewa 10.000.000 + Dr Beban Service
Charge 1.500.000 / Cr Utang Usaha 11.500.000; bayar: Dr Utang Usaha
11.500.000 / Cr Kas 10.350.000 / Cr Utang PPh Final Sewa (210206 per
vonis F-041, PR #394 merged) 1.150.000 (=10% x 11.500.000). Contoh angka: bruto 11.500.000 ->
11.500.000 / Cr Kas 10.350.000 / Cr Utang PPh Final Sewa (210205 usulan
F-038) 1.150.000 (=10% x 11.500.000). Contoh angka: bruto 11.500.000 ->
potong 1.150.000 -> neto kas 10.350.000.
Bila komponen lolos gerbang (b): Dr Beban Jasa terkait / Cr Utang Usaha;
bayar Dr Utang Usaha / Cr Kas 98% / Cr Utang PPh 23 (210202) 2%. Dua bupot
terpisah (kode objek berbeda = bupot berbeda, PER-24/PJ/2021).

Putusan 2 — sewa dibayar di muka multi-bulan: potong SEKALI di muka.
Saat terutang = lebih dulu antara pembayaran dan pengakuan utang. Bayar
12 bulan di muka = utang/pembayaran terjadi sekali atas seluruh nilai
kontrak yang dibayar -> potong 10% SEKALUI atas total bruto yang dibayar,
pada Masa Pajak pembayaran itu (bukan dicicil per bulan pemakaian).
Amortisasi 110502 Sewa Dibayar Di Muka ke beban per bulan TANPA potongan
lagi. Pembayaran termin berikutnya dipotong saat termin itu dibayar/
terutang, atas nilai termin itu. Koreksi/refund sewa: pembetulan bupot +
pembetulan SPT Masa masa asal (mekanisme PER-11/PJ/2025), jurnal reversal
di periode terbuka, dilarang edit jurnal terposting (prinsip BOT 4).
Jurnal ISF penyewa bayar 12 x 10.000.000 = 120.000.000 di muka: Dr Sewa
Dibayar Di Muka (110502) 120.000.000 / Cr Kas 108.000.000 / Cr Utang PPh
Final Sewa 12.000.000; bulanan: Dr Beban Sewa 10.000.000 / Cr 110502
10.000.000 (nol pajak). Contoh: bruto 120.000.000 -> potong 12.000.000 ->
neto 108.000.000.

Putusan 3 — siapa memotong (peta fail-closed):
- Penyewa badan dalam negeri / instansi pemerintah / BUT / KJO /
  penyelenggara kegiatan / perwakilan LN / OP ditunjuk DJP (daftar DJP di
  atas): WAJIB potong, terbitkan bupot ke pemilik, setor 411128-403,
  lapor SPT Masa Unifikasi. ISF sebagai badan: selalu sisi ini saat menyewa.
- Penyewa OP tidak ditunjuk / bukan subjek pajak: DILARANG sistem
  menganggapnya pemotong; pemilik/pihak menyewakan setor sendiri 10%
  (bukti setor-sendiri dicatat di daftar PPh disetor sendiri SPT Masa
  Unifikasi penyewa-penerima, bukan bupot potong pihak lain).
- Status pemotong adalah DATA PIHAK bertanggal (flag + dasar penunjukan),
  bukan ditebak dari nama/jenis tampilan. Status tidak terverifikasi =
  fail-closed berisik: transaksi sewa tidak boleh posting pajak sampai
  status dipilih sadar. ISF menyewakan ke OP umum: jurnal terima Dr Kas
  bruto penuh saat terima, lalu setor sendiri Dr Beban PPh Final / Cr Kas
  10% (bukan kredit pajak, konsisten F-038 putusan 4); ISF menyewa: bila
  counterpart mengklaim "sudah setor sendiri" padahal ISF pemotong =
  klaim ditolak, ISF tetap potong (kewajiban melekat di pemotong).

Putusan 4 — bukti potong + masa setor/lapor:
- Bupot Unifikasi PPh 4(2) per pemilik per Masa Pajak per kode objek
  (referensi 28-403-02), memuat snapshot beku F-038: identitas
  NPWP/NIK + NITKU bila ada, DPP bruto (termasuk komponen putusan 1),
  tarif 10%, PPh dipotong, dokumen dasar (kontrak/invoice/bukti bayar).
  Bupot diserahkan ke pihak dipotong; pembetulan/pembatalan hanya lewat
  dokumen pembetulan/pembatalan + SPT pembetulan, bukan edit senyap.
- Masa Pajak bupot = masa saat terutang putusan 2 (pembayaran multi-bulan
  = satu masa, satu bupot atas total termin itu).
- Setor paling lambat tanggal 15 bulan berikutnya (PMK 81/2024 Pasal 94;
  hari libur -> hari kerja berikutnya Pasal 100), lapor SPT Masa PPh
  Unifikasi paling lama 20 hari sesudah Masa Pajak berakhir
  (PER-11/PJ/2025). Tenggat disimpan di master efektif; UI menampilkan
  snapshot tenggat dari backend, tidak hitung sendiri.

Falsifikasi wajib BOT 6 (tiap skenario MERAH bila penjaga dilonggarkan):
F39-1. Service charge kewajiban pemilik dipisah invoice lalu dipotong 2%
  PPh 23 (resolver mengecualikan komponen "terpisah") -> MERAH: wajib
  10% x (sewa+service charge), akun 210206, kode 28-403-02.
  10% x (sewa+service charge), akun 210205, kode 28-403-02.
F39-2. Sewa 12 bulan dibayar di muka dipotong dicicil 1.000.000/bulan
  mengikuti amortisasi (potong ditunda ke masa pemakaian) -> MERAH:
  wajib 12.000.000 penuh di Masa Pajak pembayaran, amortisasi nol pajak.
F39-3. Penyewa OP tidak ditunjuk diperlakukan pemotong (sistem terbitkan
  bupot atas namanya / pemilik lolos tanpa setor-sendiri) -> MERAH: wajib
  jalur setor-sendiri pemilik + flag status pemotong terverifikasi.
F39-4 (cadangan). Tenggat setor di-hardcode tanggal 10 rezim lama lolos
  tes masa 2025+ -> MERAH: wajib tanggal 15 PMK 81/2024 dari master
  bertanggal efektif.

Pemilik berikutnya: BOT 5 sesuaikan spec t_64afcbb5 ke putusan 1-3 (tabel
transaksi -> gerbang penerima/kewajiban -> rezim); BOT 3 implementasi
sesudah F-038 (kolom rincian komponen + gerbang, resolver cicil-ditolak,
flag status pemotong pihak, master tenggat efektif); BOT 2 tampilkan
rincian DPP + snapshot tenggat backend apa adanya; BOT 6 acceptance
F39-1..F39-3 (+F39-4 bila master tenggat dibangun).

## VONIS BOT 4 2026-10-22 — F-2026-10-22-042-V Jawaban Q-SEWA-1..7 (pelengkap F-038/F-039/F-041)
Status: PUTUSAN BOT 4 (kartu t_f0e26b31). Menjawab tujuh pertanyaan
terbuka BOT 5 di PR #390 (F-2026-10-22-038-S, baris "Pertanyaan terbuka
untuk BOT 4") dan dirujuk ulang PR #393 (F-2026-10-22-040-S). Dokumen
saja; tanpa kode/schema/migrasi. Penomoran: Q-SEWA tetap F-042-V per
usulan kondektur BOT 1 (komentar kartu 2026-10-22 02:42); vonis paparan
kredit F-017 direnumber F-044-V oleh pemilik kartunya — dicatat, bukan
diputus di sini.
### Konsistensi mengikat (jangan dilanggar build)
- Akun liabilitas PPh 4(2) sewa = **210206** Utang PPh 4(2) Sewa
  Tanah/Bangunan (F-041, PR #394). Seluruh tulisan "210205 usulan" di
  vonis F-038 butir 2 dan F-039 (jurnal + falsifikasi F39-1) dibaca
  **210206**; 210205 tetap Provisi Garansi F-021. Akun kosong/nonaktif
  = fail-closed berisik; dilarang fallback ke 210202.
- Mapping jenis: `WITHHOLDING_TAX_TYPES` pola `liabilityAccountCode`
  (PPH42-SEWA -> 210206), BUKAN SystemSetting baru (F-041 putusan 3).
- Tarif 10% hidup di master bertanggal efektif + snapshot beku ke
  bupot/dokumen saat terbit (F-038 butir 1/5). Kode objek dibaca dari
  lampiran peraturan DJP berlaku saat implementasi; referensi
  28-403-02 (PER-24/PJ/2021 Lampiran B) — era Coretax PER-11/PJ/2025.
- Tenggat: setor maks tanggal 15 bulan berikutnya (PMK 81/2024 Pasal
  94 ayat (2), berlaku 01-01-2025), lapor SPT Masa PPh Unifikasi maks
  20 hari sesudah Masa Pajak berakhir (PER-11/PJ/2025). Halaman DJP
  lama bertenggat tanggal 10 BUKAN dasar build (sudah ditegaskan
  F-039; halaman pemotongan DJP yang masih menampilkan "tanggal 10"
  terverifikasi run ini — abaikan untuk tenggat).
### Bukti repo terverifikasi run ini (origin/main 389b2705)
- Repo berjalan hanya mengenal SATU jenis potong + satu nominal per
  tagihan: `VendorBill.withholdingTypeId` + `withholdingAmount`
  (prisma/schema.prisma:1840-1841; bupot `withholdingTypeId`
  schema:1062). Tidak ada kolom rincian komponen per baris tagihan.
  Konsekuensi langsung ke Q-SEWA-2.
- Mesin potong existing memotong saat POSTING tagihan
  (accounting.hook.ts onVendorBillPosted; dirujuk PR #390 BR-SEWA-01).
### Dasar regulasi bersama (diakses 2026-10-22)
- PP No. 34 Tahun 2017 (berlaku 02-01-2018; JDIH BPK
  https://peraturan.bpk.go.id/Details/64693/pp-no-34-tahun-2017;
  teks penjelasan https://www.peraturan.go.id/files/pp34-2017pjl.pdf):
  Pasal 2 ayat (1) objek final, Pasal 2 ayat (3) pengecualian jasa
  pelayanan penginapan, Pasal 3 pemotong, Pasal 4 ayat (1) tarif 10%,
  Pasal 4 ayat (2) definisi jumlah bruto.
- Halaman DJP "PPh Pasal 4 ayat (2)" https://pajak.go.id/id/pph-pasal-4-ayat-2
  (objek: tanah, rumah, rumah susun, apartemen, kondominium, gedung
  perkantoran/pertokoan/pertemuan, rumah kantor, toko, ruko, gudang,
  bangunan industri; tarif 10% x jumlah bruto).
- Artikel DJP "PPh atas Kontrakan Bukan Pajak Baru, Apa Bedanya dengan
  Rumah Kos?" https://www.pajak.go.id/index.php/id/artikel/pph-atas-kontrakan-bukan-pajak-baru-apa-bedanya-dengan-rumah-kos
  + "Intip Pajak Bisnis Kos-kosan" https://www.pajak.go.id/index.php/en/node/84724
  (Pasal 2 ayat (3): jasa pelayanan penginapan = kamar, asrama
  mahasiswa/pelajar, asrama/pondok pekerja, rumah kos — DIKECUALIKAN
  dari final sewa).
- Artikel DJP "Waspadai Salah Tarif PPh Biaya Layanan Gedung!"
  https://www.pajak.go.id/id/artikel/waspadai-salah-tarif-pph-biaya-layanan-gedung
  (biaya layanan kewajiban pemilik = masuk jumlah bruto final 10%
  walau dibayar lewat pengelola; menegaskan F-039 putusan 1).
---
Q-SEWA-1 — Jasa pendamping terpisah kena pasal apa; ISF wajib potong?
JAWABAN: Sudah diputus F-039 putusan 1 — vonis ini menegaskan + menutup.
Perlakuan dua rezim, uji urutan wajib:
(a) Komponen perawatan/pemeliharaan/keamanan/kebersihan/service
    charge/fasilitas yang menjadi KEWAJIBAN pemilik agar tanah/
    bangunan siap pakai, dibayar penyewa kepada pemilik (termasuk
    ditagih/diteruskan lewat pengelola sebagai penagih pemilik) =
    MASUK DPP PPh 4(2) final 10%, walau perjanjian/invoice terpisah
    (PP 34/2017 Pasal 4 ayat (2) + contoh Penjelasan: sewa 200jt +
    service charge 15jt -> dipotong 10% x 215jt). ISF sebagai penyewa
    badan WAJIB memotongnya sebagai bagian DPP sewa, kode objek sewa.
(b) Komponen keluar ke PPh 23 2% dari jumlah bruto HANYA bila KEDUA
    terbukti: penerima sebenarnya pihak ketiga independen (bukan
    pemilik/penagih pemilik) DAN jasa bukan kewajiban pemilik
    (dicontract penyewa sendiri). Dasar: UU PPh Pasal 23; DJP
    https://pajak.go.id/id/pph-pasal-2326 (penghasilan yang sudah
    kena PPh 4(2) dikecualikan dari PPh 23). Bupot terpisah, kode
    objek jasa, akun 210202 — BUKAN 210206.
Larangan: memilih 2% demi neto lebih besar; memecah tanpa bukti
penerima independen. Rumus build BOT 3: DPP_final = sewa + komponen
lolos gerbang (a); potong = 10% x DPP_final -> Cr 210206.
Falsifikasi BOT 6: = F39-1 (service charge terpisah dipotong 2% =
MERAH).
Q-SEWA-2 — Satu tagihan campur: pecah dokumen, pecah baris, dominan?
JAWABAN: Perlakuan fiskal = pecah per komponen menurut Q-SEWA-1/
F-039 (BUKAN perlakuan dominan; dominan DILARANG — tidak ada dasar
"komponen terbesar menentukan tarif seluruh tagihan" di PP 34/2017,
dan Pasal 4 ayat (2) justru menarik komponen pendamping ke DPP final
walau dokumen terpisah). Tanpa rincian penerima/komponen yang dapat
dibuktikan: SELURUH tagihan = DPP final 10% (F-039 putusan 1(c),
fail-closed).
BATAS TEKNIS (inti ditunda-teknis, jangan klaim bisa tanpa migrasi):
repo hari ini satu `withholdingTypeId` + satu `withholdingAmount`
per VendorBill (schema:1840-1841 terverifikasi di atas) — dua rezim
dalam SATU tagihan tidak dapat direpresentasikan tanpa skema rincian
komponen per tagihan (wilayah BOT 3, perlu koordinasi schema; di luar
dokumen ini). DEFAULT AMAN yang berlaku sampai skema itu ada:
(1) tagihan campur tanpa bukti pemisah -> satu jenis PPH42-SEWA,
    DPP = total tagihan, potong 10% -> 210206; (2) pemisahan dua rezim
    hanya sah lewat DUA dokumen tagihan terpisah (dokumen sewa vs
    dokumen jasa pihak ketiga), masing-masing satu jenis potong —
    pola ini tidak butuh migrasi dan WAJIB jadi jalur operasional
    sementara; (3) dilarang mengakali dengan dua bupot manual atas
    satu tagihan tanpa rincian sumber.
Falsifikasi BOT 6: tagihan campur 11.500.000 tanpa rincian dipotong
2% atau dominan-sewa-sebagian = MERAH (wajib 10% x 11.500.000 =
1.150.000 -> 210206); dua dokumen terpisah -> bupot sewa 10% + bupot
jasa 2% sah.
Q-SEWA-3 — Mess/apartemen karyawan + pemilik perorangan berfasilitas:
pengecualian subjek/fasilitas?
JAWABAN: Objek tetap MASUK final sewa. PP 34/2017 Pasal 2 ayat (1)
+ DJP: rumah, apartemen, kondominium termasuk objek; status pemilik
perorangan TIDAK mengeluarkan dari objek (tarif 10% berlaku bagi
penerima OP maupun badan — halaman DJP bagian K). Sewa mess/
apartemen oleh perusahaan untuk karyawan = persewaan bangunan biasa:
ISF penyewa badan = pemotong (Pasal 3), potong 10%, bupot ke pemilik.
PENGECUALIAN satu-satunya yang mengubah rezim: objeknya adalah JASA
PELAYANAN PENGINAPAN beserta akomodasinya — kamar, asrama
mahasiswa/pelajar, asrama/pondok pekerja, rumah kos (Pasal 2 ayat
(3) + Penjelasan; artikel DJP kos di atas). Itu BUKAN sewa final:
tidak dipotong 10%, tidak dibuat bupot sewa; penghasilan pemilik
mengikuti rezim usahanya sendiri (di luar build ISF penyewa).
Batas klasifikasi: "mess karyawan" yang berupa unit apartemen/rumah
disewa dari pemilik dengan kontrak sewa = MASUK 10%. "Pondok pekerja"
yang dijual sebagai jasa penginapan oleh pengelola = KELUAR.
Pembeda = substansi kontrak (sewa ruang vs jasa penginapan +
akomodasi), bukan label nama di invoice. Klasifikasi ragu pada pola
nyata ISF (mis. operator mess dengan layanan makan/laundry menyatu)
= `BUTUH-VONIS-AKUNTAN` per kasus, jangan diputus diam-diam oleh
operator; default build: kontrak bernama sewa atas unit tertentu =
perlakukan MASUK sampai vonis kasus berkata lain (fail-closed ke
potong, karena ISF pemotong menanggung risiko kurang potong).
Falsifikasi BOT 6: sewa apartemen karyawan dipotong 0% beralasan
"pemilik perorangan" = MERAH; tagihan jasa pondok pekerja dipotong
10% jenis sewa = MERAH.
Q-SEWA-4 — Titik potong fiskal: terutang vs bayar vs lebih dulu;
sewa di muka penuh di muka vs ikut masa manfaat?
JAWABAN: Sudah diputus F-039 putusan 2 — ditegaskan mengikat build:
saat terutang = yang LEBIH DULU antara pembayaran dan pengakuan
utang (patokan administrasi DJP atas definisi bruto PP 34/2017
Pasal 4 ayat (2) "dibayarkan atau diakui sebagai utang"; label jujur:
interpretasi administrasi DJP, PP tidak memuat pasal saat-terutang
eksplisit — tercatat di F-039). Sewa dibayar di muka multi-bulan:
potong SEKALI 10% atas total bruto termin yang dibayar, pada Masa
Pajak pembayaran itu; amortisasi 110502 per bulan NOL pajak.
KOREKSI titik operasional BOT 5 (BR-SEWA-01 PR #390): titik
jurnal existing = POSTING VendorBill (pengakuan utang) — ini KONSISTEN
dengan fiskal bila tagihan diposting tidak lebih lambat dari
pembayaran (posting = pengakuan utang = saat terutang tercapai).
Syarat build BOT 3: (i) VendorBill sewa WAJIB diposting sebelum/
bersamaan pembayaran; bayar atas tagihan draft = tolak (jurnal potong
belum lahir = kurang potong); (ii) untuk sewa di muka, tagihan/
pembayaran termin adalah dokumen potongnya — potong penuh termin itu,
JANGAN tunggu amortisasi; (iii) bila praktik menemukan tagihan
diposting SETELAH kas keluar, Masa Pajak bupot mengikuti saat
terutang yang lebih dulu (pembayaran) dan selisih masa ditampilkan
sebagai temuan rekonsiliasi, bukan digeser diam-diam.
Falsifikasi BOT 6: = F39-2 (potong dicicil mengikuti amortisasi =
MERAH) + pembayaran atas VendorBill sewa draft lolos tanpa potongan =
MERAH.
Q-SEWA-5 — Pemilik tanpa NPWP: tarif/kewajiban berubah?
JAWABAN: TETAP 10%, kewajiban potong TIDAK berubah. PP 34/2017
Pasal 4 ayat (1) menetapkan tarif tunggal 10% x jumlah bruto tanpa
pembedaan NPWP; tidak ada tarif lebih tinggi tanpa NPWP di rezim
final sewa (berbeda dari PPh 23 yang punya tarif 100% lebih tinggi
tanpa NPWP — JANGAN pinjam aturan itu ke sewa). Yang berubah hanya
ADMINISTRASI bupot: identitas pihak dipotong diisi NIK bila NPWP
tidak ada (identitas NPWP/NIK + NITKU bila ada — prinsip snapshot
F-038/F-039 putusan 4), dan NPWP kosong TIDAK boleh menggagalkan
potongan maupun dipakai alasan tidak memotong. Batas build BOT 3:
NPWP/NIK keduanya kosong = fail-closed berisik di penerbitan bupot
(bupot tanpa identitas tidak sah diterbitkan), tetapi jurnal potong
di tagihan tetap wajib lahir; antrean "terpotong belum ada bupot"
(F-038-S) menampungnya sampai identitas dilengkapi. Dilarang:
menaikkan tarif, menahan pembayaran neto dengan alasan NPWP, atau
mengarang NPWP.
Falsifikasi BOT 6: pemilik tanpa NPWP dipotong selain 10% (mis. 20%
ala PPh 23) = MERAH; tagihan sewa tanpa NPWP diposting tanpa
potongan = MERAH; bupot terbit dengan identitas kosong = MERAH.
Q-SEWA-6 — DPP final bila tagihan ber-PPN; PPN sewa terutang?
JAWABAN: (a) DPP PPh final = jumlah bruto nilai persewaan TANPA PPN.
PPN bukan penghasilan persewaan pemilik dan bukan "jumlah yang
dibayarkan berkaitan dengan tanah/bangunan yang disewa" dalam arti
Pasal 4 ayat (2) — PPN adalah pajak yang dipungut pemilik PKP untuk
negara atas penyerahan yang sama. Memasukkan PPN ke DPP final =
pajak atas pajak. Rumus build: tagihan bruto komersial dipisah dulu:
DPP_PPN (= nilai sewa + komponen masuk DPP final per Q-SEWA-1) dan
PPN = tarif PPN berlaku x DPP_PPN (dari master PPN bertanggal
efektif; JANGAN hardcode 11% di logika — tarif PPN berubah lewat UU
HPP dan aturan tarif efektif, simpan di master). Potong final =
10% x DPP_PPN. Contoh: sewa 100.000.000, PPN 11% = 11.000.000,
total tagihan 111.000.000 -> potong 10.000.000 (bukan 11.100.000),
kas neto pemilik = 111.000.000 - 10.000.000 = 101.000.000.
(b) PPN atas sewa tanah/bangunan TERUTANG bila pihak menyewakan PKP:
penyerahan jasa persewaan = JKP; DJP menegaskan tarif PPN sewa
gedung 11% dipungut pihak menyewakan PKP (Konsultasi KPP, pajak.go.id
node/109606, akses 2026-10-22). Pemilik non-PKP: tidak memungut PPN,
tagihan tanpa PPN sah — status PKP pemilik adalah DATA PIHAK; sistem
JANGAN menambah PPN sendiri ke tagihan non-PKP dan JANGAN menolak
tagihan ber-PPN hanya karena bupot final juga terbit (dua dokumen
berbeda: faktur pajak masukan jalur TaxInvoice existing vs bupot
PPh — konsisten tabel S10 PR #390). PPN masukan atas sewa untuk
kegiatan usaha kena PPN mengikuti aturan kreditabel umum (UU PPN
Pasal 9); penilaian kreditabel per pemakaian nyata (mis. sewa untuk
kegiatan dibebaskan) = di luar vonis ini, `BUTUH-VONIS-AKUNTAN` bila
pola itu dibangun.
Label kejujuran: pemisahan PPN dari DPP final adalah penerapan
definisi "jumlah bruto nilai persewaan" PP 34/2017 + praktik DJP
(DPP final dan DPP PPN sama-sama dari nilai persewaan sebelum PPN);
tidak ditemukan bunyi pasal eksplisit "tidak termasuk PPN" di PP
34/2017 — bila akuntan eksternal ISF berpendapat lain untuk pola
kontrak gross-up tertentu, tandai kasus itu `BUTUH-VONIS-AKUNTAN`,
default build tetap DPP tanpa PPN.
Falsifikasi BOT 6: tagihan 111.000.000 (termasuk PPN 11jt) dipotong
11.100.000 = MERAH (wajib 10.000.000); tagihan pemilik non-PKP
ditambah PPN oleh sistem = MERAH.
Q-SEWA-7 — ISF pemilik disewa perorangan tak memotong: setor
sendiri/lapor + bukti dicatat?
JAWABAN: Mengikat F-039 putusan 3 dari sisi pemilik. Penyewa OP
bukan pemotong (di luar daftar PP 34/2017 Pasal 3: badan pemerintah,
SP badan DN, penyelenggara kegiatan, BUT, KJO, perwakilan LN, OP
DITUNJUK DJP) -> pemilik/pihak menyewakan SETOR SENDIRI 10% x jumlah
bruto (DJP: penyetoran sendiri lewat e-Bupot "Penyetoran Sendiri"
Coretax; KJS 411128-403; tenggat tanggal 15 bulan berikutnya PMK
81/2024). Perlakuan ISF pemilik: terima kas BRUTO penuh (jangan
kurangi potongan fiktif), pendapatan sewa bruto penuh, lalu setor:
Dr Beban PPh Final Sewa / Cr Kas 10% — beban pajak final pemilik,
BUKAN PPh dibayar di muka/kredit pajak (konsisten F-038 putusan 4:
final tidak dapat dikreditkan). Bukti dicatat ISF: bukti setor
sendiri (NTPN/bukti penerimaan negara) tertaut dokumen penerimaan
sewa, masuk daftar PPh disetor sendiri pada pelaporan masa pemilik
(bukan bupot potong pihak lain). Dilarang: mencatat potongan yang
tidak pernah dilakukan penyewa sebagai piutang pajak, atau
menganggap "penyewa tak memotong = bebas pajak" (tabel P2 PR #390
ditutup: tetap terutang, jalur setor-sendiri).
Falsifikasi BOT 6: penerimaan dari penyewa OP dicatat neto +
"PPh dibayar di muka" = MERAH; penerimaan bruto tanpa jurnal setor
sendiri dan tanpa temuan rekonsiliasi masa = MERAH.
### Rekap batas build BOT 3 (sesudah F-038/F-041, tanpa migrasi di kartu ini)
1. Jenis PPH42-SEWA tarif 10% master efektif, kode objek wajib dari
   lampiran DJP berlaku, liabilityAccountCode -> 210206 (F-041).
2. Default aman Q-SEWA-2: satu jenis per tagihan; campur tanpa bukti
   = 10% total; dua rezim hanya lewat dua dokumen. Skema rincian
   komponen = inti ditunda-teknis (koordinasi schema BOT 3/BOT 4).
3. Gerbang Q-SEWA-1: komponen kewajiban pemilik masuk DPP final;
   keluar ke PPh 23 2% hanya dengan bukti penerima independen.
4. Potong sekali saat terutang lebih dulu (posting tagihan mendahului/
   bersama bayar; draft dibayar = tolak); di muka = penuh per termin.
5. Tanpa NPWP tetap 10%; identitas bupot NPWP/NIK wajib; master
   tenggat tanggal 15 (PMK 81/2024), lapor 20 hari (PER-11/PJ/2025).
6. DPP final tanpa PPN; status PKP pemilik = data pihak; faktur
   pajak dan bupot jalur terpisah.
7. Sisi pemilik: penyewa non-pemotong -> setor-sendiri 10% beban
   final + bukti NTPN tertaut; klasifikasi penginapan vs sewa per
   Q-SEWA-3, ragu kontraktual = BUTUH-VONIS-AKUNTAN per kasus.
Pemilik berikutnya: BOT 3 (seed sewa t_c70095d5 kini TERBUKA sesudah
vonis ini + F-041 masuk repo; tanam 210206, DILARANG 210205 untuk
pajak), BOT 5 (spec F-038-S/F-040-S sesuaikan: akun 210206, titik
potong Q-SEWA-4, default aman Q-SEWA-2), BOT 2 (UI sesudah kontrak
BOT 3: label pasal/kode dari master, tanpa hitung ulang), BOT 6
(falsifikasi per Q di atas + F39-1..F39-4 + F-041).
### Catatan duplikat PR F-041 (BUKAN putusan kartu ini) — TERTUTUP
Duplikat tuntas: PR #395 CLOSED; PR #394 MERGED 486f0f3a
(kanonis F-041). Teks lama menyebut #395 live/CONFLICTING — basi,
ditutup di PR ini per temuan low BOT 6 kartu t_3cc62169.
## VONIS BOT 4 2026-10-22 04:50 WIB — F-2026-10-21-021 §9: deductibility fiskal provisi garansi + urutan koreksi SPT (FINAL tertulis, dok. lanjutan t_8ce683ea)
Pemutus: `accounting-finance-tax` (BOT 4). Kartu: t_8ce683ea (audit antrean
vonis terbuka + riset vonis berikutnya). Tanpa kode/schema/migrasi. Basis
live: origin/main 633d737a (worktree /private/tmp/bot4-f021-fiskal). Vonis
inti F-021 tahap 3 (§0–§9) + lanjutan gerbang G1–G7 tetap berlaku penuh;
seksi ini HANYA menutup butir §9 "Deductibility fiskal provisi untuk SPT:
BUTUH-VONIS-AKUNTAN" dan peringatan §5 "koreksi fiskal akhir tahun di
luar cakupan". Tidak membuka E1/E4 dan bukan izin bangun.
### 0. Putusan ringkas
1. Provisi garansi akuntansi (E1 Dr 510104 Beban Garansi / Cr 210205
   Provisi Garansi) BUKAN biaya fiskal pada tahun pembentukannya.
   Koreksi fiskal POSITIF wajib sebesar beban provisi tahun berjalan
   (510104 dari E1) pada SPT Tahunan PPh Badan tahun itu.
2. Biaya klaim aktual (E2: beban nyata repair covered — material FIFO,
   ProductionCost, jasa) DAPAT dikurangkan fiskal pada tahun biaya itu
   terjadi/terutang, sepanjang memenuhi uji 3M Pasal 6. Pada tahun E2,
   bagian E2 yang didebit ke 210205 (pemakaian provisi) TIDAK dikoreksi
   positif lagi (bukan beban komersial tahun itu) dan TIDAK dikurangkan
   dua kali; bagian E2 yang didebit langsung ke 510104 di tahun yang
   sama (klaim di luar/di atas provisi, mode provisi MATI) dikurangkan
   fiskal tahun itu tanpa koreksi, karena memang biaya aktual.
3. Pelepasan provisi (E4 Dr 210205 / Cr 510104) BUKAN penghasilan fiskal
   dan BUKAN pengurang biaya tahun pelepasan sebesar yang dulu sudah
   dikoreksi positif; koreksi fiskal NEGATIF hanya sebesar saldo yang
   terbukti dulu dikoreksi positif dan kini dilepas tanpa klaim aktual
   menutupinya — wajib ditelusur per kelompok item, bukan global.
4. Recovery supplier (E3 Dr 110508 / Cr 510104): fiskal mengikuti kapan
   hak itu menjadi penghasilan/pemulihan biaya per aturan umum; E3 tidak
   menciptakan koreksi provisi dan tidak mengurangi koreksi positif E1
   (tidak net-off — konsisten §4/§7 AC-G5). Recovery atas biaya yang
   belum pernah dikurangkan fiskal (masih terkoreksi positif) tidak
   boleh dikurangkan/dikenai dua kali; penanganannya = kurangi koreksi
   yang relevan atau akui sesuai dokumen credit note — wajib bukti
   dokumen supplier, bukan snapshot status tautan.
5. Konsekuensi urutan SPT mengikat: jurnal komersial berjalan normal
   sesuai vonis inti; KOREKSI FISKAL hidup di lapis SPT/rekonsiliasi
   fiskal, BUKAN jurnal balik dan BUKAN penghapusan provisi dari GL.
   Dilarang menghapus/menolakkan provisi komersial demi menyamakan
   fiskal — PSAK 57 kewajiban present tetap berdiri; beda temporer
   ditangani di kertas kerja fiskal (dan pajak tangguhan di luar
   cakupan vonis ini).
### 1. Dasar resmi (diverifikasi run ini, bukan kutipan sekunder saja)
- UU PPh: UU 7/1983 stdtd UU 36/2008 (teks UU 36/2008 juga membawa
  rumusan sesudah UU HPP untuk Pasal 9 ayat (1) huruf c dalam hasil
  pencarian resmi; substansi tidak berubah): Pasal 9 ayat (1) huruf c —
  pembentukan/pemupukan dana cadangan TIDAK boleh dikurangkan, kecuali
  daftar tertutup: (1) cadangan piutang tak tertagih untuk bank dan
  badan usaha lain penyalur kredit, sewa guna usaha dengan hak opsi,
  perusahaan pembiayaan konsumen, anjak piutang; (2) cadangan usaha
  asuransi termasuk cadangan bantuan sosial BPJS; (3) cadangan
  penjaminan LPS; (4) cadangan biaya reklamasi pertambangan; (5)
  cadangan biaya penanaman kembali kehutanan; (6) cadangan biaya
  penutupan dan pemeliharaan tempat pembuangan limbah industri.
  Provisi garansi penjual/bengkel TIDAK ada di daftar ini. Sumber:
  https://pajak.go.id/sites/default/files/UU%20PPh%20No%2036%20Th%202008.pdf
  dan halaman peraturan DJP
  https://www.pajak.go.id/id/pembentukan-atau-pemupukan-dana-cadangan-yang-boleh-dikurangkan-sebagai-biaya
  (akses 2026-10-22).
- PMK 81/PMK.03/2009 tentang Pembentukan atau Pemupukan Dana Cadangan
  yang Boleh Dikurangkan sebagai Biaya, diubah PMK 219/PMK.011/2012
  (JDIH Kemenkeu: https://jdih.kemenkeu.go.id/dok/81-pmk-03-2009):
  hanya mengoperasionalkan enam jenis cadangan Pasal 9 ayat (1) huruf c
  itu. Tidak ada cadangan garansi produk/jasa non-asuransi. PMK
  74/2024 (cadangan piutang tak tertagih) tidak relevan dengan garansi
  — jangan dipakai sebagai dasar analogi.
- Pasal 6 ayat (1) UU PPh: biaya yang boleh dikurangkan = biaya untuk
  mendapatkan, menagih, dan memelihara penghasilan (3M), termasuk biaya
  pembelian bahan dan biaya berkenaan pekerjaan/jasa. Biaya klaim
  garansi aktual memenuhi 3M karena melekat pada penjualan yang sudah
  diakui penghasilannya dan kewajiban garansi assurance dari kontrak
  penjualan itu; provisi estimasi belum memenuhi realisasi biaya
  (belum ada pengeluaran/kewajiban aktual ke pihak luar sebesar
  estimasi kelompok) — inilah garis Pasal 6 vs Pasal 9 huruf c.
- PSAK 57 (vonis inti §8) tetap dasar komersial: provisi diakui bila
  kewajiban kini + arus keluar probable + estimasi andal. Fiskal tidak
  membatalkan pengakuan komersial; ia hanya menolak pembebanannya
  sampai biaya aktual terjadi.
### 2. Syarat (semua wajib)
S1. Rekonsiliasi fiskal per kelompok item sama dengan kunci provisi
    komersial vonis inti (itemGroupId bila inti dibuka): saldo awal
    210205, + E1, − E2 (porsi provisi), − E4, = saldo akhir; koreksi
    positif tahun = E1 tahun itu; koreksi negatif tahun = E4 yang
    terbukti dari tumpukan sudah-terkoreksi; biaya aktual terkurangkan
    = E2 aktual (porsi 510104 langsung + porsi pemakaian provisi yang
    biayanya terjadi tahun ini, ditandai bukan beban komersial tahun
    berjalan). Satu kelompok tidak menutup koreksi kelompok lain.
S2. Bukti biaya aktual E2 = dokumen sumber (MaterialIssue completed,
    ProductionCost, VendorBill jasa repair) tertaut klaim/WO repair —
    sama gerbang G4 vonis inti. Estimasi, persen master, dan rekap
    informatif BUKAN bukti fiskal.
S3. Tahun pengakuan fiskal = tahun biaya aktual terutang/terjadi per
    dokumen sumber, BUKAN tahun pembayaran kas semata dan bukan tahun
    penjualan awal (kecuali biaya memang terjadi tahun itu). Pemotongan
    periode (cut-off) mengikuti tanggal dokumen sumber pola laporan
    existing; jurnal di periode terkunci tetap ditolak (G6/AC-G8).
S4. Untuk SPT: lapis koreksi ditampilkan terpisah dari jurnal komersial
    (kertas kerja/rekonsiliasi), memuat akun 510104/210205 dan rujukan
    kelompok; angka SPT tidak membaca saldo provisi seolah biaya.
S5. Bila E1/E4 kelak diaktifkan (gerbang data 12 bln/30 klaim + kartu
    aktivasi terpisah): vonis ini berlaku sejak E1 pertama; tanpa E1,
    hanya butir 2 (biaya aktual mode MATI) dan butir 4 yang hidup.
### 3. Larangan
L1. Jangan jadikan provisi garansi (E1) biaya fiskal tahun pembentukan,
    jangan sebut "cadangan garansi deductible" di UI/laporan/SPT.
L2. Jangan kurangkan E2 dua kali (sekali saat E1 dikoreksi longgar,
    sekali saat klaim aktual) — desain S1 mencegahnya; pelanggaran =
    temuan audit.
L3. Jangan net-off recovery E3 terhadap provisi/koreksi; jangan akui
    recovery dari status tautan drafted/sent (vonis F-022 tetap).
L4. Jangan buat jurnal fiskal di GL untuk koreksi ini (tidak ada Dr/Cr
    koreksi fiskal di buku komersial); jangan hapus provisi komersial
    agar fiskal "bersih".
L5. Jangan perluas analogi PMK 81/2009 cadangan asuransi/piutang ke
    garansi bengkel; usaha ISF bukan usaha asuransi/penyalur kredit
    untuk daftar Pasal 9 ayat (1) huruf c itu.
### 4. Batas build
- BOT 3: TIDAK ada build dari vonis ini sekarang. Inti F-021 tetap
  menunggu G1 Lead + rute provisi MATI (E2/E3) per vonis lanjutan.
  Bila kelak laporan SPT/rekonsiliasi fiskal dibangun: baca jurnal
  E1/E2/E4 + saldo 210205 per kelompok dari GL existing, tampilkan
  koreksi positif/negatif sebagai baris rekonsiliasi (bukan jurnal),
  fail-closed bila mapping warranty* kosong (pola §0.4/G6); berhenti
  dan eskalasi BOT 4 bila bentuk biaya aktual di luar E2 hendak
  diklaim deductible.
- BOT 2: tidak ada UI dari vonis ini. Label dilarang: "biaya garansi
  dapat dikurangkan" untuk provisi; yang sah ditampilkan hanya angka
  komersial + baris koreksi fiskal apa adanya dari backend.
- BOT 5: tidak ada angka statutori baru; spec SPT kelak merujuk vonis
  ini + vonis inti §5, bukan mengarang perlakuan provisi.
### 5. Draf acceptance BOT 6 (untuk kartu SPT/rekonsiliasi kelak)
AC-F1. Tahun ada E1 10jt, tanpa klaim: SPT koreksi positif 510104
  tepat 10jt; GL tetap memuat E1 seimbang; cabut baris koreksi ->
  tes rekonsiliasi MERAH (falsifikasi).
AC-F2. Tahun berikut klaim aktual 6jt diposting E2 dari provisi:
  biaya fiskal terkurangkan 6jt tahun itu, koreksi positif baru 0
  untuk porsi itu, saldo 210205 turun 6jt, tidak ada pengurangan ganda
  (total fiskal dua tahun = 6jt, bukan 16jt/10jt).
AC-F3. Mode MATI tanpa E1: klaim aktual 6jt ke 510104 langsung =
  deductible tahun itu tanpa koreksi positif/negatif provisi.
AC-F4. E4 lepas 4jt dari tumpukan sudah-terkoreksi: koreksi negatif
  4jt tahun lepas; E4 atas tumpukan tidak pernah dikoreksi (data
  sebelum vonis, bila ada) = koreksi negatif 0 untuk porsi itu,
  ditandai.
AC-F5. Recovery supplier virtually-certain atas klaim yang biayanya
  sudah terkurangkan: perlakuan dokumen credit note terbaca; recovery
  possible: nol efek fiskal tahun itu.
### 6. Urutan antrean vonis yang diaudit run ini (bukti kartu t_8ce683ea)
Antrean dinyatakan KOSONG untuk vonis baru yang menghalangi; yang ada =
finalisasi merge/duplikat, bukan putusan tertunda. Daftar cek dan hasil
live (2026-10-22 04:43–04:50 WIB) ditulis di komentar kartu t_8ce683ea
dan STATUS board run ini; vonis ini (§F-021 §9) dipilih sebagai riset
vonis berikutnya karena satu-satunya label BUTUH-VONIS-AKUNTAN yang
masih terbuka di backlog main.

---

## VONIS BOT 4 2026-10-22 — F-2026-10-22-057-V bentuk data F-055 lanjutan (status pemotong bertanggal efektif, alokasi sumber setor-sendiri, katalog kode+nama satu sumber)

Pemilik vonis: BOT 4 (accounting-finance-tax). Tertulis saja, tanpa
kode/schema/migrasi — BOT 3 pemilik skema final sesudah koordinasi
board. Melengkapi F-2026-10-22-055-V (PR #436 OPEN) §4-§5: vonis itu
menetapkan KEWAJIBAN datanya; vonis ini menetapkan BENTUK datanya.
Kartu: `t_4a7ae40d`; pemicu: analisis BOT 3 `t_bc660350` atas
`origin/main` (katalog merged PR #428; `WithholdingTaxType` belum
punya nama-per-kode/`effectiveFrom`; `Customer`/`Vendor` belum punya
status pemotong bertanggal; `TaxPayment` belum punya model alokasi).

### 1. Status pemotong per pihak — TABEL KHUSUS histori bertanggal efektif

Fakta: pihak dalam sewa bisa `Vendor` (pemilik) maupun pihak lawan
umum; `Customer.taxId`/`Vendor.npwp` hanya identitas pajak, bukan
status pemotong. `ActivityLog` (`oldValues`/`newValues` Json) cocok
jejak audit, tidak bisa ditanya "status efektif pada tanggal X".

VONIS:

- Bentuk: TABEL HISTORI KHUSUS satu baris per masa berlaku status,
  BUKAN kolom boolean di `Customer`/`Vendor` dan BUKAN Json bebas.
  Kolom wajib per baris: pihak (rujukan polimorfik disiplin:
  `partyType` `customer|vendor` + `partyId`, ATAU dua FK nullable
  dengan tepat satu terisi — BOT 3 pilih satu pola, konsisten),
  `status` (`pemotong|non_pemotong`), `effectiveFrom` (tanggal),
  `effectiveTo` (tanggal, nullable = masih berlaku), `basisType`
  (kategori dasar: penunjukan instansi/badan/penunjukan DJP/lainnya
  bernama), `basisNumber` + `basisDate` (nomor+tanggal dokumen dasar;
  wajib terisi untuk `status=pemotong`), `basisNote` (teks bebas
  pendamping, tidak pernah satu-satunya dasar), `createdBy`,
  `createdAt`. Uang tidak terlibat; tanggal = tanggal kalender.
- Aturan bentuk (fail-closed, ditegakkan service dalam tx):
  (a) baris untuk pihak yang sama DILARANG tumpang tindih masa
  (`effectiveFrom <= effectiveTo`, masa bersebelahan sah);
  (b) status dibaca = baris tunggal yang memuat `withholdingDate`;
  nol baris memuat tanggal itu = status TIDAK DIKETAHUI -> transaksi
  sewa pihak itu DITOLAK terbit/setor (bukan default non-pemotong);
  (c) baris histori TIDAK diedit/dihapus sesudah dipakai transaksi:
  koreksi = tutup masa (`effectiveTo`) + baris baru; hapus hanya
  baris yang belum pernah dirujuk dan belum berlaku (BOT 3 tetapkan
  penjaga rujukan);
  (d) ubah status wajib `basis*` terisi untuk klaim pemotong; klaim
  non-pemotong wajib `basisNote` alasan bernama (mis. "OP tidak
  ditunjuk") — kosong = DITOLAK.
- Audit: `ActivityLog` WAJIB ditulis tiap buat/tutup baris
  (`modelType` tabel histori, `modelId`, `oldValues`/`newValues`
  memuat status+masa+dasar) — ActivityLog = jejak siapa-kapan;
  tabel histori = sumber kebenaran efektif-per-tanggal. ActivityLog
  SAJA ditolak sebagai penyimpan status (tidak bisa query efektif).
- Hak ubah: hanya peran dengan izin kelola pajak yang sudah ada di
  katalog izin (keluarga `manage_*` pajak; BOT 3 pakai izin persis
  katalog, BUKAN izin baru karangan dan BUKAN izin setor
  `create_tax_payments`). BOT 2 hanya tampilkan status+masa+dasar.

### 2. Alokasi sumber setor-sendiri Kasus C — MODEL ALOKASI banyak baris, total = amount

Fakta: pola rumah sudah ada: `VendorPaymentAllocation`
(`vendorPaymentId`+`vendorBillId`+`amount Decimal(15,2)`).
`TaxPayment.amount Decimal(15,2)`; kolom setor (`period`,
`billingCode`, `ntpn`, `taxKind`, `taxTypeId`) sudah ada (F-055-V §5).

VONIS:

- Bentuk: MODEL ALOKASI ANAK baru (pola `VendorPaymentAllocation`):
  satu `TaxPayment` setor-sendiri (`taxKind='pph4_2'`) punya N baris
  alokasi; tiap baris: `taxPaymentId`, rujukan transaksi sumber sewa
  (dokumen sumber persis yang BOT 3 petakan dari jalur sewa — invoice/
  tagihan sewa sumber Kasus C; BUKAN bupot, Kasus C tanpa bupot),
  `amount Decimal(15,2)` sen persis. Satu baris sah (N=1); digunggung
  banyak sumber = N>1.
- Penjaga (service dalam tx yang sama dengan simpan `TaxPayment`,
  idempotency key mutasi finansial tetap wajib):
  (a) `SUM(alokasi.amount)` WAJIB = `TaxPayment.amount` persis sen;
  selisih != 0 (kurang ATAU lebih, termasuk 0,01) = DITOLAK
  fail-closed — DILARANG pembulatan penyesuaian diam-diam dan
  DILARANG baris "selisih" karangan;
  (b) tiap `alokasi.amount` > 0; sumber sama DILARANG dobel dalam
  satu setoran (gabung jadi satu baris);
  (c) sumber yang sudah teralokasi PENUH ke setoran posted lain
  DILARANG dialokasi lagi melewati PPh terutang sumber itu
  (cegah setor dobel satu kewajiban); alokasi parsial ke satu sumber
  boleh selama kumulatif <= terutang sumber (BOT 3 kunci di tx);
  (d) `TaxPayment` setor-sendiri tanpa baris alokasi = TIDAK SAH
  simpan sebagai posted; draf tanpa alokasi boleh hanya bila status
  memang draf dan tidak masuk rekonsiliasi lunas.
- Contoh sen: terutang 3 invoice sewa @10.350.000,00 digunggung satu
  SSP 31.050.000,00 -> 3 baris @10.350.000,00, total 31.050.000,00 =
  amount LULUS. Alokasi 31.049.999,99 atau 31.050.000,01 -> DITOLAK.
  Satu invoice 10.350.000,00 disetor sendiri tunggal -> 1 baris
  10.350.000,00 LULUS.
- Jurnal tidak berubah oleh alokasi: alokasi = tautan rekonsiliasi,
  bukan jurnal; jurnal setor tetap dari `TaxPayment` (F-038/F-039).

### 3. Nama per kode DJP + effectiveFrom katalog — SATU baris katalog per (kode, masa efektif)

Fakta: katalog DJP (template BPPU resmi, F-051-V/F-055-V §2) memuat
kode+nama+tarif dalam satu tabel; `WithholdingTaxType` hari ini satu
baris per jenis (`objectCode` tunggal nullable, `rate`, `isActive`
boolean tanpa masa).

VONIS:

- Bentuk: nama resmi per kode, tarif per kode, dan masa efektif hidup
  di BARIS KATALOG YANG SAMA (satu sumber, satu `effectiveFrom` +
  `effectiveTo` nullable per baris kode) — DILARANG tabel nama terpisah
  dengan tanggal efektif sendiri (bisa selisih versi dari tarif).
  Bentuk fisik (kolom baru di `WithholdingTaxType` vs tabel katalog
  anak per kode) = pilihan BOT 3 sesudah koordinasi board, dengan
  syarat: resolusi per `withholdingDate` mengembalikan kode+nama+
  tarif dari SATU baris efektif yang sama.
- Aturan: (a) baris katalog tanpa `nama resmi` = TIDAK AKTIF untuk
  pemilih kode, walau tarif ada (fail-closed tanpa nama, F-055-V §2);
  (b) masa baris kode sama dilarang tumpang tindih; tanggal acuan
  resolusi = `withholdingDate` (F-055-V §3); nol baris efektif pada
  tanggal itu = DITOLAK `RENT_TAX_TYPE_INACTIVE`/setara bernama;
  (c) perubahan nama/tarif = baris efektif baru, bukan edit baris
  yang sudah membeku di bupot terbit (snapshot bupot tetap);
  (d) seed katalog awal hanya kode sah F-051-V (`28-403-02` default,
  `28-403-04` bersyarat bukti) dengan nama persis katalog DJP;
  kode di luar katalog DITOLAK, dilarang seed tebakan.

### 4. Batas build + acceptance BOT 6 (draf siap angkat)

- BOT 3: ajukan bentuk fisik §1-§3 ke board/BOT 1 sebelum migrasi
  (klaim file `prisma/schema.prisma` di board); semua penjaga di
  service dalam tx; snapshot bupot/setor tidak berubah oleh edit
  master sesudahnya; migrasi diuji `prisma validate` + scratch DB.
- BOT 2: tampilkan status pemotong (status+masa+dasar), nama katalog,
  dan total alokasi vs amount apa adanya dari backend; UI tidak
  menentukan status/kewajiban dan tidak membulatkan selisih.
- Acceptance BOT 6 (falsifikasi — MERAH bila penjaga dicabut):
  F56-1 status efektif pada `withholdingDate` lampau dibaca status
  hari ini -> MERAH; F56-2 nol baris status memuat tanggal potong
  -> terbit lolos = MERAH (wajib ditolak); F56-3 ubah status
  pemotong tanpa nomor/tanggal dasar -> tersimpan = MERAH +
  ActivityLog wajib ada; F56-4 masa status tumpang tindih tersimpan
  = MERAH; F56-5 alokasi total != amount sebesar 0,01 -> tersimpan
  posted = MERAH; F56-6 sumber sama dialokasi dobel melewati
  terutang -> MERAH; F56-7 katalog kode tanpa nama tampil di pemilih
  = MERAH; F56-8 nama/tarif dibaca dari dua baris efektif berbeda
  tanggal -> MERAH; F56-9 edit baris katalog/status yang sudah
  membeku mengubah bupot/setor terbit -> MERAH.
- Klaim kepatuhan: vonis ini mengatur bentuk data internal; BUKAN
  klaim lapor SPT sah. Dasar tetap F-055-V: PER-11/PJ/2025,
  PMK-231/PMK.03/2019 jo. perubahannya, PMK-80/PMK.03/2024,
  UU 28/2007 — diakses 2026-10-22; label BUTUH-VERIFIKASI-BOT6
  F-055-V §6 tetap berlaku.

ID vonis ini **F-2026-10-22-057-V** (sesudah 055-V PR #436; 054 =
spec BOT 5; 056-V sudah dipakai vonis Q-KOM-1 PR #440 — renumber
sesudah tabrakan ID terdeteksi, isi vonis nol berubah). Pemilik berikutnya: BOT 3 (bentuk fisik + migrasi
sesudah #436 merged dan koordinasi board) -> BOT 2 -> BOT 6 §4.


---

## VONIS BOT 4 2026-10-22 — F-2026-10-22-066-V: scrap/yield produksi — batas normal vs abnormal + akun beban periode (pelengkap F-2026-10-21-008)

Pemutus: BOT 4 (accounting-finance-tax). Kartu: t_c4c5c0b3 (siklus
standby 11:06 — antrean vonis terbit terbukti semua ter-gate merge
Lead, lihat §0; vonis ini = riset bebas-dependensi berikutnya).
Tertulis saja — tanpa kode/schema/migrasi. TIDAK membuka inti
F-008 (kolom `scrapQty`/`scrapReasonCode`/`scrapPercent` tetap
pekerjaan BOT 3); vonis ini MEMUTUS perlakuan akuntansinya supaya
inti itu tidak dibangun dengan asumsi "semua scrap = biaya job"
yang keliru sebagian.

### 0. Bukti antrean ter-gate (live 2026-10-22 11:06-11:08 WIB, origin/main ea430e34)

Semua vonis BOT 4 yang sudah terbit masih OPEN menunggu merge Lead
(CI hijau di head persis; beberapa sudah LOLOS BOT 6 di head itu):
#490 F-062-V (6/6, audit BOT 6 diminta Lead 03:34Z), #459 F-060-V
(5/5, BOT 6 LOLOS final dc6b2368), #454 F-059-V (5/5, BOT 6 LOLOS
d309e141), #443 F-058-V (5/5, BOT 6 LOLOS db8b8df6), #440 F-056-V
(5/5, BOT 6 LOLOS-BERSYARAT d6c94383), #411 F-050-V (6/6, BOT 6
LOLOS 437d4792), #406 F-048-V (6/6, BOT 6 nol-berubah 3fc23cb3),
#498 F-063-V (6/6 BLOCKED, belum ada verdict BOT 6). Pertanyaan
terbuka lama yang dicek ulang run ini SUDAH terjawab semua:
Q-033-1/2/4 (vonis F-033 di backlog baris 4377), Q-BUPOT-052-1..3
(vonis F-055-V), Q-SEWA-1..7 (F-042-V), label BUTUH-VONIS-AKUNTAN
F-021 §9 (vonis 04:50 WIB). Jadi tidak ada vonis tertunda yang
prasyaratnya bebas; yang dipilih = F-008 scrap, satu-satunya item
domain (b)/(c) yang catatannya masih berbunyi "tanpa vonis
accountant" padahal batas normal/abnormal-nya keputusan akuntansi.

### 1. Koreksi premis lama

Catatan F-008 (baris ~762): "tanpa vonis accountant (tidak mengubah
posting; scrap tetap biaya job)". BENAR untuk scrap NORMAL, SALAH
sebagai pernyataan umum: PSAK 14 par. 16(a) mengeluarkan "jumlah
pemborosan bahan, tenaga kerja, atau biaya produksi lainnya yang
TIDAK NORMAL" dari biaya perolehan persediaan — diakui sebagai
BEBAN periode terjadinya. Scrap abnormal yang tetap menumpuk di
WIP → FG menaikkan nilai persediaan dan menunda beban; itu cacat
pengukuran, bukan pilihan tampilan. Maka F-008 butuh vonis ini
SEBELUM kolom scrap dibangun, supaya klasifikasi tercatat sejak
baris pertama (retrofit klasifikasi sesudah data menumpuk =
tebakan ulang).

### 2. Putusan (mengikat)

P1. Definisi. Scrap NORMAL = pemakaian berlebih bahan yang melekat
    pada proses yang efisien untuk output yang benar-benar dicapai
    (sisa potong tak terhindarkan, process loss wajar), dibatasi
    allowance per baris BOM. Scrap ABNORMAL = pemborosan di luar
    allowance itu (salah potong, gagal las, rusak material, pengerjaan
    ulang bahan). Allowance NOL (belum diatur di BOM) → seluruh
    scrap baris itu ABNORMAL. Dilarang allowance global/default
    karangan di service — allowance hidup per baris BOM
    (`scrapPercent` Decimal(5,2) di `BomRevisionMaterial`, usulan
    F-008), nol = belum dikalibrasi, tampil sebagai temuan
    kalibrasi, bukan dianggap normal.
P2. Perlakuan jurnal.
    (a) Scrap NORMAL tetap biaya job: jalur existing tidak berubah
        (Dr WIP setting `wipAccountId` / Cr Persediaan saat issue;
        mengalir ke FG saat completion). TANPA jurnal baru.
    (b) Scrap ABNORMAL = beban periode, WAJIB keluar dari WIP pada
        periode terjadinya: Dr Beban Kerugian Produksi (akun BARU
        setting `abnormalScrapExpenseAccountId`, fail-closed) /
        Cr WIP, sebesar nilai scrap abnormal baris (qty abnormal ×
        cost terbawa FIFO baris, safeRound sen). Jurnal pada event
        yang sama dengan complete issue (tx sama, `assertPeriodOpen`,
        idempotency key mutasi finansial, referenceType bernama per
        dokumen issue — BOT 3 tetapkan nama persis, anti-dobel
        per dokumen). Akun kosong saat ada scrap abnormal → complete
        DITOLAK berisik; DILARANG fallback ke `materialExpenseAccountId`/
        `cogsAccountId` (fallback itu hanya untuk selisih PEMBULATAN
        < ambang di `onProductionOrderCostRoundingVariance`, beda
        sifat). Seed COA akun baru = keputusan BOT 3 mengusulkan kode
        di keluarga 5101 ke BOT 4/Lead sebelum migrasi — vonis ini
        TIDAK menetapkan nomor akun.
    (c) FG/completion tidak berubah: WIP yang dilepas ke FG hanya
        biaya normal + aktual sah; scrap abnormal tidak pernah
        masuk nilai FG maupun COGS penjualan.
P3. Sisa usable (Remnant) BUKAN scrap: tidak ada jurnal nilai baru;
    Remnant tetap catatan kuantitas di luar stok (konvensi existing
    dipertahankan — qtyOnHand tidak bertambah). Nilai bahan yang
    menjadi remnant usable tetap biaya job (sudah keluar ke WIP);
    bila remnant kelak terpakai di job lain TANPA movement stok,
    dilarang mengkredit WIP/beban job asal (tidak ada nilai stok
    untuk dipindah) — pemakaian berikutnya = memo kuantitas saja.
    Remnant yang akhirnya di-scrap (status scrap existing): nilai
    yang dulu masuk WIP job asal TIDAK direklasifikasi retroaktif;
    kerugian diakui hanya bila remnant itu sebelumnya tercatat
    sebagai aset — ia tidak, jadi nol jurnal; alasan scrap wajib
    (penjaga existing `scrapRemnant`).
P4. Klasifikasi ABNORMAL wajib alasan terstruktur per baris
    (`scrapReasonCode` enum bernama: salah_potong/gagal_las/
    rusak_material/sisa_tak_terpakai/lainnya_dengan_catatan);
    `lainnya` tanpa catatan = DITOLAK. Scrap ≤ allowance dengan
    kode alasan tetap tercatat untuk laporan yield, tanpa jurnal
    abnormal. Koreksi klasifikasi sesudah issue completed HANYA
    lewat jurnal koreksi/reversal di periode terbuka — dilarang
    edit baris issue completed (konsisten prinsip posting).
P5. Laporan (read-model, tanpa hitung ulang di UI): scrap rate per
    item/job/periode = qty scrap ÷ qty issue baris; nilai Rp normal
    vs abnormal terpisah; total beban abnormal rekonsiliasi ke
    jurnal akun P2(b) periode itu — selisih tampil sebagai temuan,
    dilarang dipilih diam-diam. Laporan varians produksi existing
    (`production-variance.ts`) TIDAK diubah vonis ini; scrap
    abnormal tampil di laporan scrap F-008, dan catatan silang:
    usage variance laporan varians MEMUAT scrap (normal+abnormal)
    karena ia membandingkan qty aktual vs BOM — jangan dijumlahkan
    dua kali dengan laporan scrap saat membaca keduanya.

### 3. Dasar

- PSAK 14 (Persediaan) par. 10, 15, 16(a), 34, 38 — konvergen IAS 2
  par. 16(a): pemborosan TIDAK NORMAL dikeluarkan dari biaya
  perolehan persediaan, diakui beban periode terjadinya; overhead
  tak teralokasi + jumlah abnormal masuk beban periode (par. 38).
  Sumber resmi IFRS (IAS 2 issued 2024, diakses 2026-10-22):
  https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2024/issued/part-a/ias-2-inventories.pdf
  Teks PSAK 14 par. 16(a) identik substansi (DSAK IAI mengadopsi
  IAS 2). Klaim terbatas: dasar klasifikasi biaya persediaan —
  BUKAN klaim kepatuhan SPT; deductibility fiskal kerugian produksi
  mengikuti uji 3M Pasal 6 UU PPh per kasus dokumen, tidak diputus
  vonis ini (tandai BUTUH-VONIS-AKUNTAN bila ada kasus sengketa).
- Kode berjalan diverifikasi run ini di origin/main ea430e34:
  `onProductionOrderMaterialIssue` Dr WIP/Cr Persediaan
  (stock-journal.service.ts:496-540); completion Dr Persediaan/Cr
  WIP nilai aktual penuh (:601-642); `BomRevisionMaterial` hanya
  qty; `MaterialIssueItem` tanpa plannedQty/scrapQty; `Remnant`
  sourceType/sourceId generik nullable + scrapReason teks bebas.

### 4. Batas build + acceptance BOT 6 (draf)

- BOT 3: inti F-008 (kolom BOM/issue + kode alasan) SESUDAH klaim
  schema di board & usulan kode akun P2(b); penjaga P2/P4 di service
  dalam tx; snapshot cost baris beku saat complete (edit master
  tidak mengubah klasifikasi lama).
- BOT 2: tampilkan qty/nilai scrap normal vs abnormal + status
  kalibrasi allowance apa adanya dari backend; UI tidak menentukan
  normal/abnormal dan tidak menghitung rate sendiri.
- BOT 6 (falsifikasi — MERAH bila penjaga dicabut): S1 scrap dalam
  allowance → nol jurnal abnormal, WIP utuh; S2 scrap melewati
  allowance → jurnal Dr beban abnormal/Cr WIP sen persis atas
  porsi abnormal saja; S3 allowance 0 → seluruh scrap abnormal;
  S4 akun setting kosong + ada scrap abnormal → complete ditolak,
  nol jurnal parsial; S5 ganti fallback akun ke materialExpense →
  tes S4 MERAH (penjaga fail-closed terbukti); S6 edit baris issue
  completed mengubah klasifikasi → ditolak; S7 remnant usable dari
  baris scrap → nol movement stok + nol jurnal nilai; S8 total
  laporan abnormal ≠ jurnal periode → tampil selisih, bukan nol
  diam-diam; S9 `lainnya` tanpa catatan → ditolak.
- Risiko: allowance BOM belum dikalibrasi massal → gelombang scrap
  abnormal palsu saat go-live. Mitigasi: mode catat-dulu (klasifikasi
  + laporan jalan, jurnal P2(b) hanya bila setting akun terisi DAN
  flag tenant eksplisit diusulkan BOT 3 ke Lead — pola gerbang mati
  F-006); tanpa flag, scrap abnormal tampil sebagai temuan laporan,
  belum beban jurnal. Keputusan flag = Lead atas usulan BOT 3,
  bukan diam-diam aktif.

ID vonis ini **F-2026-10-22-066-V** (066 bebas: 063-V arus kas PR
#498, 063-S/064-S/065-S spec BOT 5). Pemilik berikutnya: Lead
(merge vonis + putusan flag §4) → BOT 3 (inti F-008 + akun) →
BOT 2 → BOT 6 S1-S9.

---

## SPEC BOT 5 2026-10-22 — F-2026-10-22-066-S change order resmi terhubung WorkOrder (inti F-2026-10-20-103)

Spec dokumen saja, tanpa kode/schema/migrasi. Dipilih sesudah anti-duplikat
live 2026-10-22 atas `origin/main` ea430e34: F-032/035/036/037/013/019/
022/027/028/030/032 statement sudah merged; F-106/107 lapis aman merged
(PR #347/#355, JobBillingCard); F-103 lapis aman read-model selisih revisi
merged (PR #275, `quotation-revision-delta`); inti JobChangeOrder belum
terspec — grep `JobChangeOrder|changeOrder` di src = 0, satu-satunya
penyebutan model usulan = backlog baris 229 entri induk. ID spec bebas:
maksimum -S terpakai = 065-S (PR #502 OPEN), jadi spec ini 066-S.
Induk tetap F-2026-10-20-103; spec ini TIDAK membuat ID gap baru.

### 0. Status bukti induk (jangan dibaca ulang sebagai janji)

- `TERVERIFIKASI-KODE`: `reviseQuotation` hanya untuk quotation status
  `sent`, snapshot ke QuotationHistory lalu status kembali `draft`
  (src/actions/sales.actions.ts:375, guard :395-397). Sesudah WO lahir
  (quotation converted), jalur revisi ini tertutup — perubahan tengah
  job hari ini tanpa dokumen persetujuan. Itu gap induk persis.
- `TERVERIFIKASI-KODE`: jalur uang selisih SUDAH ada dan jadi satu-satunya
  jalur sah: `createDifferenceInvoice` (sales.actions.ts:1194, izin
  `create_sales_invoices`) dan `createRevisionDownCredit` (:1349, izin
  `confirm_down_payments`), keduanya membaca `Quotation.grandTotal`
  berjalan; vonis BOT 4 di board 2026-10-20 22:38 (Salsa) mengikat:
  sumber nilai tunggal grandTotal, urutan setuju → revisi nilai →
  panggil aksi existing, tanpa jurnal baru dari change order, baris
  ter-issue terkunci. Spec ini mewarisi vonis itu, tidak menulis ulang.
- `TERVERIFIKASI-KODE`: kunci baris ter-issue bisa dibaca dari
  `MaterialIssueItem.workOrderItemId` (schema.prisma:2227, nullable;
  MI manual tanpa WO tetap sah). `WorkOrderItem.status` string existing
  (schema:2691-an, builder work-order-part-status.ts). WorkOrder terikat
  quotation lewat `quotationId` (schema.prisma:2629).
- `TERVERIFIKASI-KODE`: izin nyata katalog — `view/edit/approve/
  confirm_quotations`, `view/create/edit_work_orders`,
  `complete_work_orders`, `create_sales_invoices`,
  `confirm_down_payments` (module-catalog.generated.ts:155-160,253-257).
  Approval generik existing: `requestApprovalIfConfigured` +
  ambang informatif F-100 (`quotation-approval-gate.ts`: minDiscountPercent/
  minAmount, TIDAK menahan dokumen). Menahan = keputusan terpisah di §5.

### 1. Benchmark resmi (akses 2026-10-22)

- Accurate — Pesanan Penjualan dari Penawaran (konversi tanpa input
  ulang; tidak ada dokumen change order tengah-job):
  https://help.accurate.id/product/pesanan-penjualan/
- Accurate — Faktur Penjualan dari penawaran/pesanan:
  https://help.accurate.id/product/faktur-penjualan/
- ERPNext — Work Order: BOM boleh diganti di WO sebelum submit, item
  kebutuhan terambil dari BOM terpilih (perubahan = ganti dokumen,
  bukan dokumen persetujuan pelanggan):
  https://docs.frappe.io/erpnext/work-order
- Cetakan induk (backlog F-103): Cetec Change Rev pada WO terbuka
  dengan unpick/re-pick — rujukan perilaku, bukan URL resmi yang
  diverifikasi ulang run ini; label `BENCHMARK-LEMAH`, jangan kutip
  sebagai fakta vendor.

Kesimpulan benchmark: tidak ada vendor rujukan yang menyediakan
dokumen persetujuan pelanggan tengah-job persis skenario bengkel ISF
(ganti winch 4,5t → 6t + tambah lampu saat kendaraan dibongkar).
Fitur ini kebutuhan ISF sendiri (`USULAN`), bukan klaim paritas.

### 2. Aktor dan permission matrix (USULAN, izin dari katalog nyata)

| Aksi | Sales/Admin | Kepala bengkel / Service advisor | Finance | Pelanggan |
|---|---|---|---|---|
| Buat draf change order | `create_work_orders` (usulan reuse; Q-CO-3) | sama | — | — |
| Edit draf (baris/alasan) | `edit_work_orders` | sama | — | — |
| Kirim ke pelanggan (→ menunggu_pelanggan) | `edit_work_orders` | sama | — | — |
| Catat persetujuan/penolakan pelanggan | `edit_work_orders` + bukti wajib §4 | sama | — | menyetujui di luar sistem (WA/tanda tangan) — TIDAK ada portal; yang dicatat staf = klaim persetujuan + bukti, label jujur "dicatat staf" |
| Terapkan (apply) | — | `complete_work_orders` (usulan reuse; Q-CO-3) | — | — |
| Panggil faktur selisih / kredit turun | (jalur existing) | — | `create_sales_invoices` / `confirm_down_payments` | — |
| Lihat daftar/riwayat | `view_work_orders` + `view_quotations` | sama | `view_quotations` | — |

Tidak ada permission key baru diusulkan tahap ini; kebutuhan key
khusus `approve_change_orders` = Q-CO-3 ke BOT 1 (menambah key =
migrasi katalog + seed, jangan diam-diam reuse bila BOT 1 menolak).

### 3. Status-transition matrix (USULAN — model JobChangeOrder belum ada)

| Dari | Pemicu | Ke | Penjaga |
|---|---|---|---|
| — | buat dari WO berstatus in_progress/completed-sebagian (Q-CO-1) | `draft` | WO punya quotationId; WO belum closed |
| `draft` | edit baris/alasan | `draft` | hanya pembuat/izin edit; baris ter-issue terkunci sejak draf |
| `draft` | kirim | `menunggu_pelanggan` | selisihNilai terhitung; alasan wajib; snapshot baris dibekukan |
| `menunggu_pelanggan` | pelanggan menolak (dicatat staf + bukti) | `ditolak` | terminal; tidak mengubah nilai/baris apa pun |
| `menunggu_pelanggan` | pelanggan setuju (dicatat staf + bukti + timestamp) | `disetujui` | bukti persetujuan wajib (Q-CO-2 bentuk bukti) |
| `disetujui` | terapkan | `diterapkan` | satu tx: revisi grandTotal lewat jalur hitung penawaran existing → ubah WorkOrderItem belum-terpasang → pin ulang bomRevisionId bila BOM berubah → panggil kandidat faktur selisih/kredit existing (hasil boleh "tidak ada faktur" bila selisih 0 sesudah kandidat ditolak builder — catat alasannya) |
| `draft`/`menunggu_pelanggan` | batalkan staf | `dibatalkan` | alasan wajib; terminal |
| `ditolak`/`dibatalkan`/`diterapkan` | — | — | terminal, tidak bisa dibuka lagi; perubahan baru = dokumen baru bernomor urut berikutnya |

Dilarang: transisi `menunggu_pelanggan → diterapkan` melewati
`disetujui`; edit baris sesudah `dikirim`; terapkan dua kali
(idempotensi: terapkan pada status bukan `disetujui` ditolak server).

### 4. Business rules register

- BR-CO-01 `TERVERIFIKASI-KODE` (vonis BOT 4 board 22:38): satu sumber
  nilai kontrak = `Quotation.grandTotal` berjalan. Change order TIDAK
  menyimpan nilai kontrak kedua; `selisihNilai` di dokumen = snapshot
  informasi persetujuan (Decimal sen) saat kirim, bukan dasar jurnal.
- BR-CO-02 `TERVERIFIKASI-KODE`: jurnal hanya lahir dari posting faktur
  selisih existing / alokasi kredit existing. Dokumen change order
  sendiri tidak pernah membuat jurnal, piutang, atau payment.
- BR-CO-03 `USULAN`: baris WorkOrderItem yang sudah punya
  MaterialIssueItem (`workOrderItemId` terisi) terkunci total dari
  perubahan qty/item/harga di change order; penggantian part terpasang
  berjalan lewat jalur MaterialIssue/retur existing, bukan suntingan
  baris lama. Falsifikasi BOT 6 AC-CO-3.
- BR-CO-04 `USULAN`: perubahan hanya boleh (a) tambah baris baru,
  (b) ubah qty/harga baris belum ter-issue, (c) hapus baris belum
  ter-issue (status baris ditandai, bukan hard-delete — jejak audit).
- BR-CO-05 `USULAN`: PPN tidak ditebak di change order. Bila baris
  berubah menaikkan nilai, terapkan wajib melewati hitung ulang
  penawaran existing (computeQuotationTotals) supaya tax konsisten;
  faktur selisih murni penyesuaian tetap tax=0 pola existing
  (draftDerivedInvoiceData). Angka/pajak final = `BUTUH-VONIS` BOT 4
  bila Q-CO-4 dijawab berbeda.
- BR-CO-06 `USULAN`: nomor dokumen urut per WO (CO-001, CO-002, ...)
  dari nomor dokumen change order sendiri; dua draf aktif bersamaan
  untuk WO sama DILARANG (satu `draft`/`menunggu_pelanggan`/
  `disetujui`-belum-diterapkan per WO) — mencegah dua selisih dihitung
  dari basis yang sama.
- BR-CO-07 `USULAN`: persetujuan pelanggan dicatat staf dengan bukti
  tertaut (lampiran/URL chat/nomor referensi) + `disetujuiOlehPelangganAt`;
  tanpa bukti, transisi ke `disetujui` ditolak. Sistem tidak mengklaim
  pelanggan menyetujui langsung di sistem (tidak ada portal).
- BR-CO-08 `BUTUH-VONIS` (BOT 1): ambang internal — apakah selisih di
  atas ambang tertentu (pola conditions F-100) wajib approval internal
  SEBELUM kirim ke pelanggan, dan apakah approval itu menahan (bukan
  informatif). Spec tidak memutuskan; default aman sampai vonis:
  tanpa gerbang internal tambahan selain status pelanggan.
- BR-CO-09 `USULAN`: sesudah `diterapkan`, kartu tagihan job existing
  (JobBillingCard F-106/107) harus membaca nilai baru apa adanya —
  tidak ada tampilan selisih kedua; delta revisi existing tetap
  sumber tampil delta.
- BR-CO-10 `USULAN`: change order pada WO tanpa quotationId (WO manual)
  ditolak dengan pesan eksplisit — tidak ada sumber nilai tunggal,
  jangan buat jalur nilai WO kedua (konsisten vonis BOT 4 (a)).

### 5. Pertanyaan terbuka (jawaban menentukan implementasi; jangan ditebak)

- Q-CO-1 → BOT 1/BOT 3: WO status apa saja yang boleh dibuka change
  order-nya (in_progress saja, atau juga WO completed yang belum
  closed)? Default usulan: bukan draft, bukan closed/cancelled.
- Q-CO-2 → BOT 1: bentuk bukti persetujuan pelanggan minimum (lampiran
  file, tautan WA, atau referensi bebas wajib)? Menentukan kolom/UI.
- Q-CO-3 → BOT 1: reuse permission existing (§2) atau key baru
  `approve_change_orders`/`apply_change_orders`? Key baru = kerja
  katalog+seed BOT 3, bukan keputusan BOT 5.
- Q-CO-4 → BOT 4 (`BUTUH-VONIS` uang/pajak): konfirmasi BR-CO-05 —
  perubahan nilai yang mengubah DPP/PPN quotation wajib hitung ulang
  penuh vs faktur selisih tax=0; perlakuan selisih negatif sesudah
  faktur progres terbit 100% (kredit vs faktur negatif)?
- Q-CO-5 → BOT 1: apakah change order boleh mengubah BOM revision WO
  (pin ulang `bomRevisionId`) atau hanya baris WO? Induk F-104
  (unpick/re-pick) sengaja TIDAK digabung spec ini; gabung = scope naik.

### 5A. PUTUSAN BOT 1 2026-10-22 (Q-CO-1/2/3/5 — mengikat BOT 3/BOT 2)

Bukti live: status WO nyata `draft/pending/in_progress/completed/
closed/cancelled` (schema.prisma status String default draft;
ACTIVE_WORK_ORDER_STATUSES=[draft,pending,in_progress] di
src/lib/reports/work-order-queue.ts:25; closeWorkOrder hanya dari
`completed` → `closed`, manufacturing.actions.ts:2286-2298). Katalog
izin nyata: `view/create/edit/complete_work_orders` — tidak ada
`approve_work_orders`/`approve_change_orders`/`apply_change_orders`
(module-catalog.generated.ts).

- Q-CO-1 DIPUTUS: CO boleh dibuka pada WO `pending`, `in_progress`,
  `completed` (belum closed). DITOLAK pada `draft` (belum berjalan,
  ubah langsung di WO), `closed` (terminal tagihan), `cancelled`.
  Penjaga dibaca ulang di tx buat + tx terapkan.
- Q-CO-2 DIPUTUS: bukti minimum = referensi bebas WAJIB (teks
  non-kosong sesudah trim: nomor chat WA/tanggal persetujuan/nomor
  surat) + `disetujuiOlehPelangganAt` + dicatat-oleh (user pencatat).
  Lampiran file/tautan URL = opsional, bukan syarat. Tanpa referensi,
  transisi ke `disetujui` ditolak server. Label jujur "dicatat staf"
  tetap (§2/BR-CO-07).
- Q-CO-3 DIPUTUS: REUSE izin existing, TANPA key baru. Buat/edit/
  kirim/catat persetujuan = `edit_work_orders` (buat draf tetap
  `create_work_orders`); terapkan = `complete_work_orders` (penjaga
  sama kelasnya dengan close WO). Alasan: tidak ada peran ISF terpisah
  hari ini yang menyetujui CO tetapi tidak boleh menyelesaikan WO;
  key baru = migrasi katalog+seed tanpa pemisah peran nyata. Key baru
  hanya dibuka kembali bila owner menunjuk peran penegak terpisah.
- Q-CO-5 DIPUTUS: CO TIDAK boleh pin ulang `bomRevisionId`. CO hanya
  mengubah baris WorkOrderItem (tambah/ubah qty-harga/hapus lunak
  baris belum ter-issue, BR-CO-04). Baris §3 yang menyebut "pin ulang
  bomRevisionId bila BOM berubah" DICORET oleh putusan ini. F-104
  (unpick/re-pick BOM) tetap spec terpisah, tidak digabung.

BR-CO-08 (ambang internal): tetap tanpa gerbang internal tambahan
tahap ini — approval pelanggan + izin terapkan di atas cukup; pola
F-100 informatif tidak dijadikan penahan tanpa kebutuhan ISF nyata.

Q-CO-4 tetap milik BOT 4 (kartu t_0287629e) — inti BOT 3 tetap
menunggu vonis itu sesudah PR spec ini merged.

### 6. Alur ringkas (aktor → dokumen masuk/keluar)

1. Service advisor membuka WO berjalan → buat draf CO (dokumen masuk:
   WO + quotation tertaut; keluar: draf bernomor).
2. Edit baris belum-terpasang, isi alasan → kirim (keluar: snapshot
   selisih untuk pelanggan; kanal kirim di luar sistem, WA manual
   existing — klik WA tercatat pola F-036, bukan bukti terkirim).
3. Pelanggan setuju/tolak di luar sistem → staf catat + bukti.
4. Terapkan (satu tx §3) → nilai kontrak berubah di quotation →
   faktur selisih/kredit lahir lewat aksi existing bila kandidat > 0.
5. Kartu tagihan job + statement pelanggan membaca nilai berjalan
   seperti biasa; CO tampil di riwayat WO sebagai dokumen persetujuan.

Edge cases: selisih 0 saat terapkan (kandidat ditolak builder — CO
tetap `diterapkan` dengan catatan "tanpa faktur selisih", bukan error
senyap); WO di-close di antara setuju→terapkan (terapkan ditolak,
CO wajib dibatalkan/dibuat ulang); baris ter-issue di antara draf→
terapkan (kunci dibaca ulang di tx terapkan, konflik = tolak dengan
daftar baris); quotation terhapus lunak (tolak); dua staf membuka
draf bersamaan (BR-CO-06 penjaga server, bukan UI).

### 7. Draf acceptance

BOT 3 (backend, sesudah Q-CO-1..3 + vonis BOT 4 Q-CO-4):
- AC-CO-1 model+aksi: transisi §3 ditegakkan server; terapkan pada
  status bukan `disetujui` ditolak; nomor urut per WO monoton.
- AC-CO-2 terapkan menaikkan grandTotal lewat jalur hitung existing
  lalu memanggil kandidat faktur selisih yang sama (bukan logika
  kandidat kedua); panggil terapkan 2x = satu faktur, kedua ditolak.
- AC-CO-3 falsifikasi kunci: baris ter-issue diubah lewat CO →
  ditolak; ProductionCost/totalActualCost tidak berubah oleh
  perubahan nilai tagih.
- AC-CO-4 turun nilai: lahir CustomerCredit pasif jalur existing,
  tanpa jurnal sampai alokasi/refund.
- AC-CO-5 BR-CO-06: draf aktif kedua untuk WO sama ditolak server.

BOT 2 (frontend, sesudah kontrak BOT 3 stabil; fitur didahulukan):
- AC-CO-6 panel CO di detail WO: status kata Indonesia persis
  (Draf/Menunggu Pelanggan/Disetujui/Ditolak/Diterapkan/Dibatalkan),
  baris terkunci tampil berlabel "Sudah terpasang — terkunci", tombol
  Terapkan hanya pada status Disetujui + permission §2.
- AC-CO-7 UI tidak menghitung selisih/jurnal sendiri; selisih tampil
  dari server; bukti persetujuan wajib sebelum tombol Setujui aktif.
- AC-CO-8 pesan jujur: "Persetujuan dicatat staf dari bukti pelanggan"
  (bukan "pelanggan menyetujui di sistem").

BOT 6 (falsifikasi atas head BOT 3/BOT 2):
- AC-CO-9 cabut penjaga status di aksi terapkan → CO draft bisa
  diterapkan = MERAH; cabut kunci baris ter-issue = MERAH; jurnal
  langsung dari aksi CO = MERAH (cek tidak ada jurnal tanpa posting
  faktur selisih); permission dicabut → aksi ditolak.

### 8. Backlog implementasi (turunan spec ini; induk F-2026-10-20-103)

- F-2026-10-22-066-S (spec ini) → BOT 1 putus Q-CO-1/2/3/5, BOT 4
  vonis Q-CO-4 → BOT 3 inti (model JobChangeOrder + baris perubahan +
  aksi §3, migrasi klaim `prisma/schema.prisma` di board dulu) →
  BOT 2 panel detail WO → BOT 6 AC-CO-1..9.
- Yang TIDAK diusulkan: portal persetujuan pelanggan, tanda tangan
  digital, gabung F-104 unpick/re-pick BOM, jadwal termin kontraktual
  F-106 inti (tetap menunggu inti ini sesuai PUTUSAN board 106/107),
  jurnal baru apa pun dari dokumen CO.

Pemilik usulan: BOT 5 (spec). Butuh putusan accountant: YA (Q-CO-4
saja; pola uang inti sudah vonis BOT 4 2026-10-20 22:38).
## VONIS BOT 4 2026-10-22 — F-2026-10-22-066-V Q-CO-4 (change order WO F-2026-10-22-066-S)

Pemilik vonis: BOT 4. Pertanyaan: BR-CO-05 spec PR #503 §4/§5 Q-CO-4.
Bukti kode pada head PR #503 `1b0a8b91` (= isi fungsi sama di
origin/main ea430e34): `computeQuotationTotals` +
`computeQuotationLine` (src/actions/sales.actions.ts:727),
`draftDerivedInvoiceData` (:1151), `createDifferenceInvoice` (:1194),
`createProgressInvoice` (:1267), `createRevisionDownCredit` (:1349),
builder `src/lib/reports/job-billing-progress.ts` +
`quotation-revision-delta.ts`.

### Vonis 1 — hitung ulang: BR-CO-05 DIKONFIRMASI dengan koreksi presisi

- DIKONFIRMASI: terapkan CO yang mengubah nilai WAJIB menulis
  `Quotation.grandTotal` BARU lewat jalur hitung quotation existing
  (`computeQuotationTotals`: subtotal baris − diskon header + tax
  header), BUKAN menyimpan nilai kontrak kedua di dokumen CO
  (konsisten BR-CO-01 + warisan vonis 2026-10-20 22:38: sumber nilai
  tunggal `Quotation.grandTotal`, urutan setuju → revisi nilai →
  panggil jalur uang existing, tanpa jurnal baru dari CO, baris
  ter-issue terkunci).
- KOREKSI ISTILAH (mengikat BOT 3): di kode berjalan TIDAK ADA mesin
  DPP/PPN di quotation. `tax` quotation = angka header bebas
  (`Number(data.tax)`, sales.actions.ts:732), bukan tarif × DPP, dan
  tidak ada tarif/DPP per baris. Jadi "hitung ulang PPN" pada CO =
  hitung ulang `grandTotal` lewat `computeQuotationTotals` apa
  adanya; JANGAN bangun perhitungan PPN baru (tarif × DPP) di jalur
  CO/quotation — itu fitur pajak terpisah di luar scope 066-S.
  Akibatnya: perubahan baris CO mengubah subtotal/diskon/tax-header
  sesuai input revisi, dan `grandTotal` hasil hitung ulang adalah
  satu-satunya angka yang mengalir ke faktur selisih/kredit.
- Faktur selisih tax=0 (`draftDerivedInvoiceData`: `tax:0,
  taxAmount:0`, baris tunggal tanpa itemId): SAH dan WAJIB dipakai
  apa adanya, BUKAN cacat yang harus "diperbaiki" jadi ber-PPN.
  Alasan: nominal selisih dihitung dari `grandTotal` berjalan −
  Σ invoice non-cancelled, dan `grandTotal` SUDAH memuat komponen
  tax header; memecah selisih jadi DPP+PPN di faktur selisih akan
  (a) menebak tarif yang tidak disimpan di quotation, (b) berisiko
  dobel-hitung komponen pajak yang sudah ada di grandTotal, dan
  (c) menyimpang dari seluruh rantai existing — faktur progres
  (`createProgressInvoice`) pun terbit lewat `draftDerivedInvoiceData`
  tax=0 yang sama, termasuk progres 100%. Konsistensi rantai >
  rekonstruksi PPN yang sumber datanya tidak ada. Faktur pajak/
  perlakuan PPN dokumen terbit tetap domain jalur faktur pajak
  existing saat posting, bukan dokumen CO dan bukan faktur selisih
  draft ini.
- Syarat penjaga BOT 3: (i) hitung ulang hanya di server dalam tx
  terapkan, dari baris quotation hasil perubahan CO — angka kiriman
  klien untuk subtotal/tax/grandTotal ditolak/dihitung ulang, pola
  AUD-R10-03 existing; (ii) sesudah grandTotal baru tertulis, uang
  keluar HANYA lewat `createDifferenceInvoice` (selisih > 0) /
  `createRevisionDownCredit` (selisih < 0) existing — dilarang
  logika kandidat kedua di service CO; (iii) terapkan idempoten:
  status bukan `disetujui` ditolak, panggil 2x = satu dokumen uang.

### Vonis 2 — selisih negatif sesudah progres 100%: KREDIT TURUN, BUKAN faktur negatif

- DIPUTUS: selisih negatif (tertagih/DP terikat > grandTotal baru),
  termasuk sesudah faktur progres terbit 100%, WAJIB lewat
  `createRevisionDownCredit` existing: CustomerCredit pasif
  `sourceType=RevisionDown, sourceId=quotationId`, nominal dari
  builder `computeRevisionDownCreditCandidate` (kelebihan =
  max(Σ invoice non-cancelled, DP confirmed) − nilai berjalan,
  dikurangi kredit RevisionDown + DownPayment existing — anti
  dobel), TANPA jurnal saat lahir; jurnal hanya saat alokasi ke
  tagihan lain/refund lewat customer-credit.service existing.
- FAKTUR NEGATIF DILARANG: tidak ada konsep faktur nominal negatif
  di jalur existing (`createDifferenceInvoice` menolak selisih ≤ 0;
  `draftDerivedInvoiceData` mengasumsikan amount positif), dan
  membuat faktur negatif akan memposting jurnal piutang negatif +
  berpotensi menggerakkan stok — melanggar BR-CO-02 (jurnal hanya
  dari posting dokumen uang existing) dan warisan vonis 22:38.
  Koreksi nilai turun yang sudah terposting = kredit pelanggan
  pasif (di atas); retur/faktur pajak retur = jalur dokumen retur
  existing bila barang/dokumen pajak memang harus dikoreksi —
  BUKAN urusan dokumen CO, jangan digabung ke 066-S.
- Batas: bila sesudah progres 100% nilai NAIK, tetap faktur selisih
  positif tax=0 untuk sisa selisih (grandTotal baru − tertagih);
  bila nilai TETAP/selisih 0, CO tetap `diterapkan` tanpa dokumen
  uang + catatan alasan (pola edge spec §6), bukan error senyap.

### Falsifikasi wajib BOT 6 (atas head BOT 3)

1. CO menaikkan nilai: grandTotal berubah HANYA lewat hitung ulang
   server; kirim grandTotal/tax rekayasa dari klien → hasil server
   berbeda dari kiriman = lolos; hasil mengikuti kiriman = MERAH.
2. Faktur selisih dari CO: `tax=0, taxAmount=0`, nominal persis
   grandTotal baru − Σ invoice non-cancelled; ubah builder jadi
   memecah DPP/PPN bertarif → MERAH (penjaga vonis ini).
3. Turun nilai pasca progres 100%: lahir CustomerCredit RevisionDown
   pasif, nol jurnal saat create; buat jalur faktur negatif →
   MERAH; alokasi/refund kredit baru boleh jurnal.
4. Jurnal langsung dari aksi CO (tanpa posting faktur selisih) →
   MERAH (AC-CO-9 spec tetap berlaku).
5. Terapkan 2x / status bukan `disetujui` → ditolak, dokumen uang
   tetap satu.

### Klaim kepatuhan

Vonis ini mengatur perlakuan internal dokumen komersial (quotation,
faktur selisih draft, kredit pelanggan); BUKAN klaim perlakuan faktur
pajak/SPT. Tidak ada tarif/aturan pajak baru yang diputus di sini —
justru diputus untuk TIDAK merekonstruksi PPN dari data yang tidak
menyimpan tarif/DPP. Perlakuan faktur pajak atas faktur yang
diposting tetap mengikuti jalur faktur pajak existing + tax rules
register berlaku; bila owner ingin faktur selisih membawa DPP/PPN
tersendiri, itu keputusan fitur pajak terpisah = `BUTUH-VONIS`
baru dengan sumber DJP, di luar 066-S.

ID vonis ini **F-2026-10-22-066-V** (pasangan spec F-2026-10-22-066-S
PR #503; seri -V bebas tabrakan per grep origin/main 2026-10-22,
maks -V terpakai 057-V). Pemilik berikutnya: BOT 3 (inti t_af177f74
sesudah PR #503 merged + putusan BOT 1 §5A) -> BOT 2 -> BOT 6
falsifikasi 1-5 di atas.


## SPEC BOT 5 — Registri part terpasang per kendaraan (F-2026-10-22-072-S, induk F-2026-10-21-024)

Status: SPEC (dokumen saja, tanpa kode). Basis verifikasi live
origin/main `acb91fb0` (2026-10-22). Dipicu kartu t_612e3065.
Anti-duplikat: ID -S bebas tabrakan per grep origin/main + semua
branch `hermes/bot5-*` terbuka (maks terpakai F-2026-10-22-071-S
PR #512); tidak ada PR/spec InstalledPart atau "part terpasang"
(grep backlog/board/PR all-state = 0 selain baris induk 024).

### 1. Masalah terverifikasi (TERVERIFIKASI-KODE)

1. `InstalledPart` ABSEN: `grep "model InstalledPart"
   prisma/schema.prisma` origin/main = 0. Tidak ada model
   "apa terpasang di kendaraan mana, kapan dilepas/diganti".
2. Satu-satunya catatan mirip = `WarrantyCoverage`
   (schema.prisma:4001-4038): dibuat
   `recordWarrantyCoverages` (src/lib/services/warranty.service.ts:65-164)
   di hook selesai WO (manufacturing.actions.ts:1793), TAPI
   hanya item `item.warrantyMonths != null` (baris 100-102,
   skip diam-diam). Part non-garansi yang terpasang TIDAK
   tercatat di mana pun sebagai "terpasang".
3. Coverage juga tidak punya siklus lepas/ganti: tak ada
   `removedAt`/`replacedBy`/status dilepas; `WarrantyClaim`
   (schema:4040-4095) hanya menaut `coverageId`+serial.
   Akibat: admin tidak bisa menjawab "part apa saja sekarang
   terpasang di kendaraan X" dan "part ini dulu diganti kapan".
4. Serial ter-konsumsi memang tersimpan per baris issue
   (`MaterialIssueItem.serialNumbers` Json, diisi
   material-issue.hook.ts:104-110) dan batch terpasang
   (baris 114-123, komentar F-2026-10-20-39(a)), tetapi itu
   atribut dokumen issue — bukan registri per kendaraan yang
   bisa ditanya status terakhirnya.
5. Layar riwayat kendaraan existing
   (src/lib/reports/customer-vehicle-history-data.ts) hanya
   mendaftar DOKUMEN (quotation/SO/project/WO/invoice/claim),
   bukan part terpasang. Halaman kendaraan
   (master/pelanggan/[slug]/kendaraan/[vehicleSlug]/page.tsx:51-62)
   menampilkan coverage garansi saja, gate `view_warranties`.

### 2. Keputusan spec (USULAN kecuali ditandai lain)

Satu model registri baru (nama usulan `InstalledPart`; nama
fisik final milik BOT 3), lahir OTOMATIS dari transaksi
inventory sah, bukan form bebas:

| Kolom (usulan) | Isi |
|---|---|
| customerVehicleId | kendaraan penerima (dari WO/proyek, §3) |
| itemId | part terpasang |
| materialIssueItemId | baris issue sumber (WAJIB, bukti transaksi) |
| serialNumber | 1 baris per unit serial; null utk non-serial |
| qty / qtyRemoved | non-serial: per baris issue + kumulatif dilepas |
| installedAt | tanggal dokumen issue |
| warrantyCoverageId | taut coverage bila item bergaransi (nullable) |
| removedAt / removedById / removalReason | saat dicatat lepas |
| replacedByInstalledPartId | part pengganti (self-relation, nullable) |
| notes | bebas |

Status TURUNAN (tidak disimpan bebas): TERPASANG
(qtyRemoved=0) -> SEBAGIAN_DILEPAS (0<qtyRemoved<qty) ->
DILEPAS (qtyRemoved=qty). Baris serial selalu qty=1.

Aturan lahir (satu-satunya jalan masuk): di transaksi yang sama
dengan `recordWarrantyCoverages` saat WO selesai
(completeWorkOrder), untuk SETIAP baris MaterialIssue WO itu
(bukan hanya bergaransi): buat baris InstalledPart per serial
ter-konsumsi; item non-serial satu baris per baris issue.
Kendaraan dari `WO.customerVehicleId`. Bila coverage lahir
untuk baris yang sama, tautkan `warrantyCoverageId` (jangan
duplikasi logika garansi; coverage tetap sumber klaim).

Jalan keluar: aksi catat-lepas (usulan
`recordInstalledPartRemoval`): isi qty/serial dilepas, alasan
wajib, waktu+petugas dari sesi. Bila part pengganti sudah
terpasang lewat issue berikutnya, tautkan
`replacedByInstalledPartId`. Pencatatan lepas TIDAK mengubah
stok/jurnal (part lama tidak otomatis kembali ke gudang;
pengembalian fisik = dokumen inventory existing bila memang
kembali — di luar spec ini).

Tampilan: panel "Part terpasang" di halaman kendaraan yang
sama (di bawah coverage), kolom part/serial/tgl pasang/status/
garansi-sampai; riwayat kendaraan (customer-vehicle-history)
menambah seksi part terpasang dari registri ini, BUKAN dari
dokumen issue mentah.

### 3. Atribusi kendaraan (penjaga)

| Sumber issue | Kendaraan | Lahir? |
|---|---|---|
| MI taut WO (workOrderId) | WO.customerVehicleId | YA |
| MI taut proyek tanpa WO | Project.customerVehicleId bila terisi | YA (Q-IP-1) |
| MI bebas / penjualan langsung | tidak teratribusi | TIDAK — jangan tebak |

MI yang WO-nya tanpa customerVehicleId: tidak lahir, dicatat
di hasil aksi sebagai terlewati (pola `skipped` existing
warranty.service.ts:83) — jangan gagalkan selesai WO.

### 4. Matriks peran/izin (katalog TERVERIFIKASI-KODE)

Katalog live (src/lib/auth/module-catalog.generated.ts):
`view_warranties`/`manage_warranties` (baris 527-531),
`view_material_issues`/`create_material_issues`,
`view_work_orders`/`complete_work_orders` (baris ~493-503).

| Aksi | Izin usulan | Status |
|---|---|---|
| Lihat panel part terpasang | `view_warranties` (gate halaman existing) | USULAN Q-IP-2 |
| Catat lepas/ganti | `manage_warranties` | USULAN Q-IP-2 |
| Lahir otomatis | sistem di tx selesai WO (tanpa izin user baru) | USULAN |
| Ubah/hapus baris registri manual | DILARANG (koreksi = catat lepas + lahir baru) | USULAN |

Tidak ada key izin baru di spec ini; bila BOT 1 ingin pisah
dari garansi, itu perubahan katalog = keputusan BOT 1.

### 5. Register aturan bisnis

| ID | Aturan | Label |
|---|---|---|
| BR-IP-01 | Registri hanya lahir dari MaterialIssueItem nyata; form bebas dilarang | USULAN |
| BR-IP-02 | Coverage garansi tetap hanya item warrantyMonths!=null; registri mencakup SEMUA part terpasang | TERVERIFIKASI-KODE (perilaku coverage) + USULAN (cakupan registri) |
| BR-IP-03 | Serial-tracked: 1 baris/unit dari serialNumbers ter-konsumsi; non-serial per baris issue | USULAN |
| BR-IP-04 | Idempoten: lahir ulang WO sama tidak menggandakan (unik materialIssueItemId+serialNumber) | USULAN |
| BR-IP-05 | Status turunan dari qtyRemoved; tidak ada edit status bebas | USULAN |
| BR-IP-06 | Catat lepas tidak membuat StockMove/jurnal/retur otomatis | USULAN |
| BR-IP-07 | Tanpa kendaraan teratribusi = tidak lahir + terhitung skipped, WO tetap selesai | USULAN |
| BR-IP-08 | Klaim garansi tetap lewat WarrantyCoverage; registri hanya menaut, bukan mengganti | TERVERIFIKASI-KODE (klaim pakai coverageId) |
| BR-IP-09 | Backfill MI historis sebelum fitur ini | BUTUH-VONIS Q-IP-4 (BOT 1) |
| BR-IP-10 | Perilaku saat WO/issue sumber dibatalkan/dikoreksi sesudah lahir | BUTUH-VONIS Q-IP-5 (BOT 1+BOT 3) |

### 6. Benchmark (BENCHMARK, URL resmi)

| Aspek | Accurate | Zahir | ISF (spec ini) |
|---|---|---|---|
| Serial per barang | Profil nomor seri di Penjualan/Pembelian/Stok + penyesuaian (help.accurate.id/pencatatan-no-seri-pada-transaksi/, help.accurate.id/nomor-seri/) | Fasilitas Serial Number untuk barang elektronik/sparepart bergaransi, incl. laporan mutasi serial (help.zahironline.com .../fasilitas-serial-number-di-zahir-online/) | Serial ter-konsumsi sudah per baris issue (§1.4) |
| Klaim garansi | Accurate Online Klaim Garansi: pilih no seri/barang/pelanggan, tgl terima & pengembalian (accurate.id/fitur/klaim-garansi/) | Serial tertelusur per penjualan (URL sama) | Klaim existing taut coverage+serial |
| Registri terpasang per kendaraan + lepas/ganti | Tidak ditemukan fitur registri terpasang per aset pelanggan di URL resmi di atas | Tidak ditemukan | Inti spec ini (celah nyata, bukan tiruan) |

### 7. Acceptance criteria (BOT 6, falsifikasi)

1. AC-IP-1: WO selesai berisi part non-garansi -> baris
   InstalledPart lahir; paksa hanya-bergaransi -> MERAH.
2. AC-IP-2: completeWorkOrder dipanggil 2x / retry -> jumlah
   baris registri tetap (unik dilanggar = MERAH).
3. AC-IP-3: Item serial 3 unit ter-konsumsi -> 3 baris qty=1
   serial persis serialNumbers issue; serial karangan -> MERAH.
4. AC-IP-4: WO tanpa customerVehicleId -> WO tetap completed,
   registri 0 baris, hasil memuat skipped; gagalkan WO = MERAH.
5. AC-IP-5: Catat lepas sebagian non-serial -> status
   SEBAGIAN_DILEPAS; lepas penuh -> DILEPAS + removedAt/By terisi;
   stok & jurnal sesudah catat lepas berubah = MERAH.
6. AC-IP-6: Baris bergaransi: warrantyCoverageId tertaut
   coverage yang sama dengan jalur klaim; klaim dari coverage
   itu tetap jalan (regresi F-021).
7. AC-IP-7: Role tanpa izin lihat (§4) membuka halaman
   kendaraan -> panel part terpasang tak tampil; catat lepas
   tanpa izin kelola -> ditolak server.
8. AC-IP-8: Edit/hapus langsung baris registri lewat aksi apa
   pun -> tidak ada jalurnya; temukan jalur edit bebas = MERAH.
9. AC-IP-9: Riwayat kendaraan menampilkan part terpasang dari
   registri; part dari MI bebas (tanpa kendaraan) tampil di
   kendaraan mana pun = MERAH.
10. AC-IP-10: Issue proyek tanpa WO dengan kendaraan terisi
    mengikuti putusan Q-IP-1 persis (lahir bila diputus YA).

### 8. Pertanyaan terbuka & pemilik berikut

| ID | Pertanyaan | Pemilik |
|---|---|---|
| Q-IP-1 | MI proyek langsung (tanpa WO): lahir juga? Usulan YA bila Project.customerVehicleId terisi | BOT 1 |
| Q-IP-2 | Izin lihat/catat-lepas reuse warranties, atau key baru terpisah dari garansi? | BOT 1 |
| Q-IP-3 | Fisik baris serial per-unit + constraint unik final | BOT 3 |
| Q-IP-4 | Backfill historis dari MI lama ber-WO (sekali jalan, ditandai sumber backfill)? | BOT 1 |
| Q-IP-5 | WO/issue dibatalkan sesudah lahir: baris ditandai batal atau dibiarkan + catatan? | BOT 1 + BOT 3 |

Estimasi: BOT 3 model+lahir di tx selesai WO+aksi lepas
2-3 hari; BOT 2 panel kendaraan 1 hari; BOT 6 AC-IP-1..10.

Pemilik berikutnya: BOT 1 putus Q-IP-1/2/4/5 -> BOT 3 inti
(Q-IP-3) -> BOT 2 panel -> BOT 6 AC-IP-1..10. BOT 4 tidak
dibutuhkan (nol jurnal/angka uang di spec ini).
---

## SPEC BOT 5 2026-10-22 — F-2026-10-22-071-S scrap/yield terstruktur per baris issue (inti F-2026-10-21-008, pelengkap vonis BOT 4 F-2026-10-22-066-V PR #504)

Spec dokumen saja, tanpa kode/schema/migrasi. Dipilih sesudah
anti-duplikat live 2026-10-22 atas `origin/main` 8506a72f + fetch
886d495e: serial -S Bot 5 terakhir 070-S (PR #511 OPEN); inti
F-2026-10-21-014..037 ditelusur satu per satu — 014 spec PR #418,
015 vonis BOT 4 PR #410 merged (inti receivedQty menunggu putusan
BOT 1 Q-015-1, bukan spec Bot 5), 016/017/018/019/020/022/024/025/
027/028/029/030/031/032/033/035/036/037 semua sudah spec dan/atau
implementasi merged (PR #290..#463), 021/023/026/034 domain vonis
BOT 4, 007 estimasi-vs-aktual sudah read-model merged
(`job-estimate-vs-actual.ts`, headernya sendiri menyatakan biaya
estimasi per job TIDAK punya sumber — snapshot estimasi biaya =
inti baru, di luar spec workflow ini). Tersisa F-2026-10-21-008
(b) P1 scrap/yield: vonis akuntansinya BARU terbit (BOT 4
F-2026-10-22-066-V, PR #504 OPEN head 77840139) tetapi workflow
operasionalnya — siapa mencatat scrap di jalur mana, klasifikasi
di titik apa, kata UI apa — belum pernah terspec sebagai -S.
Grep `scrapPercent|scrapQty|scrapReasonCode` di schema+src main =
0 (hanya `Remnant.scrapReason` teks bebas). Induk tetap
F-2026-10-21-008; spec ini TIDAK membuat ID gap baru. ID spec
bebas: maks -S terpakai 070-S, jadi 071-S. Vonis 066-V dan spec ini
memakai nomor seri 066 berbeda domain suffix (-V vs -S) — bukan
tabrakan, pola sama 063-S/063-V.

### 0. Status bukti induk (jangan dibaca ulang sebagai janji)

- `TERVERIFIKASI-KODE`: `BomRevisionMaterial` hanya `qty`
  Decimal(15,2) (prisma/schema.prisma, model BomRevisionMaterial);
  tanpa allowance scrap. `MaterialIssueItem` hanya
  qty/cost/serialNumbers/batchNumbers + `workOrderItemId` nullable;
  tanpa plannedQty/scrapQty/alasan. `ProductionOrderMaterial` punya
  qty rencana + actualQty + standardCost/actualCost — selisih
  pemakaian terlihat sebagai angka, tanpa pemisahan scrap.
- `TERVERIFIKASI-KODE`: dua jalur keluar bahan yang sah dan saling
  mengunci per WO: `issueMaterial` PO langsung
  (src/actions/manufacturing.actions.ts:825, izin
  `edit_production_orders`, tolak bila WO sudah konsumsi via MI)
  dan MaterialIssue resmi (`createMaterialIssueFromWorkOrder`
  :1706; MaterialIssue.workOrderId/projectId). Aktual job WAJIB
  dari dua jalur ini + ProductionCost — spec tidak membuat jalur
  keluar ketiga.
- `TERVERIFIKASI-KODE`: Remnant existing = catatan kuantitas di
  luar stok: model Remnant (sourceType/sourceId generik nullable,
  scrapReason String VarChar(500) teks bebas, status default
  usable); aksi createRemnant/consumeRemnant/scrapRemnant
  (src/actions/inventory.actions.ts:2176/2230/2259), scrapRemnant
  sudah mewajibkan alasan teks. Remnant BUKAN stok gudang kedua
  (komentar schema P1-5).
- `TERVERIFIKASI-KODE`: laporan varians existing
  `production-variance.ts` memecah selisih harga/pemakaian dari
  ProductionOrderMaterial; baris standar 0 ditandai `uncalibrated`
  dan dilarang ikut jurnal disposisi. Usage variance laporan itu
  MEMUAT scrap (vonis 066-V P5) — laporan scrap spec ini dilarang
  dijumlahkan dengannya.
- `BUTUH-VONIS` SUDAH TERJAWAB untuk uang: BOT 4
  F-2026-10-22-066-V (PR #504) P1-P5 mengikat — normal ≤ allowance
  tetap biaya job nol jurnal baru; abnormal > allowance (allowance
  0 = semua abnormal) = beban periode Dr akun setting baru
  fail-closed / Cr WIP saat complete issue, tx sama,
  assertPeriodOpen, idempotency; alasan terstruktur wajib,
  `lainnya` tanpa catatan ditolak; remnant usable nol jurnal/nol
  movement; koreksi hanya reversal periode terbuka. Spec ini
  TIDAK memutus ulang satu pun angka/akun itu; yang belum diputus
  vonis = flag mode catat-dulu vs jurnal langsung (milik BOT 1
  atas usulan BOT 3, vonis §4) dan kode akun 5101 (BOT 3 usulkan
  ke BOT 4/BOT 1).

### 1. Benchmark resmi (akses 2026-10-22)

- Zahir Manufacturing — Production Formula/Recipe + BOM:
  formula menyesuaikan yield, waste, shrinkage; BOM multi-level
  memuat "Waste allowance" eksplisit per bahan:
  https://zahirerp.com/en/zahir-manufacturing/
- Accurate manufaktur: Formula Produksi/BOM sebagai dasar
  kebutuhan bahan + Pengambilan Bahan Baku tercatat per proses;
  hak akses "Mengambil barang melebihi perintah kerja" bisa
  dimatikan per grup (kontrol pemakaian berlebih di titik ambil):
  https://accurate.id/solusi/manufaktur/ dan
  https://help.accurate.id/product/Manufaktur/
- Vonis akuntansi (bukan benchmark vendor): PSAK 14 par.16(a) via
  BOT 4 F-2026-10-22-066-V — abnormal keluar dari biaya perolehan
  persediaan, beban periode.

Kesimpulan benchmark (`BENCHMARK`): allowance waste hidup di
BOM/formula per bahan (Zahir), dan kontrol kelebihan ambil hidup
di titik pengeluaran (Accurate). Keduanya cocok dengan bentuk
induk F-008 existing. Klasifikasi normal/abnormal + jurnalnya =
vonis BOT 4, bukan perilaku vendor.

### 2. Workflow specification (USULAN di luar yang sudah divonis)

Aktor: estimator/kepala bengkel (kalibrasi allowance di BOM),
operator produksi/teknisi (catat scrap saat issue), kepala
bengkel (tinjau temuan abnormal), finance (pemilik akun setting —
wilayah BOT 4/BOT 3, bukan spec ini).

Alur A — kalibrasi (sebelum job jalan):
1. Saat BOM revision dibuat/disunting, tiap baris bahan boleh
   membawa allowance scrap persen (kebutuhan data D-01).
   Kosong/nol = BELUM dikalibrasi — tampil apa adanya sebagai
   temuan kalibrasi, dilarang sistem mengisi default global
   (vonis P1). Revisi BOM immutable existing tidak berubah:
   allowance adalah atribut baris revisi itu, revisi baru =
   kalibrasi baru.
2. Qty rencana issue baris = qty BOM × (1 + allowance) hanya
   sebagai TAMPILAN rencana di layar issue (dibulatkan pola qty
   existing Decimal(15,2)); allowance TIDAK mengubah qty stok
   yang benar-benar keluar — yang keluar tetap qty yang dicatat
   operator (BR-SC-03).

Alur B — pencatatan saat issue (titik satu-satunya):
3. Operator mengeluarkan bahan lewat jalur sah existing
   (issueMaterial PO atau MaterialIssue WO — pilih satu per WO,
   guard existing tetap). Di baris issue yang sama, operator
   boleh mencatat: qty scrap baris itu + kode alasan terstruktur
   (D-02/D-03). Default scrap 0 tanpa alasan = baris bersih,
   nol beban input tambahan (induk F-008).
4. Sistem mengklasifikasikan per baris saat COMPLETE issue
   (bukan saat draft disimpan): porsi scrap ≤ allowance baris
   BOM tertaut = NORMAL; sisanya ABNORMAL; allowance 0/kosong =
   seluruh scrap ABNORMAL (vonis P1). Snapshot klasifikasi +
   cost terbawa FIFO baris dibekukan saat complete; edit master
   BOM/item sesudah itu tidak mengubah klasifikasi lama
   (vonis §4 BOT 3).
5. Perlakuan uang mengikuti vonis persis: normal nol jurnal
   baru; abnormal mengikuti mode yang diputus BOT 1 (catat-dulu:
   tampil temuan laporan, belum jurnal; jurnal-langsung: jurnal
   P2(b) vonis dalam tx complete yang sama, akun kosong =
   complete DITOLAK berisik). Spec tidak memilih mode (Q-SC-1).
6. Sisa potong usable TIDAK dicatat sebagai scrap: operator
   membuat Remnant existing tertaut dokumen issue asal
   (kebutuhan tautan D-04; hari ini sourceType/sourceId generik
   nullable — spec mewajibkan terisi untuk remnant dari issue,
   tanpa ubah konvensi nol-stok/nol-jurnal vonis P3).

Alur C — tinjauan:
7. Kepala bengkel membuka laporan scrap (read-model baru,
   kebutuhan D-05): per item/job/periode — qty issue, qty scrap,
   rate scrap, nilai normal vs abnormal terpisah, status
   kalibrasi allowance, dan total abnormal yang direkonsiliasi
   ke jurnal akun abnormal periode itu (mode jurnal-langsung);
   selisih tampil sebagai temuan, bukan nol diam-diam (vonis P5).
8. Baris issue completed TIDAK bisa diedit klasifikasinya;
   salah catat = koreksi jurnal reversal periode terbuka oleh
   finance (vonis P4), bukan edit baris.

Dokumen masuk: BomRevision(+baris), MaterialIssue/issue PO,
Remnant existing. Dokumen keluar: snapshot klasifikasi per baris
issue + laporan scrap. Tidak ada dokumen transaksi baru.

### 3. Role / permission matrix (USULAN, izin dari katalog nyata)

Izin nyata terverifikasi module-catalog.generated.ts:253-269:
view/create/edit/delete/complete_work_orders,
view/create/edit/delete_production_orders, view/edit_production,
view_bom_revisions/manage_bom_revisions/approve_bom_revisions,
view/create/edit/delete_material_issues (:224-227),
view_reports (:411).

| Aksi | Estimator / Kepala bengkel | Operator produksi | Finance | Sales/Admin |
|---|---|---|---|---|
| Isi/ubah allowance baris BOM | `manage_bom_revisions` (reuse) | — | — | — |
| Setujui revisi BOM ber-allowance baru | `approve_bom_revisions` (reuse) | — | — | — |
| Catat scrapQty + alasan di baris issue (draft) | `edit_production_orders` / `edit_material_issues` sesuai jalur (reuse) | sama, sesuai jalur | — | — |
| Complete issue (klasifikasi terkunci; abnormal diproses per mode) | `edit_production_orders` / `edit_material_issues` sesuai jalur existing complete (reuse; Q-SC-2) | sama | — | — |
| Buat Remnant dari sisa issue | `create_material_issues` jalur existing remnant (reuse izin remnant existing; verifikasi BOT 3) | sama | — | — |
| Lihat laporan scrap + temuan kalibrasi | `view_reports` | `view_reports` | `view_reports` | — |
| Koreksi klasifikasi (reversal) | — | — | jalur jurnal manual existing (di luar spec; vonis P4) | — |

Tidak ada permission key baru yang diusulkan spec ini (Q-SC-2
membuka kemungkinan key khusus complete-ber-scrap-abnormal bila
BOT 1 menilai risiko akun; default USULAN = reuse).

### 4. Status-transition matrix

Transisi dokumen issue existing tidak berubah; yang baru =
status klasifikasi per baris (bukan status dokumen):

| Objek | Dari | Pemicu | Ke | Penjaga |
|---|---|---|---|---|
| Baris issue | draft (scrap boleh diisi/diubah) | complete issue | terklasifikasi (snapshot beku: normalQty, abnormalQty, costSnapshot) | klasifikasi dihitung server dari allowance BOM tertaut saat complete; izin jalur existing |
| Baris issue | terklasifikasi | — (terminal) | — | edit klasifikasi DITOLAK; koreksi = reversal jurnal (vonis P4) |
| Temuan abnormal | tercatat (mode catat-dulu) | flag mode diputus BOT 1 + akun terisi | terjurnal (mode jurnal-langsung, hanya baris BARU) | dilarang menjurnalkan mundur baris lama tanpa putusan eksplisit BOT 1/BOT 4 (Q-SC-1) |
| Remnant dari issue | belum ada | operator catat sisa usable | usable (existing) | tautan sumber issue wajib (D-04); nol movement stok, nol jurnal nilai |
| Allowance baris BOM | belum dikalibrasi (0/kosong) | revisi BOM baru disetujui | terkalibrasi | hanya lewat revisi BOM baru; revisi berjalan immutable |

### 5. Business rules register

| ID | Aturan | Label |
|---|---|---|
| BR-SC-01 | Scrap dicatat HANYA di baris issue pada jalur keluar sah existing (issueMaterial PO / MaterialIssue WO); tidak ada jalur keluar atau form scrap terpisah | USULAN (pola guard silang existing TERVERIFIKASI-KODE manufacturing.actions.ts:825+) |
| BR-SC-02 | allowance hidup per baris BOM (D-01); 0/kosong = belum dikalibrasi = seluruh scrap abnormal; dilarang default/allowance global karangan | TERVERIFIKASI-VONIS BOT 4 066-V P1 |
| BR-SC-03 | allowance hanya memengaruhi tampilan qty rencana + klasifikasi; qty stok keluar = qty dicatat operator | USULAN |
| BR-SC-04 | klasifikasi dihitung server saat complete, snapshot cost FIFO baris dibekukan; edit master sesudahnya tidak mengubah baris lama | TERVERIFIKASI-VONIS 066-V §4 + USULAN titik complete |
| BR-SC-05 | scrap normal: nol jurnal baru, tetap biaya job. scrap abnormal: beban periode per vonis P2(b) — akun setting baru fail-closed, tanpa fallback materialExpense/cogs | TERVERIFIKASI-VONIS 066-V P2 |
| BR-SC-06 | alasan terstruktur per baris wajib bila scrapQty > 0; enum: salah_potong / gagal_las / rusak_material / sisa_tak_terpakai / lainnya_dengan_catatan; lainnya tanpa catatan = DITOLAK | TERVERIFIKASI-VONIS 066-V P4 + USULAN penempatan validasi di complete |
| BR-SC-07 | remnant usable bukan scrap: nol movement stok, nol jurnal nilai; remnant dari issue wajib tautan sumber issue (D-04) | TERVERIFIKASI-VONIS 066-V P3 + USULAN kewajiban tautan |
| BR-SC-08 | baris issue completed terkunci klasifikasinya; koreksi hanya reversal jurnal periode terbuka | TERVERIFIKASI-VONIS 066-V P4 |
| BR-SC-09 | laporan scrap read-model server; UI tidak menentukan normal/abnormal dan tidak menghitung rate/nilai sendiri | TERVERIFIKASI-VONIS 066-V §4 (batas BOT 2) |
| BR-SC-10 | usage variance laporan varians existing tetap memuat scrap; dua laporan dilarang dijumlahkan — laporan scrap wajib memuat catatan silang verbatim (kata persis Q-SC-3) | TERVERIFIKASI-VONIS 066-V P5 |
| BR-SC-11 | mode go-live (catat-dulu vs jurnal langsung) + perlakuan baris lama saat flag menyala | BUTUH-VONIS BOT 1 (atas usulan BOT 3; vonis 066-V §4) — BUKAN keputusan spec ini |
| BR-SC-12 | scrap pada MaterialIssue manual tanpa WO/BOM tertaut (plannedQty tak ada): allowance dibaca 0 → abnormal, kecuali baris tanpa scrap | USULAN (konsekuensi jujur BR-SC-02; Q-SC-4 untuk BOT 1/BOT 3) |

### 6. Kebutuhan data (untuk BOT 3 — kebutuhan, BUKAN skema final)

- D-01: allowance persen per baris BOM revision (Decimal,
  nullable/0 = belum kalibrasi), tampil di form BOM existing.
- D-02: per baris issue (kedua jalur): scrapQty Decimal ≥ 0,
  ≤ qty baris; scrapReasonCode enum BR-SC-06 + catatan bebas
  pendamping.
- D-03: snapshot saat complete per baris: plannedQty acuan,
  allowance terpakai, normalQty, abnormalQty, cost per unit
  terbawa FIFO + total nilai normal/abnormal (sen, safeRound
  pola repo).
- D-04: tautan remnant→dokumen issue asal wajib terisi bila
  remnant lahir dari issue (memakai sourceType/sourceId existing;
  bentuk pengetatan milik BOT 3).
- D-05: read-model laporan scrap per item/job/periode +
  rekonsiliasi total abnormal vs jurnal akun setting periode.
- D-06: penanda kalibrasi per baris/item (allowance kosong) untuk
  daftar temuan kalibrasi di laporan.
- Jurnal, akun, idempotency, referenceType: persis vonis 066-V
  P2(b) — BOT 3 tetapkan nama referenceType + usulan kode akun
  keluarga 5101 ke BOT 4/BOT 1 sebelum migrasi. Spec ini tidak
  menetapkan nomor akun.

### 7. Feature matrix

| Kemampuan | Accurate | Zahir | ISF hari ini | Spec ini |
|---|---|---|---|---|
| Waste allowance per bahan di BOM/formula | belum terverifikasi help resmi run ini (kontrol ambil berlebih per hak akses: BENCHMARK URL §1) | ADA — BOM "Waste allowance", formula yield/waste/shrinkage (BENCHMARK §1) | ABSEN (BomRevisionMaterial qty saja) | D-01 per baris revisi BOM |
| Catat scrap qty + alasan terstruktur saat issue | pemakaian bahan tercatat per perintah kerja (BENCHMARK §1) | belum terverifikasi | ABSEN (actualQty polos; Remnant.scrapReason teks bebas manual) | D-02 di baris issue jalur existing |
| Pisah normal vs abnormal + beban periode | tidak diklaim | tidak diklaim | ABSEN | vonis BOT 4 066-V P1/P2 (sudah diputus, menunggu inti) |
| Laporan scrap rate/nilai per item/job | tidak diklaim | tidak diklaim | ABSEN (varians existing memuat scrap tanpa label scrap) | D-05 + catatan silang BR-SC-10 |
| Sisa usable tertaut issue asal | tidak diklaim | tidak diklaim | PARSIAL (Remnant ada, tautan generik nullable) | D-04 kewajiban tautan dari issue |

### 8. Pertanyaan terbuka

- Q-SC-1 → BOT 1 (atas usulan BOT 3): mode go-live catat-dulu
  vs jurnal-langsung + apakah baris abnormal lama ikut dijurnal
  saat flag menyala (USULAN spec: TIDAK mundur; hanya baris
  complete sesudah flag aktif). Menahan inti jurnal, TIDAK
  menahan pencatatan klasifikasi + laporan.
- Q-SC-2 → BOT 1: reuse izin complete jalur existing vs key
  khusus untuk complete yang memuat scrap abnormal (risiko
  beban periode lahir dari izin operator biasa).
- Q-SC-3 → BOT 1/BOT 2: kata verbatim catatan silang laporan
  varians↔scrap + label status kalibrasi ("Belum dikalibrasi —
  seluruh scrap terbaca abnormal") tampil persis dari backend.
- Q-SC-4 → BOT 1/BOT 3: MaterialIssue manual tanpa BOM (BR-SC-12)
  diterima sebagai abnormal-penuh, atau wajib tautan WO/BOM
  sebelum boleh mencatat scrap?
- Q-SC-5 → BOT 4 (hanya bila kasus nyata muncul): deductibility
  fiskal kerugian scrap abnormal per kasus dokumen — vonis
  066-V §3 sengaja tidak memutus; jangan dibangun sebagai aturan.

### 9. Draf acceptance

BOT 3 (backend, sesudah Q-SC-1/Q-SC-2 diputus BOT 1):
- AC-SC-B3-1: allowance baris BOM tersimpan per revisi; revisi
  lama tidak berubah saat revisi baru dikalibrasi.
- AC-SC-B3-2: complete issue dengan scrap ≤ allowance → snapshot
  normal penuh, nol jurnal abnormal (falsifikasi vonis S1).
- AC-SC-B3-3: scrap melewati allowance → hanya porsi abnormal
  yang keluar dari WIP sen persis (S2); allowance 0 → seluruhnya
  abnormal (S3) — mode jurnal-langsung saja.
- AC-SC-B3-4: akun setting kosong + ada abnormal (mode
  jurnal-langsung) → complete ditolak, nol jurnal parsial (S4);
  fallback akun diganti materialExpense → tes MERAH (S5).
- AC-SC-B3-5: edit baris issue completed (qty/scrap/alasan) →
  ditolak (S6); `lainnya` tanpa catatan → ditolak (S9).
- AC-SC-B3-6: remnant dari baris issue → tertaut sumber, nol
  StockMove, nol jurnal nilai (S7); laporan abnormal vs jurnal
  selisih → tampil temuan (S8).

BOT 2 (UI, sesudah kontrak BOT 3; UI fitur didahulukan):
- AC-SC-B2-1: form BOM tampil kolom allowance per baris + label
  belum-kalibrasi verbatim backend; UI tidak mengisi default.
- AC-SC-B2-2: form issue (kedua jalur) tampil input scrapQty +
  kode alasan per baris, qty rencana termasuk allowance tampil
  sebagai rencana (bukan qty keluar); UI tidak menghitung
  normal/abnormal/rate/nilai.
- AC-SC-B2-3: halaman laporan scrap menampilkan kolom backend
  apa adanya + catatan silang BR-SC-10 verbatim + penanda
  temuan kalibrasi/rekonsiliasi.

BOT 6 (QA):
- AC-SC-B6-1: falsifikasi S1-S9 vonis 066-V §4 di head persis
  inti BOT 3 (cabut penjaga = MERAH).
- AC-SC-B6-2: izin dicabut per matriks §3 → aksi tertolak;
  role tanpa view_reports tidak dapat laporan scrap.
- AC-SC-B6-3: mode catat-dulu: abnormal tampil di laporan,
  jurnal akun abnormal periode = 0 dan tampil sebagai mode,
  bukan selisih temuan palsu.

### 10. Yang TIDAK diusulkan run ini

- Yield/output scrap (barang jadi cacat/reject QC): domain QC/NCR
  existing (ProductionCost rework via NCR) — jangan jalur kedua.
- Scrap labor/overhead abnormal: vonis hanya bahan; jam rusak
  tetap ProductionCost existing.
- Kalibrasi allowance massal otomatis dari histori: data histori
  belum punya scrapQty; saran statistik = P2 masa depan tanpa ID.
- Blokir pengambilan melebihi perintah kerja ala Accurate:
  perilaku menahan dokumen — butuh putusan BOT 1 terpisah,
  tidak dicampur spec pencatatan ini.

### 11. Backlog implementasi (induk tetap F-2026-10-21-008; spec ini F-2026-10-22-071-S)

Urutan: BOT 1 putus Q-SC-1/Q-SC-2 (+ kata Q-SC-3) → BOT 3 inti
(D-01..D-06, penjaga vonis S1-S9, usulan kode akun ke BOT 4)
→ BOT 2 UI (AC-SC-B2) → BOT 6 acceptance (AC-SC-B6). BOT 4 hanya
kembali bila Q-SC-5 nyata. Tanpa putusan Q-SC-1, lapis aman yang
tetap boleh jalan lebih dulu: D-01/D-02/D-03 pencatatan +
klasifikasi + D-05 laporan mode catat-dulu (nol jurnal) — persis
gerbang mati pola F-006 di vonis §4.

---

## SPEC BOT 5 2026-10-22 — F-2026-10-22-070-S stok minimum per gudang + lead time (inti F-2026-10-21-013)

Spec dokumen saja, tanpa kode/schema/migrasi. Dipilih sesudah anti-duplikat
live 2026-10-22 atas `origin/main` 8506a72f: lapis aman F-013 SUDAH merged
(builder `buildMinStockByWarehouse` + loader + note verbatim, tes
min-stock-warehouse), tetapi inti `ItemWarehouseSetting` + lead time BELUM
terspec sebagai -S — grep `ItemWarehouseSetting` hanya 2 penyebutan
"komentar ditunda" (src/lib/reports/min-stock.ts:66,
min-stock-data.ts:17), nol model, nol PR/kartu -S untuk F-013. Serial
063-S..069-S (PR #497/#500/#502/#506/#507/#510) tidak disentuh. Induk
tetap F-2026-10-21-013 (c) P1; spec ini TIDAK membuat ID gap baru.
ID spec bebas: maks -S terpakai 069-S (PR #510 OPEN), jadi 070-S.

### 0. Status bukti induk (jangan dibaca ulang sebagai janji)

- `TERVERIFIKASI-KODE`: minimum hari ini SATU global per barang —
  `Item.minStock` Decimal (prisma/schema.prisma:622), ditulis master di
  src/actions/master.actions.ts:492,576. Tidak ada min per gudang,
  tidak ada lead time / safety stock / reorder point: grep
  `leadTimeDays|reorderPoint|safetyStock` di schema+reports = 0.
- `TERVERIFIKASI-KODE`: lapis aman per gudang sudah jadi dan JUJUR:
  `buildMinStockByWarehouse` membandingkan minStock GLOBAL yang sama ke
  sisa lapisan tiap gudang; gudang tanpa lapisan tidak dinilai (bukan 0).
  Note verbatim `MIN_STOCK_WAREHOUSE_NOTE` (min-stock-data.ts:21):
  "Per gudang: minimum masih global — batas Item.minStock yang sama
  dibandingkan ke stok tiap gudang; minimum per gudang belum diatur."
  Rute `/laporan/stok-minimum` (report-catalog.ts:139, registry:624).
  Spec ini mengganti SUMBER minimum builder itu, bukan builder kedua.
- `TERVERIFIKASI-KODE`: peringatan menipis masih global-total:
  `checkAndNotifyLowStock(Batch)` membandingkan `qtyOnHand <= minStock`
  total semua gudang (notification.service.ts:135,150), dipanggil cron
  src/app/api/cron/route.ts:169. Gudang bengkel kosong tertutup stok
  pusat = tidak pernah menipis di notifikasi. Itu celah inti persis.
- `TERVERIFIKASI-KODE`: bahan saran pesan parsial sudah ada —
  `VendorItemPrice` (schema:505) murni rujukan harga per vendor+item+
  minQty, TANPA leadTimeDays; `PurchaseOrder` (schema:1675) status
  string `draft` default + `PurchaseOrderItem.receivedQty`
  (schema:1722-an) untuk hitung incoming. Tidak ada builder "saran qty
  pesan" hari ini (grep incoming di min-stock* = 0).
- `TERVERIFIKASI-KODE`: izin nyata katalog — `view_items`/`edit_items`
  (module-catalog.generated.ts:70,72), `view_warehouses`/
  `edit_warehouses` (:88,90), `view_inventory` (:233), `view_reports`
  (:411), `view/create_purchase_orders` (:203,204). Tidak ada izin
  khusus pengaturan stok minimum hari ini.

### 1. Benchmark resmi (akses 2026-10-22)

- Accurate — Cara Mengatur Stok Minimum Barang: batas minimum diisi di
  detail Barang & Jasa tab Penjualan/Pembelian; daftar "Barang Stok
  Minimum" menampilkan yang di bawah batas sesudah Refresh:
  https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/barang-stok-minimum/stok-minimum-barang/
- Accurate — Mencatat Pembelian dari Stok Minimum: dari daftar stok
  minimum, isi tab Gudang + Pemasok, ceklis barang, tombol Pesan membuat
  pesanan pembelian dengan qty menyesuaikan batas minimum:
  https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/mencatat-pembelian-barang-sesuai-stok-minimum-persediaan/
- Accurate — Permintaan Barang (dari stok minimum antar gudang/cabang),
  rujukan induk F-013/F-014: https://help.accurate.id/product/permintaan-barang/
- Zahir: stok minimum per gudang + lead time belum terverifikasi dari
  help resmi run ini — label `BENCHMARK-BELUM-TERVERIFIKASI`, jangan
  dikutip sebagai fakta vendor.

Kesimpulan benchmark: Accurate membuktikan pola (a) minimum sebagai
pengingat + dasar buat PO, (b) pilihan gudang pada daftar minimum.
Minimum PER GUDANG dengan angka beda per gudang + lead time pemasok
adalah kebutuhan ISF (gudang bengkel vs pusat) — `USULAN`, bukan klaim
paritas vendor.

### 2. Workflow specification (USULAN)

Aktor: Admin gudang / kepala bengkel (atur), staf gudang (lihat),
purchasing (pakai saran), sistem cron (peringatan).

1. Admin membuka detail barang → panel "Stok minimum per gudang":
   daftar semua gudang aktif; tiap baris menampilkan stok lapisan
   gudang itu (dari builder existing), minimum efektif, dan sumbernya
   ("Warisi global" / "Diatur per gudang").
2. Admin mengisi/mengubah minimum per gudang (kosongkan = kembali
   warisi global `Item.minStock`). Simpan per baris, tercatat siapa+kapan
   (createdBy/updatedBy pola master existing).
3. Laporan stok-minimum + notifikasi membaca minimum EFEKTIF per
   (barang, gudang): override per gudang bila baris setting ada dan
   aktif, selain itu `Item.minStock` global. Note verbatim lama
   diganti hanya untuk baris yang sudah punya override (lihat BR-MS-04).
4. (Tahap 2, terpisah) Purchasing melihat kolom tambahan di laporan:
   titik pesan-ulang tampil + saran qty pesan per barang-gudang,
   lalu membuat PO manual seperti biasa. Spec ini TIDAK membuat PO
   otomatis.

Dokumen masuk: master Item, master Warehouse, lapisan stok existing,
(opsional tahap 2) VendorItemPrice + PO terbuka. Dokumen keluar: tidak
ada dokumen transaksi baru — hanya baris pengaturan + tampilan laporan/
notifikasi. Nol jurnal, nol StockMove dari pengaturan.

### 3. Role / permission matrix (USULAN, izin dari katalog nyata)

| Aksi | Admin gudang / Kepala bengkel | Staf gudang | Purchasing | Finance |
|---|---|---|---|---|
| Lihat panel minimum per gudang (di detail barang) | `view_items` | `view_items` | `view_items` | — |
| Atur/hapus override minimum per gudang | `edit_items` (reuse; Q-MS-1) | — | — | — |
| Atur leadTimeDays di harga pemasok (tahap 2) | `edit_items` (reuse; Q-MS-1) | — | `edit_items` (reuse) | — |
| Lihat laporan stok-minimum per gudang | `view_reports` | `view_reports` | `view_reports` | `view_reports` |
| Buat PO dari saran (manual, tahap 2) | — | — | `create_purchase_orders` (jalur existing) | — |

Tidak ada permission key baru diusulkan; key khusus (mis.
`edit_item_warehouse_settings`) = Q-MS-1 ke BOT 1 — menambah key =
perubahan katalog + seed, jangan diam-diam reuse bila BOT 1 menolak.

### 4. Status-transition matrix

Pengaturan bukan dokumen berstatus; transisi = keadaan baris setting:

| Dari | Pemicu | Ke | Penjaga |
|---|---|---|---|
| (belum ada baris) | admin isi minimum gudang | override aktif | qty >= 0; item aktif & bukan jasa; gudang aktif |
| override aktif | admin ubah angka | override aktif (angka baru) | terbaca laporan mulai muat berikutnya; tanpa histori versi (Q-MS-3) |
| override aktif | admin kosongkan/hapus | warisi global | laporan kembali pakai `Item.minStock`; baris terhapus tercatat di ActivityLog pola master |
| warisi global | `Item.minStock` global diubah | warisi global (angka baru) | jalur master existing, tidak diubah spec ini |
| baris setting | item dinonaktifkan / gudang dinonaktifkan | tidak dinilai | builder melewati pasangan nonaktif; baris setting tidak ikut terhapus diam-diam |

Turunan laporan (bukan status tersimpan): stok gudang <= minimum
efektif → baris "menipis" di laporan; titik pesan-ulang & saran qty
(tahap 2) selalu dihitung saat baca, tidak pernah disimpan.

### 5. Business rules register

- BR-MS-01 `TERVERIFIKASI-KODE`: hari ini minimum tunggal global
  `Item.minStock` (schema:622); lapis aman membandingkannya ke tiap
  gudang dengan note verbatim jujur (min-stock-data.ts:21). Spec ini
  tidak menulis ulang fakta itu sebagai "sudah per gudang".
- BR-MS-02 `USULAN`: sumber minimum efektif per (item, gudang) =
  override `ItemWarehouseSetting.minStock` bila baris ada; selain itu
  warisi `Item.minStock`. Default SEMUA barang = warisi (tanpa migrasi
  data massal); override hanya lahir dari tindakan admin eksplisit.
  Mitigasi risiko induk: total minimum lintas gudang tidak pernah
  dijumlahkan jadi target stok oleh sistem.
- BR-MS-03 `USULAN`: pasangan (item, gudang) tanpa lapisan stok tetap
  TIDAK dinilai (perilaku lapis aman dipertahankan) — override pada
  gudang yang tidak menyimpan barang itu tidak melahirkan baris
  "menipis 0" karangan.
- BR-MS-04 `USULAN`: kejujuran label — note laporan diganti per cakupan:
  baris ber-override tampil "Minimum per gudang"; baris warisi tetap
  membawa makna note lama. Dilarang melepas `MIN_STOCK_WAREHOUSE_NOTE`
  global sebelum semua baris benar-benar per gudang. Kata persis =
  kontrak BOT 2 (§8), jangan parafrase.
- BR-MS-05 `USULAN`: notifikasi cron ikut sumber efektif per gudang
  (gudang bengkel menipis walau pusat penuh = terbit peringatan menyebut
  nama gudang). Dedupe per (item, gudang, periode) mengikuti pola dedupe
  cron existing; jangan kirim dobel untuk pasangan sama.
- BR-MS-06 `USULAN` (tahap 2): `leadTimeDays` menempel di
  `VendorItemPrice` per (vendor, item) — pemasok utama = baris aktif
  termurah? TIDAK ditebak: pilihan pemasok untuk lead time = Q-MS-2.
  Tanpa lead time terisi, titik pesan-ulang tidak ditampilkan
  (tampil "lead time belum diatur"), bukan 0 hari karangan.
- BR-MS-07 `USULAN` (tahap 2): titik pesan-ulang tampil =
  minimum efektif + kebutuhan selama lead time; kebutuhan harian TANPA
  sumber pemakaian sah tidak boleh dikarang — sumber yang sah hanya
  riwayat MaterialIssue/penjualan terbaca builder (kontrak BOT 3
  tentukan jendela), selain itu kolom tampil "belum bisa dihitung".
- BR-MS-08 `USULAN` (tahap 2): saran qty pesan = maks(0, titik
  pesan-ulang − stok gudang − incoming PO terbuka untuk gudang itu).
  Incoming = Σ(qty − receivedQty) PO non-draft/non-cancelled; definisi
  status PO terhitung persis = kontrak BOT 3, jangan ditebak UI.
  Saran = angka tampil saja; pembuatan PO tetap manual berizin.
- BR-MS-09 `USULAN`: pengaturan tidak pernah menggerakkan stok/uang —
  simpan/hapus override menghasilkan nol StockMove, nol jurnal, nol
  reservasi. Falsifikasi BOT 6 AC-MS-6.
- BR-MS-10 `BUTUH-VONIS`: tidak ada angka uang/pajak di spec ini;
  nilai kekurangan laporan tetap qty × cost existing (bukan vonis
  baru). Bila kelak saran qty jadi dasar PO otomatis bernilai, itu
  kartu terpisah lewat BOT 4 — tahap ini TIDAK.

### 6. Feature matrix

| Kemampuan | Accurate | Zahir | ISF hari ini | Usulan 070-S |
|---|---|---|---|---|
| Batas minimum per barang | Ada (help resmi §1) | belum terverifikasi | Ada, global (schema:622) | tetap, jadi fallback |
| Minimum beda per gudang | Pilihan gudang di daftar minimum (help §1) | belum terverifikasi | Note jujur "masih global" | override per (item, gudang) |
| Buat PO dari daftar minimum | Ada, qty menyesuaikan batas (help §1) | belum terverifikasi | Manual dari laporan | tetap manual; saran qty tampil (tahap 2) |
| Lead time pemasok → titik pesan-ulang | tidak diklaim run ini | belum terverifikasi | ABSEN (grep=0) | `VendorItemPrice.leadTimeDays` + turunan baca (tahap 2) |
| Peringatan menipis per gudang | tidak diklaim run ini | belum terverifikasi | Global-total saja (cron) | per (item, gudang) efektif |

### 7. Pertanyaan terbuka (jawaban menentukan implementasi; jangan ditebak)

- Q-MS-1 → BOT 1: reuse `edit_items` untuk override + lead time, atau
  key katalog baru? (menentukan seed/katalog; spec default reuse)
- Q-MS-2 → BOT 1/BOT 3: pemasok acuan lead time per item dipilih
  bagaimana (vendor master `Item.vendorId` vs baris VendorItemPrice
  aktif termurah vs pilihan eksplisit per setting)? Jangan bangun
  turunan reorder sebelum ini diputus.
- Q-MS-3 → BOT 1: histori perubahan override perlu tabel versi, atau
  cukup ActivityLog pola master existing? (spec usulkan ActivityLog)
- Q-MS-4 → BOT 3: jendela + sumber hitung kebutuhan harian untuk
  BR-MS-07 (MaterialIssue saja / + penjualan, berapa hari)? Tanpa
  jawaban, tahap 2 berhenti di lead time tampil saja.
- Q-MS-5 → BOT 1: tahap 2 (lead time + saran) satu kartu inti dengan
  tahap 1, atau dipisah? (spec usulkan pisah: tahap 1 tidak menunggu
  Q-MS-2/4)

### 8. Draf acceptance (untuk BOT 6; falsifikasi wajib)

- AC-MS-1 (BOT 3): barang minStock global 5, override gudang bengkel 2,
  stok lapisan bengkel 3 + pusat 100 → laporan TIDAK menandai bengkel
  menipis (3 > 2), note baris bengkel "Minimum per gudang". Cabut
  pembacaan override di loader → bengkel tertandai (3 <= 5) = MERAH.
- AC-MS-2 (BOT 3): tanpa override apa pun, keluaran builder+loader
  identik perilaku lapis aman hari ini termasuk `MIN_STOCK_WAREHOUSE_NOTE`
  verbatim. Satu saja baris warisi kehilangan note kejujuran = MERAH.
- AC-MS-3 (BOT 3): override di gudang tanpa lapisan untuk barang itu →
  tidak lahir baris menipis; paksa nilai 0 ikut dinilai = MERAH (BR-MS-03).
- AC-MS-4 (BOT 3): notifikasi cron — bengkel di bawah minimum efektif,
  total global di atas minimum → peringatan terbit menyebut gudang;
  matikan sumber per-gudang di cron → peringatan hilang = MERAH.
- AC-MS-5 (BOT 2): panel detail barang tanpa `edit_items`: angka
  override tampil baca-saja, nol input aktif di DOM; dengan izin: simpan
  kosong mengembalikan label "Warisi global". UI menghitung ulang
  minimum efektif sendiri (bukan dari loader) = MERAH.
- AC-MS-6 (BOT 6): simpan/hapus override lalu hitung StockMove + jurnal
  periode itu: keduanya 0 dari aksi pengaturan (BR-MS-09).
- AC-MS-7 (BOT 6, tahap 2): lead time kosong → kolom titik pesan-ulang
  tampil "lead time belum diatur"; isi 0 karangan / saran qty lahir
  dari kebutuhan harian tanpa sumber = MERAH (BR-MS-06/07).
- AC-MS-8 (BOT 6, tahap 2): PO terbuka qty 10 received 4 untuk gudang
  tujuan sama → incoming terhitung 6; PO draft/cancelled ikut terhitung
  = MERAH (definisi status persis kontrak BOT 3 per BR-MS-08).

### 9. Backlog implementasi (turunan spec ini; induk F-2026-10-21-013)

- F-2026-10-22-070-S (spec ini, BOT 5, dokumen saja) — selesai run ini.
- Kartu BOT 3 (backend, SESUDAH Q-MS-1): model `ItemWarehouseSetting`
  (itemId, warehouseId, minStock, isActive warisan pola master,
  @@unique [itemId, warehouseId]) + aksi simpan/hapus berizin +
  loader min-stock membaca sumber efektif + cron per gudang.
  Pasangan kartu BOT 2 (frontend): panel "Stok minimum per gudang" di
  detail barang + label sumber per baris laporan, kata dari §5/BR-MS-04
  persis. UI TIDAK menunggu polish — panel fitur dulu.
- Kartu BOT 3 tahap 2 (SESUDAH Q-MS-2/4): `VendorItemPrice.leadTimeDays`
  + turunan titik pesan-ulang/saran qty di builder existing.
- Kartu BOT 6: falsifikasi AC-MS-1..8 di atas atas head BOT 3/BOT 2.

### Yang TIDAK diusulkan run ini

- PO otomatis dari stok minimum (Accurate punya tombol Pesan): ISF
  tetap manual berizin — otomatisasi pembelian = keputusan proses
  terpisah, bukan diam-diam di spec pengaturan.
- Safety stock sebagai kolom terpisah: induk menyebutnya, tetapi tanpa
  Q-MS-4 (sumber kebutuhan harian) angka safety = karangan; masuk
  tahap 2 atau tidak sama sekali, jangan kolom mati.
- Minimum per rak/row: Rack/RackRow existing cukup; per gudang saja.
---

## VONIS BOT 4 2026-10-22 — F-2026-10-22-072-V Q-TM67-2/4 jadwal termin per job (spec F-2026-10-22-067-S PR #506)

Pemilik vonis: BOT 4. Pertanyaan: Q-TM67-2 (basis persen + dampak
PPN/umur piutang) dan sisi uang Q-TM67-4 (hitung-ulang termin
pasca change order) dari spec BOT 5 F-2026-10-22-067-S (PR #506
OPEN). Kartu: t_4ce12073. Dokumen saja; tanpa kode/schema/migrasi.

### Anti-duplikat + bukti live (2026-10-22)

- origin/main `886d495e`. ID -V terpakai maks 066-V (PR #509
  MERGED); 072-V bebas per grep backlog + `gh pr list --search 072`.
- Q-BUPOT-052-1..3 SUDAH terjawab F-055-V (PR #436 MERGED) — tidak
  divonis ulang. Q-KOM-1 SUDAH divonis F-056-V (PR #440 OPEN).
  Q-CO-4 SUDAH divonis 066-V. Q-SEWA SUDAH F-042-V. Item terbuka
  bebas-dependensi berikutnya yang benar-benar belum divonis =
  Q-TM67-2/4. Hormati t_1f126c6e blocked (penutup F-058-V) — vonis
  ini tidak menyentuh rekonsiliasi F-057/F-056.
- Kode terverifikasi origin/main: builder murni
  `src/lib/reports/job-billing-progress.ts` — target kumulatif =
  persen × `Quotation.grandTotal` berjalan; `billedAmountExcludingCancelled`
  = Σ `grandTotal` invoice non-cancelled; header file: "DP BUKAN
  tagihan (vonis accountant F-03)". Loader
  `job-billing-summary-data.ts:12` menegaskan inti termin belum
  ada. Aging AR existing (`src/lib/reports/aging.ts`) bucket dari
  `dueDate` invoice, bukan dari jadwal.

### Vonis 1 — Q-TM67-2(a): basis persen = grandTotal berjalan TERMASUK PPN, tanpa basis kedua

SAH dan mengikat: target termin = persen kumulatif ×
`Quotation.grandTotal` berjalan persis seperti builder existing.
Alasan: (1) grandTotal adalah nilai kontraktual yang disetujui
pelanggan (DPP + PPN + komponen lain sebagaimana terbit di
quotation); memecah basis ke DPP-saja akan melahirkan angka termin
yang tidak pernah disetujui pelanggan dan tidak rekonsiliasi ke
Σ invoice (yang juga grandTotal per baris
`billedAmountExcludingCancelled`). (2) Jadwal adalah RENCANA
penagihan komersial, bukan dokumen pajak — basisnya mengikuti
dokumen komersial sumbernya.

Syarat:
- Satu basis saja. Dilarang menambah basis DPP, basis ex-PPN, atau
  toggle basis di UI/loader. Bila kelak ada kebutuhan termin atas
  DPP (mis. kontrak pemerintah pemungut), itu fitur terpisah
  BUTUH-VONIS baru.
- Persen `Decimal(5,2)`, target sen via pola existing
  (`safeMultiply`/`safeRound` sen); total target semua termin
  persis = grandTotal berjalan, sisa pembulatan di termin
  terakhir (persis edge spec §5 PR #506).
- Snapshot jejak amendemen (BR-TM67-02) hanya jejak historis;
  target aktif selalu dihitung dari grandTotal berjalan, bukan
  dari snapshot.

### Vonis 2 — Q-TM67-2(b): jadwal TIDAK berdampak PPN, pendapatan, piutang, maupun umur piutang

DIKONFIRMASI BR-TM67-08. Mencatat/mengubah/membatalkan jadwal
termin:
- TIDAK menerbitkan invoice, DP, pembayaran, jurnal, faktur
  pajak, atau dokumen pajak apa pun (selaras BR-TM67-03).
- TIDAK mengubah saat terutang PPN. Saat terutang tetap mengikuti
  peristiwa penyerahan/pembayaran pada dokumen nyata (invoice/DP
  existing), bukan tanggal rencana di jadwal. Dasar: UU PPN
  (UU 8/1983 jo. UU 42/2009 jo. UU 7/2021 HPP) Pasal 11 —
  terutang saat penyerahan BKP/JKP, atau saat pembayaran bila
  pembayaran diterima sebelum penyerahan. URL resmi DJP:
  https://pajak.go.id/id/undang-undang-nomor-8-tahun-1983
  (diakses 2026-10-22). Jadwal tidak memuat penyerahan maupun
  pembayaran, maka tidak memicu ayat mana pun.
- TIDAK mengubah umur piutang (aging). Aging tetap dihitung dari
  `dueDate` invoice terbit (`aging.ts` existing). `dueDate` di
  baris jadwal adalah tanggal rencana administratif (BR-TM67-07)
  dan DILARANG dipakai sebagai input aging, denda, atau provisi
  piutang. Bila UI menampilkan keduanya, label wajib beda:
  "Jadwal kesepakatan" vs jatuh tempo invoice.
- TIDAK mengubah pengakuan pendapatan/piutang: tetap lahir saat
  invoice terbit/posting lewat jalur existing.

### Vonis 3 — Q-TM67-4 sisi uang: hitung-ulang otomatis, termin terpenuhi TIDAK ditulis ulang, kelebihan lewat kredit existing

Sesudah change order/revisi menaikkan atau menurunkan grandTotal:
1. Target nominal termin BELUM terpenuhi dihitung ulang otomatis
   dari persen × grandTotal baru. Tidak perlu amendemen manusia
   hanya karena nilai berubah (mengikuti rekomendasi USULAN spec).
   Amendemen beralasan (BR-TM67-06) hanya bila manusia mengubah
   persen/tanggal/nama termin.
2. Termin sudah terpenuhi TIDAK ditulis ulang dan TIDAK ditagih
   ulang. Status terpenuhi diukur dari tertagih kumulatif
   (`billedAmountExcludingCancelled`), bukan dari target baru.
3. Bila grandTotal TURUN sehingga tertagih/DP-confirmed melebihi
   nilai baru: kelebihan ditangani jalur existing
   `createRevisionDownCredit` / kredit DownPayment per DP sumber
   (pola header job-billing-progress.ts F-59-aman), BUKAN kredit
   baru dari jadwal, BUKAN faktur negatif, BUKAN jurnal langsung
   dari jadwal. Selaras vonis 066-V Vonis 2.
4. Transisi mundur status termin karena nilai turun (terpenuhi →
   terpenuhi_sebagian) WAJIB tampil sebagai delta, tidak
   disembunyikan (persis spec §4).
5. Jadwal tidak pernah menjadi jalur nilai kedua: perubahan nilai
   jual tetap lewat quotation revisi/change order
   (F-2026-10-20-103), jadwal hanya membaca hasilnya.

### Larangan

- Basis DPP/ex-PPN, toggle basis, atau persen dihitung UI.
- dueDate jadwal sebagai input aging/denda/provisi.
- Invoice/DP/jurnal/faktur pajak lahir dari aksi jadwal.
- Menulis ulang termin terpenuhi atau menagih ulang porsinya.
- Kredit/faktur negatif/jurnal penyeimbang lahir dari jadwal saat
  nilai turun.

### Falsifikasi wajib BOT 6 (atas head BOT 3)

1. Jadwal dibuat/diubah/dibatalkan → jumlah baris invoice, DP,
   jurnal, faktur pajak sebelum-sesudah SAMA. Menambah satu saja
   = MERAH.
2. Basis: quotation grandTotal Rp111.000.000 (DPP 100jt + PPN
   11jt), termin 50% → target persis Rp55.500.000. Target
   Rp50.000.000 (basis DPP) = MERAH.
3. Aging: invoice dueDate lewat 40 hari tanpa jadwal & dengan
   jadwal dueDate lampau → bucket sama persis dari dueDate
   invoice. Bucket berubah karena jadwal = MERAH.
4. CO naik: grandTotal 100jt → 120jt, termin 1 50% sudah
   tertagih 50jt → termin 1 tetap terpenuhi 50jt (tidak ditagih
   ulang), termin belum-terpenuhi dihitung dari 120jt.
5. CO turun: grandTotal 100jt → 80jt, tertagih 90jt → kelebihan
   hanya kandidat kredit RevisionDown existing; jadwal sendiri
   melahirkan 0 kredit/jurnal/faktur negatif.
6. Pembulatan: grandTotal Rp1, persen 33/33/34 → Σ target persis
   Rp1 (selisih 1 sen = MERAH).

### Klaim kepatuhan

Klaim PPN di Vonis 2 berdasar UU PPN Pasal 11 (UU 8/1983 jo.
UU 42/2009 jo. UU 7/2021), teks resmi DJP
https://pajak.go.id/id/undang-undang-nomor-8-tahun-1983, diakses
2026-10-22; cakupan: saat terutang atas penyerahan/pembayaran
nyata. Sisanya perlakuan internal dokumen komersial (jadwal,
quotation, invoice) — bukan klaim SPT. Q-TM67-1/3/5 tetap milik
BOT 1; bentuk fisik jadwal tetap BOT 3 sesudah putusan itu.

ID vonis ini **F-2026-10-22-072-V** (pasangan spec
F-2026-10-22-067-S PR #506; seri -V bebas tabrakan per grep
origin/main + PR live 2026-10-22, maks -V 066-V). Pemilik
berikutnya: BOT 1 (Q-TM67-1/3/5) -> BOT 3 (inti jadwal; basis +
penjaga vonis ini) -> BOT 2 (UI label "Jadwal kesepakatan") ->
BOT 6 falsifikasi 1-6 di atas. Vonis yang membuka pekerjaan uang
ini wajib jadi parent kartu BOT 3/BOT 2 terkait.

---

## SPEC BOT 5 2026-10-22 — F-2026-10-22-081-S penerimaan transfer parsial + tutup selisih (inti F-2026-10-21-015)

Spec dokumen saja, tanpa kode/schema/migrasi. Induk: F-2026-10-21-015
(c) P2 — Penerimaan transfer selalu penuh; selisih/rusak di perjalanan
tak tercatat. Spec ini = F-2026-10-22-081-S. Anti-duplikat run ini:
maks ID terbuka terverifikasi = F-2026-10-22-080-V (PR #527); grep
backlog origin/main + `gh pr list` untuk 081 = 0; tidak ada kartu
kanban / PR / spec untuk inti F-015 (yang ada hanya vonis BOT 4
t_0e45367a, PR #410 MERGED). Hindari serial F-063..F-080 yang sudah
terbit.

### 0. Verifikasi live origin/main b4046e30 (2026-10-22, run ini)

Sudah ada (TERVERIFIKASI-KODE):
- `InventoryTransfer` + `InventoryTransferItem`
  (prisma/schema.prisma:2157,2181): sourceWarehouseId,
  destinationWarehouseId, `status` String default `draft`, item hanya
  `qty` Decimal(15,2) + `serialNumbers`/`batchAllocations` Json?
  (atribusi lot/serial saat process). TIDAK ada `receivedQty`,
  tidak ada status parsial.
- Aksi existing (src/actions/inventory.actions.ts):
  `createInventoryTransfer` (:321, izin `create_inventory_transfers`),
  `processInventoryTransfer` (:375, izin `edit_inventory_transfers`,
  klaim atomik draft->processing->processed),
  `receiveInventoryTransfer` (:449, izin `edit_inventory_transfers`,
  klaim atomik processed->receiving->received dalam SATU transaksi).
  Receive saat ini all-or-nothing: hook mengakumulasi SELURUH qty
  per item lalu status langsung `received`.
- Hook (src/lib/hooks/inventory-transfer.hook.ts):
  `onTransferProcessed` consume FIFO sumber + StockMove OUT pada
  carried cost; `onTransferReceived` (:155 dst) menjaga idempotency
  dengan "IN moves sudah ada -> lewati total" (:170-183), lalu
  StockMove IN tujuan per item teragregasi pada `carriedCostByItem`
  dari OUT move, `createInLayer` tujuan, revive serial berstatus
  `used`->`available`, lot tujuan per alokasi batch; item
  batch-tracked tanpa alokasi lot DITOLAK (:265-271).
- Transfer = subledger-only, NOL jurnal GL (vonis BOT 4 §Fakta,
  komentar kartu t_0e45367a #361/#365; grep InventoryTransfer di
  jalur jurnal = 0). Nilai pindah lokasi, total persediaan GL tidak
  berubah selama barang di jalan.
- Laporan pemeriksaan existing: `transfer-in-transit.ts` +
  `transfer-in-transit-data.ts` membaca transfer berstatus persis
  `processed` (`IN_TRANSIT_TRANSFER_STATUS = "processed"`) dan
  menilai dari StockMove OUT (qty x cost terbawa); peringatan umur
  >60 hari sudah ada. Laporan ini BELUM mengenal sisa parsial.
- `StockAdjustment` (schema:2105) + `StockAdjustmentItem` (:2135):
  reason Text, status draft->processed, approvedBy/approvedAt dari
  mesin approval; `createStockAdjustment`
  (inventory.actions.ts:113) memanggil
  `requestApprovalIfConfigured("StockAdjustment", ...)`;
  `processStockAdjustment` (:219) menuntut `assertApproved` +
  izin `process_stock_adjustments`; jurnal existing Dr/Cr
  Persediaan vs Akun Penyesuaian Stok dari SystemSetting,
  fail-closed bila akun kosong (stock-adjustment.hook.ts,
  stock-journal.service.ts — pola vonis BOT 4).
- Izin katalog nyata (src/lib/auth/module-catalog.generated.ts:
  238-241): view/create/edit/delete_inventory_transfers — TIDAK
  ada key process/receive/approve terpisah untuk transfer; aksi
  process/receive existing memakai `edit_inventory_transfers`.
  Izin penyesuaian (:228-232): view/create/edit/delete/
  process_stock_adjustments.
- Scope gudang: `getWarehouseScope` (src/lib/auth/warehouse-scope.ts:
  22, all/assigned/none fail-closed); receive existing menjaga
  `assertWarehouseAccess(destinationWarehouseId)` — penerima wajib
  punya scope gudang TUJUAN.
- Halaman detail transfer existing
  (src/app/(dashboard)/inventaris/transfer/[slug]/page.tsx:100-107):
  tombol "Terima" hanya status `processed`, konfirmasi generik,
  TANPA input qty terima per baris. Form transfer
  (inventory-transfer-form.tsx) hanya qty kirim.
- Label status existing (src/lib/utils/status-labels.ts):
  `processed` = "Diproses", `received` = "Diterima",
  `partial` = "Sebagian" (generik). Status `processed` saat ini
  bermakna ganda: "sudah dikirim, belum diterima sama sekali".

Belum ada / salah (TERVERIFIKASI-KODE, grep origin/main run ini):
- `receivedQty` di InventoryTransferItem = 0; status
  `partially_received` = 0 di schema+src. Terima 8 dari 10 hari ini
  MUSTAHIL dicatat: receive selalu memasukkan 10 dan menutup
  `received`; selisih 2 hilang dari semua catatan (bukan stok
  tujuan, bukan in-transit, bukan selisih).
- Idempotency receive per-transfer ("IN pertama ada -> skip
  total") MEMBLOKIR terima susulan secara desain; wajib diganti
  per kejadian terima (vonis BOT 4 V-5(b)).
- Tidak ada kejadian/riwayat terima per tanggal: tanggal terima
  sendiri tidak tercatat (hanya `transfer.date` kirim); pertanyaan
  vonis Q-F015-A (tanggal kejadian untuk period-lock + potong
  laporan) belum terjawab di kode.
- Tidak ada jalan "tutup selisih": status `received` bisa dicapai
  tanpa keputusan apa pun atas sisa; larangan vonis BOT 4
  ("status received saat receivedQty < qty tanpa keputusan
  tutup-selisih eksplisit") belum terimplementasi.

Keputusan yang TIDAK diambil spec ini: akun/jurnal baru (DILARANG
vonis BOT 4 — jurnal hanya lewat StockAdjustment existing saat
disposisi final), gudang virtual in-transit (DILARANG vonis —
sisa tampil sebagai turunan terkirim-diterima), klaim
kurir/asuransi (Q-015-3, di luar spec), ongkir dikapitalisasi
(Q-F015-D, pola existing = tidak), mutu barang rusak yang qty-nya
utuh (diterima dulu, musnahkan lewat adjustment — vonis BOT 4
V-2(d)).

### 1. Workflow specification

Aktor: Pengirim (staf gudang sumber), Penerima (staf gudang
tujuan, scope tujuan), Penutup selisih (staf tujuan yang membuat
StockAdjustment), Penyetuju penyesuaian (orang BERBEDA dari
pembuat, lewat mesin approval StockAdjustment existing).

Dokumen masuk: InventoryTransfer berstatus `processed` (StockMove
OUT + alokasi serial/batch sudah beku dari process existing).
Dokumen keluar: (a) StockMove IN per KEJADIAN terima sebesar qty
diterima pada carried cost OUT; (b) bila ditutup bersisa:
StockAdjustment alasan persis "selisih transfer" tertaut transfer
ini; (c) TIDAK ada dokumen/jurnal lain dari receive parsial.

Alur:
1. Penerima buka detail transfer `processed` atau
   `partially_received`, klik "Terima Barang". Form terima per
   baris: kolom Terkirim (qty dokumen), Sudah Diterima
   (receivedQty kumulatif tersimpan), Diterima Kali Ini (input,
   default = sisa), satuan tampil. Untuk item berserial: pilih
   serial yang tiba dari daftar serial terkirim (sumber:
   `serialNumbers` baris transfer); untuk batch-tracked: alokasi
   lot per qty diterima wajib (pola penolakan existing).
2. Simpan terima = SATU kejadian: server validasi per baris
   (lihat BR-TP), buat StockMove IN + layer tujuan HANYA sebesar
   qty kali ini pada carried cost, revive HANYA serial yang
   dipilih, tambah receivedQty kumulatif, catat kejadian (tanggal
   terima + penerima + qty per baris — bentuk fisik Q-TP-2 BOT 3).
   Status sesudahnya: semua baris penuh -> `received`; masih ada
   sisa -> `partially_received`.
3. Terima susulan: langkah 1-2 berulang dari
   `partially_received` untuk sisa; idempotency per kejadian
   (BUKAN per transfer): kejadian yang sama di-retry tidak
   menggandakan IN (kunci fisik Q-TP-2, mis. baris kejadian unik
   per submit / klaim status transien pola existing).
4. Keputusan sisa tidak tiba: penerima memilih "Tutup Selisih"
   pada transfer `partially_received` (atau `processed` yang tak
   pernah diterima sama sekali) -> sistem membuat DRAF
   StockAdjustment di gudang TUJUAN? BUKAN — lihat BR-TP-07:
   selisih mengurangi nilai yang sudah KELUAR dari sumber dan
   tidak pernah masuk tujuan; adjustment dibuat pada konteks
   yang diputus BOT 3 mengikuti pola subledger existing
   (Q-TP-3), alasan wajib persis "selisih transfer", baris per
   item sisa dengan serial/batch sisa tertera, nilai = sisa x
   carried cost OUT. Draf itu lalu wajib approval orang berbeda
   + process lewat jalur StockAdjustment existing persis
   (assertApproved, akun setting fail-closed). Transfer menjadi
   `received` (tertutup) HANYA sesudah adjustment itu processed;
   sebelum itu status tampil "menunggu penutupan selisih"
   (status fisik Q-TP-2 — usulan `partially_received` tetap,
   penanda turunan dari adjustment tertaut belum processed).
5. Barang tiba rusak tapi qty utuh: diterima PENUH sebagai
   diterima (bukan selisih); pemusnahan = StockAdjustment
   terpisah di tujuan sesudah diterima, di luar alur ini
   (vonis BOT 4 V-2(d)).

### 2. Bentuk data usulan (USULAN — fisik final BOT 3)

- `InventoryTransferItem.receivedQty` Decimal(15,2) default 0
  (pola persis `PurchaseOrderItem.receivedQty` schema:1709 —
  preseden vonis BOT 4). Backfill baris lama = 0; transfer lama
  berstatus `received` diperlakukan penuh secara turunan
  (receivedQty efektif = qty bila status received pra-fitur —
  tampilkan dari status, JANGAN tulis ulang massal diam-diam;
  keputusan backfill fisik = Q-TP-2).
- Riwayat kejadian terima: bentuk final BOT 3 (tabel kejadian
  per terima: transferId, tanggal terima, receivedBy, baris
  itemId+qty+serial/batch terpilih). Spec mengikat ISI (tanggal
  kejadian sendiri untuk assertPeriodOpen per kejadian — vonis
  V-5(d); penerima; rincian serial/batch), bukan nama tabel.
- Tautan penutupan: StockAdjustment tertaut transfer (kolom/
  relasi final BOT 3) supaya "satu transfer, satu penutupan" bisa
  dijaga unik dan sisa tidak ditutup dua kali.
- TIDAK ada kolom harga baru: carried cost selalu dibaca dari
  StockMove OUT existing per (transfer,item), tidak pernah dari
  Item.cost/harga master berjalan.
- TIDAK ubah `InventoryTransferItem.qty` (terkirim beku),
  TIDAK akun COA baru, TIDAK gudang virtual.

### 3. Status-transition matrix (USULAN; status String pola repo)

| Dari | Pemicu | Ke | Penjaga |
|---|---|---|---|
| draft | proses kirim (existing) | processed | existing, tidak berubah |
| processed | terima, semua baris penuh dalam 1 kejadian | received | izin terima §4 + scope tujuan; receivedQty akhir = qty per baris |
| processed | terima, ada baris bersisa | partially_received | sama; sisa = qty - receivedQty > 0 terbaca per baris |
| partially_received | terima susulan, kini penuh | received | klaim atomik status; kumulatif tidak boleh > terkirim |
| partially_received | terima susulan, masih bersisa | partially_received | sama |
| processed / partially_received | ajukan tutup selisih | (tetap) + draf StockAdjustment "selisih transfer" tertaut lahir | alasan konteks wajib; hanya SATU draf penutupan aktif per transfer |
| (penutupan diajukan) | adjustment tertaut processed (approval orang lain) | received | sistem dari jalur adjustment; sisa dianggap hilang/rusak final |
| (penutupan diajukan) | adjustment tertaut ditolak/dibatalkan | partially_received (atau processed bila belum pernah terima) | sisa kembali terbuka; boleh terima susulan atau ajukan ulang |
| received | terima / tutup selisih lagi | DITOLAK | terminal; koreksi hanya dokumen baru terpisah |

Status transien klaim (`receiving` existing) dipertahankan di
dalam satu kejadian saja; kegagalan mengembalikan ke status
sebelum kejadian (processed/partially_received), pola restore
existing. Kata tampil §6.

### 4. Role/permission matrix (izin katalog TERVERIFIKASI-KODE)

| Aksi | Izin | Scope | Status |
|---|---|---|---|
| Lihat daftar/detail transfer | view_inventory_transfers | dokumen scope existing | TERVERIFIKASI-KODE |
| Proses kirim | edit_inventory_transfers | gudang sumber | TERVERIFIKASI-KODE (existing) |
| Terima (penuh/parsial/susulan) | edit_inventory_transfers | gudang TUJUAN wajib | TERVERIFIKASI-KODE izinnya; perilaku parsial USULAN spec ini |
| Ajukan tutup selisih (lahirkan draf adjustment) | create_stock_adjustments | gudang konteks adjustment Q-TP-3 | USULAN memakai izin existing adjustment |
| Setujui penyesuaian selisih | mesin approval StockAdjustment (assertApproved) | orang berbeda dari pembuat | TERVERIFIKASI-KODE pola existing |
| Proses penyesuaian selisih | process_stock_adjustments | sama | TERVERIFIKASI-KODE |
| Ubah qty terkirim sesudah processed | DILARANG siapa pun | - | USULAN (qty beku; koreksi = transfer baru) |

Tidak ada key izin baru di spec ini. Bila BOT 1 menghendaki izin
terima terpisah dari edit transfer, itu perubahan katalog =
keputusan BOT 1 di luar spec (jangan karang key di implementasi).

### 5. Business rules register

| ID | Aturan | Label |
|---|---|---|
| BR-TP-01 | Terima diakui PER KEJADIAN sebesar qty benar-benar diterima, pada carried cost StockMove OUT (FIFO sumber); bukan qty terkirim penuh, bukan harga master | VONIS BOT 4 V-1 (t_0e45367a) + TERVERIFIKASI-KODE pola carried cost hook existing |
| BR-TP-02 | receivedQty kumulatif per baris: 0 <= receivedQty <= qty terkirim; terima kali ini > sisa = DITOLAK keras server | VONIS BOT 4 V-5(e) |
| BR-TP-03 | Status `received` HANYA bila (semua baris penuh) ATAU (sisa ditutup adjustment processed); received bersisa tanpa penutupan = dilarang | VONIS BOT 4 (larangan eksplisit) |
| BR-TP-04 | Selama belum ditutup: sisa tetap in-transit (terkirim - diterima), NOL jurnal, NOL beban, tampil di laporan terkirim-belum-diterima sebagai SISA (bukan qty penuh) | VONIS BOT 4 V-2(a) + USULAN perluasan laporan existing §7 |
| BR-TP-05 | Jurnal hanya SATU titik: StockAdjustment alasan persis "selisih transfer" saat disposisi final, Dr Akun Penyesuaian Stok / Cr Persediaan = sisa x carried cost OUT; akun dari SystemSetting existing, kosong = fail-closed berisik | VONIS BOT 4 V-3 (mengikat BOT 4: angka/akun ini BUKAN usulan BOT 5) |
| BR-TP-06 | Idempotency per KEJADIAN terima, bukan per transfer; guard lama "IN ada -> lewati total" dilarang untuk jalur parsial; retry kejadian sama tidak menggandakan stok | VONIS BOT 4 V-5(b) |
| BR-TP-07 | Konteks gudang adjustment penutupan + apakah subledger sisa perlu StockMove penyeimbang: rancangan BOT 3 (Q-TP-3) dengan syarat hasil akhir: GL turun persis sisa x carried cost DAN laporan per-gudang/in-transit tidak menghitung sisa tertutup lagi | BUTUH-VONIS Q-TP-3 (BOT 3, eskalasi BOT 1 bila menyentuh makna stok per gudang) |
| BR-TP-08 | Serial: hanya serial terpilih kali ini yang revive ke tujuan; serial sisa tetap tercatat belum diterima DAN wajib tertera di draf penutupan; batch: alokasi lot per qty diterima wajib, tanpa lot = ditolak (pola existing) | VONIS BOT 4 V-5(c) + TERVERIFIKASI-KODE penolakan batch existing |
| BR-TP-09 | Setiap kejadian terima memakai TANGGAL KEJADIAN sendiri untuk assertPeriodOpen + jejak penerima; tanggal kirim tidak dipakai ulang untuk terima lintas periode | BUTUH-VONIS Q-TP-1 (BOT 1/BOT 3; vonis BOT 4 Q-F015-A menamai, belum memutus) |
| BR-TP-10 | Barang rusak qty utuh = diterima penuh; bukan selisih; musnahkan lewat adjustment terpisah di tujuan | VONIS BOT 4 V-2(d) |
| BR-TP-11 | Klaim kurir/ekspedisi atas selisih: TIDAK dibangun; selisih final = beban penyesuaian (BR-TP-05) sampai ada putusan proses bisnis lain | VONIS BOT 4 V-4/Q-015-3 (BUTUH-VONIS pemilik proses bila kelak dibuka) |
| BR-TP-12 | Siapa berwenang menyatakan sisa hilang/rusak final + batas umur tunggu sebelum wajib ditutup: spec mengusulkan yang berwenang = pemegang create_stock_adjustments di konteks tujuan DENGAN approval orang berbeda (pola existing), dan laporan in-transit menandai umur >60 hari (peringatan existing); angka batas wajib-tutup TIDAK ditebak | USULAN + BUTUH-VONIS Q-TP-4 (BOT 1/pemilik proses) |
| BR-TP-13 | MaterialRequest F-078 (F-2026-10-22-078-S): pemenuhan permintaan dihitung dari receivedQty kumulatif spec ini; sebelum spec ini live, terima = penuh per transfer (label jujur di spec F-078 §8) | TERVERIFIKASI-KODE (ketergantungan tercatat dua arah) |
| BR-TP-14 | Ongkir transfer internal TIDAK dikapitalisasi ke layer tujuan; layer tujuan = carried cost murni pola existing | TERVERIFIKASI-KODE pola existing; mengubahnya = kebijakan akuntansi baru BUTUH-VONIS BOT 4 (Q-F015-D) — spec ini tidak meminta |

### 6. Feature matrix (BENCHMARK, akses 2026-10-22)

| Aspek | Accurate | Zahir | ISF (spec ini) |
|---|---|---|---|
| Kirim-terima dua tahap | Pemindahan Barang: Proses Kirim lalu Terima mengambil dokumen kirim — https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/pemindahan-barang/mencatat-pemindahan-barang-antar-gudang/ | Transfer Barang Antar Gudang satu dokumen gudang asal->tujuan + jurnal — https://help.zahironline.com/portal/id/kb/articles/trans | Dua tahap existing dipertahankan (processed -> terima) |
| Terima sebagian + sisa belum diterima | Terima menampilkan rincian kirim; kasus hilang/rusak: terima yang baik, sisa dikeluarkan via Penyesuaian Persediaan (Ambil dari Pemindahan, menampilkan sisa belum diterima), status menjadi Diterima Seluruhnya dengan kolom Kts. Tidak Diterima — https://help.accurate.id/product/accurate-online/fitur-aol/persediaan/gudang/mencatat-persediaan-yg-hilang-rusak-saat-pengiriman-antar-gudang/ | Tidak ditemukan terima parsial/selisih perjalanan di URL resmi di atas | Samakan pola Accurate: terima parsial berulang + penutupan sisa via Penyesuaian Stok tertaut; beda sadar: adjustment ISF wajib approval orang berbeda (pola opname existing) |
| Akun selisih | Akun penyesuaian dipetakan di Preferensi (contoh Beban Barang Rusak) | Adjustment per gudang berjenjang kewenangan — https://www.zahironline.com/kontrol-gudang/ | Akun Penyesuaian Stok SystemSetting existing, fail-closed (vonis BOT 4, tanpa akun baru) |

Kata tampil UI (USULAN, untuk BOT 2 verbatim sesudah kontrak
BOT 3): status tampil: `processed` yang belum diterima sama
sekali = "Dalam Perjalanan"; `partially_received` = "Diterima
Sebagian"; `received` = "Diterima" (existing); kolom baris:
"Terkirim", "Sudah Diterima", "Belum Diterima", dan saat terima:
"Diterima Kali Ini"; tombol: "Terima Barang", "Terima Susulan",
"Tutup Selisih"; draf penutupan berlabel alasan persis
"selisih transfer". Peringatan jujur wajib tampil di form
tutup: "Sisa akan dihapus dari persediaan lewat Penyesuaian
Stok sesudah disetujui. Barang yang ternyata tiba sesudah
ditutup tidak bisa diterima dari transfer ini."

### 7. Dampak laporan existing (wajib, bukan tambahan bebas)

- `transfer-in-transit-data.ts`: himpunan "masih di jalan"
  menjadi status `processed` (sisa = qty penuh) DITAMBAH
  `partially_received` (sisa = qty - receivedQty per baris);
  nilai sisa = sisa x carried cost OUT per baris, BUKAN qty
  penuh. Transfer `received` (termasuk yang ditutup selisih)
  keluar dari daftar. Tanpa perubahan ini laporan menghitung
  barang yang sudah diterima sebagian seolah masih utuh di
  jalan (SALAH sesudah fitur live).
- Umur dihitung dari tanggal kirim (existing); kejadian terima
  terakhir boleh tampil sebagai info, tidak mengganti umur.
- MaterialRequest (F-078) membaca receivedQty yang sama; tidak
  ada hitungan pemenuhan kedua.

### 8. Acceptance criteria + edge cases (BOT 6, falsifikasi)

1. AC-TP-1: Kirim 10, terima 8 -> tujuan +8 lapis @ carried
   cost, receivedQty=8, status Diterima Sebagian, GL jurnal
   bertambah = MERAH; sisa tampil 2 di laporan in-transit
   senilai 2 x carried cost (bukan 10).
2. AC-TP-2: Susulan terima 2 -> total IN = 10 = OUT, status
   received, adjustment lahir = MERAH. Cabut perbaikan
   idempotency per kejadian (pulihkan guard skip-total lama)
   -> terima susulan tertolak/dilewati = MERAH.
3. AC-TP-3: Terima kali ini 3 dari sisa 2 -> ditolak server;
   receivedQty melebihi terkirim di data = MERAH.
4. AC-TP-4: Tutup selisih 2 hilang -> draf adjustment alasan
   persis "selisih transfer"; sesudah approval orang berbeda +
   processed: jurnal Dr Penyesuaian/Cr Persediaan = 2 x carried
   cost OUT, seimbang; transfer menjadi received; sisa hilang
   dari laporan in-transit. Jurnal lahir saat receive parsial
   = MERAH (vonis V-3).
5. AC-TP-5: Self-approve penutupan (pembuat = penyetuju) ->
   ditolak mesin approval existing; stockAdjustmentAccountId
   kosong -> gagal berisik, transfer TIDAK menjadi received.
6. AC-TP-6: Penutupan ditolak/dibatalkan -> transfer kembali
   terbuka (partially_received), terima susulan 2 masih bisa
   dan menutup penuh tanpa adjustment; status received
   prematur = MERAH.
7. AC-TP-7: Item berserial 5: terima 3 serial terpilih ->
   hanya 3 revive available di tujuan; 2 sisa tertera di draf
   penutupan; tutup selisih tanpa menyebut serial sisa = MERAH.
   Item batch-tracked: terima parsial tanpa alokasi lot ->
   ditolak (pola existing).
8. AC-TP-8: Dua penerima bersamaan atas sisa sama (klaim
   atomik): total diterima kumulatif tidak melebihi terkirim;
   kejadian ganda dari retry submit sama tidak menggandakan
   StockMove IN.
9. AC-TP-9: Role tanpa edit_inventory_transfers / tanpa scope
   gudang tujuan menjalankan terima langsung (panggil aksi)
   -> ditolak server; tombol hilang saja tidak cukup.
10. AC-TP-10: Terima penuh satu kejadian pada transfer biasa
    (regresi existing): perilaku = received langsung, tes
    transfer existing hijau; transfer lama pra-fitur berstatus
    received tampil penuh (bukan sisa qty).
11. AC-TP-11: Barang rusak qty utuh diterima penuh lalu
    dimusnahkan adjustment tujuan terpisah: alur tutup selisih
    transfer tidak ikut campur; receivedQty berkurang karena
    rusak = MERAH.
12. AC-TP-12: Periode kejadian terima tertutup (sesudah
    Q-TP-1 diputus): terima ditolak fail-closed menyebut
    periode; memakai tanggal kirim untuk lolos = MERAH.

Edge: baris qty pecahan (Decimal 15,2 — terima 2,50 dari 10);
item sama muncul dua baris dalam satu transfer (agregasi
existing dipertahankan per item untuk cost, receivedQty tetap
per BARIS dokumen — konflik fisik = Q-TP-2 BOT 3, jangan
digabung diam-diam); transfer processed pra-fitur yang belum
diterima (receivedQty=0 sah, langsung bisa parsial); gudang
tujuan dinonaktifkan sesudah kirim (tampil, aksi ditolak
beralasan — perilaku final BOT 3).

### 9. Pertanyaan terbuka & pemilik berikut

| ID | Pertanyaan | Pemilik |
|---|---|---|
| Q-TP-1 | Tanggal kejadian terima sendiri (field + assertPeriodOpen per kejadian + potong laporan) — vonis BOT 4 Q-F015-A menamai, belum memutus bentuknya | BOT 1 putus perilaku; BOT 3 fisik |
| Q-TP-2 | Fisik riwayat kejadian terima + kunci idempotency per kejadian + receivedQty per baris vs per item teragregasi + backfill transfer received pra-fitur | BOT 3 |
| Q-TP-3 | Konteks gudang StockAdjustment penutupan + perlakuan subledger sisa (BR-TP-07) | BOT 3; eskalasi BOT 1 bila mengubah makna stok per gudang |
| Q-TP-4 | Pejabat penentu hilang/rusak final + batas umur wajib-tutup (BR-TP-12) | BOT 1 / pemilik proses |
| Q-TP-5 | Buka inti migrasi receivedQty + status parsial (vonis BOT 4 Q-015-1) — tanpa ini DEFAULT-AMAN existing tetap all-or-nothing | BOT 1 |

Dependensi BOT 4 (eksplisit): vonis uang/akun untuk inti ini
SUDAH TURUN (t_0e45367a, PR #410 MERGED): BR-TP-01/02/03/05/06/08
mengikat, BOT 3/BOT 2 TIDAK menunggu vonis baru untuk mulai
sesudah Q-TP-5 dibuka BOT 1. BOT 4 dipanggil lagi HANYA bila
implementasi menyimpang dari vonis (akun baru, jurnal di receive,
klaim kurir BR-TP-11, kapitalisasi ongkir BR-TP-14) — itu
BUTUH-VONIS baru, jangan diputus BOT 3/BOT 5.

### 10. Backlog implementasi (turunan spec ini; induk tetap F-2026-10-21-015)

1. BOT 1: putus Q-TP-5 (buka inti) + Q-TP-1/Q-TP-4 (+ merge PR
   spec ini). Tanpa Q-TP-5, berhenti di spec.
2. BOT 3 (@backend-prisma-inventory-workshop): migrasi
   receivedQty + status partially_received + riwayat kejadian
   (Q-TP-2) + penutupan tertaut (Q-TP-3), aksi terima per
   kejadian dalam klaim atomik (ganti guard idempotency hook),
   perluasan laporan in-transit §7, tes falsifikasi AC-TP-1..12.
   Effort M-L. Klaim schema.prisma di board sebelum edit.
3. BOT 2 (@frontend-ui-ux-next-js): form "Terima Barang" per
   baris di detail transfer + kolom Terkirim/Sudah/Belum +
   tombol Terima Susulan/Tutup Selisih, SESUDAH kontrak BOT 3,
   kata §6 verbatim, nol hitung sisa/status di UI (server yang
   menentukan), label peringatan tutup persis §6. UI fitur ini
   didahulukan atas polish.
4. BOT 6: AC-TP-1..12 atas head BOT 3/BOT 2, termasuk falsifikasi
   vonis BOT 4 (cabut carried cost -> MERAH).

### Yang TIDAK diusulkan run ini
- Akun in-transit / gudang virtual / klaim kurir (DILARANG /
  ditunda vonis BOT 4), terima parsial PurchaseOrder/GR (sudah
  ada receivedQty sendiri), ubah perilaku MaterialRequest selain
  membaca receivedQty yang sama (F-078), portal/pelacakan kurir
  eksternal, auto-tutup selisih berumur (Q-TP-4 dulu).

---

## VONIS BOT 4 2026-10-22 — F-2026-10-22-086-V: Q-EMP-4/5 uang kompensasi PKWT + pesangon/UPMK PHK + PPh 21-nya + jalur bayar (spec F-2026-10-22-085-S PR #535)

Pemutus: BOT 4 (accounting-finance-tax). Kartu: t_4800fa73 (buffer
kondektur sesudah t_6284b0f7 / F-084-V PR #534). Tertulis saja —
tanpa kode/schema/migrasi, tanpa merge oleh BOT 4. Menjawab
Q-EMP-4/Q-EMP-5 spec BOT 5 F-2026-10-22-085-S (PR #535 OPEN);
inti F-085-S tetap menunggu Q-EMP-1/2/3 BOT 1 + Q-EMP-6 BOT 3,
vonis ini TIDAK membuka inti.

### 0. Anti-duplikat + bukti live (2026-10-22)

- origin/main `9d5ea988`. ID -V terpakai maks 084-V (PR #534 OPEN);
  085-S = spec BOT 5 PR #535; 086-V bebas per grep backlog
  origin/main + `gh pr list` live (all-state grep "086" = 0).
- Hormati tertutup: 084-V #534, 083-V #531, 082-V #530, 081-V
  #529, 080/079/078/077/075/074/066/062-V, F-058-V #443,
  t_be0445cb duplikat-selesai (PR #521) tidak disentuh,
  REK-1..5 milik t_1f126c6e.
- Kode terverifikasi origin/main `9d5ea988`:
  - Employee (schema.prisma model Employee): `baseSalary`
    Decimal(15,2), `joinDate`, `paymentFrequency` WEEKLY/MONTHLY,
    `isActive`; employmentStatus/contractEndDate/employmentEndedAt
    = 0 hasil (spec F-085-S benar).
  - COA bawaan (base-data.ts): `600005` "Beban Bonus, Pesangon &
    Kompensasi" EXPS/6000 ADA; keluarga 2102: 210201-210206
    terpakai (210204 Hutang Gaji, 210205 Provisi Garansi — DILARANG
    reuse, 210206 Utang PPh 4(2) Sewa); 210207 sudah dipesan
    F-084-V (PR #534) untuk Utang Komisi Penjualan — DILARANG
    pakai ulang di vonis ini; 210208 bebas.
  - Setting payroll existing (schema SystemSetting:229-231):
    salaryExpenseAccountId / salariesPayableAccountId /
    payrollBankAccountId; jurnal `onPayrollPaid`
    (accounting.hook.ts): Dr salaryExpense (gross penuh) /
    Cr payrollBank (neto) / Cr salariesPayable (statutori
    BPJS+PPh21) / Cr piutang karyawan / Cr salariesPayable
    (potongan lain), idempoten referenceType "Payroll" +
    assertPeriodOpen(paymentDate). Komponen payroll F-027:
    PayrollComponent + EmployeePayrollComponent bertanggal
    efektif + baris beku PayrollComponentLine; klasifikasi T2
    (earning tidak teratur, TERGABUNG bruto masa — vonis
    F-026 §2 / F-027, PMK 168/2023 Pasal 5 ayat (3) huruf b).
  - Basis upah BPJS: F-083-V (PR #531) = baseSalary + Sigma
    tunjangan tetap — basis itu untuk BPJS, BUKAN otomatis basis
    kompensasi/pesangon (basis kompensasi diputus §1.2 di bawah
    dari PP 35/2021 langsung, bukan pinjam basis BPJS).

### 1. Uang kompensasi PKWT (Q-EMP-4a)

Dasar: PP No. 35 Tahun 2021 Pasal 15-17 (ditetapkan 2021,
diumumkan peraturan.go.id / JDIH Kemnaker
https://jdih.kemnaker.go.id/asset/data_puu/PP352021.pdf, teks
resmi peraturan.go.id/files/pp35-2021bt.pdf; diakses 2026-10-22).

1.1 Syarat hak. Karyawan PKWT dengan masa kerja >= 1 bulan terus
    menerus berhak uang kompensasi SAAT PKWT berakhir (Pasal 15
    ayat (1)-(3)). Masa kerja < 1 bulan = hak NOL (bukan
    proporsional kecil — nol). Diperpanjang: kompensasi diberikan
    saat jangka waktu SEBELUM perpanjangan selesai, lalu masa
    perpanjangan dihitung sendiri saat berakhir (Pasal 15 ayat
    (4)) — dua peristiwa bayar terpisah, jangan digabung jadi
    satu akrual akhir. TKA: PP 35/2021 Pasal 15 ayat (5) semula
    mengecualikan; Perppu 2/2022 (UU 6/2023) mengubah — TKA PKWT
    ikut berhak. ISF: status TKA belum ada di master (Q-EMP-1
    BOT 1); selama belum ada penanda TKA terverifikasi, perlakuan
    default = ikut berhak (mengikuti teks sesudah perubahan);
    membedakan TKA = BUTUH penanda master dulu, jangan tebak
    dari nama/kewarganegaraan bebas.
1.2 Rumus (Pasal 16 ayat (1)): kompensasi = (masa kerja bulan /
    12) x 1 bulan Upah, untuk semua rentang (12 bulan penuh = 1
    bulan Upah persis). Masa kerja dihitung dari tanggal mulai
    PKWT sampai tanggal berakhir PKWT (atau sampai pekerjaan
    selesai lebih cepat — Pasal 16 ayat (5): dihitung sampai saat
    selesainya pekerjaan). Pecahan bulan: PP tidak memberi rumus
    hari; vonis ini: masa kerja dalam bulan = jumlah bulan penuh
    + (sisa hari / jumlah hari bulan terakhir) dibulatkan
    safeRound 2 desimal di komponen bulan, LALU nominal
    safeRound sen. Menghitung masa kerja dari joinDate Employee
    mentah DILARANG bila karyawan pernah PKWTT/pernah putus —
    masa PKWT = rentang kontrak PKWT berjalan (field kontrak
    F-085-S), bukan umur karyawan.
1.3 Basis Upah (Pasal 16 ayat (2)-(4)): Upah pokok + tunjangan
    TETAP. Struktur ISF tidak memakai komponen upah pokok/
    tunjangan tetap terpisah -> Pasal 16 ayat (3): Upah tanpa
    tunjangan. Struktur = upah pokok + tunjangan tidak tetap ->
    ayat (4): upah pokok saja. Pemetaan ISF (mengikat): basis =
    baseSalary master + Sigma penugasan komponen earning
    recurrence=fixed yang efektif pada tanggal berakhir kontrak
    (bentuk data sama dengan basis F-083-V, SUMBER REGULASI
    BERBEDA — jangan rujuk F-083-V sebagai dasar kompensasi).
    Snapshot basis + rincian komponen dibekukan di dokumen/slip
    peristiwa berhenti; edit master sesudahnya tidak mengubah
    hak yang sudah lahir. Komponen tidak tetap (lembur, komisi,
    transport harian) DILARANG masuk basis.
1.4 Contoh mengikat. Upah basis Rp6.000.000, PKWT 7 bulan:
    kompensasi = 7/12 x 6.000.000 = Rp3.500.000. PKWT 12 bulan =
    Rp6.000.000. PKWT 26 bulan = 26/12 x 6.000.000 =
    Rp13.000.000. Masa 20 hari (< 1 bulan) = Rp0.

### 2. Pesangon + UPMK + penggantian hak PHK (Q-EMP-4b)

Dasar: PP 35/2021 Pasal 40 (sumber sama §1) + pengali per alasan
PHK Pasal 41-52 PP 35/2021.

2.1 Tabel dasar (Pasal 40 ayat (2)-(3)), basis Upah sama §1.3:
    Pesangon (bulan Upah): <1th=1; 1-<2=2; 2-<3=3; 3-<4=4; 4-<5=5;
    5-<6=6; 6-<7=7; 7-<8=8; >=8th=9.
    UPMK (bulan Upah): <3th=0; 3-<6=2; 6-<9=3; 9-<12=4; 12-<15=5;
    15-<18=6; 18-<21=7; 21-<24=8; >=24th=10.
    Penggantian hak (Pasal 40 ayat (4)): (a) cuti tahunan belum
    diambil & belum gugur — dinilai sebesar upah harian/bulanan
    menurut PK/PP/PKB perusahaan (PP tidak menetapkan nilai per
    hari cuti; nilai = aturan internal tertulis, BUKAN karangan
    sistem; tanpa aturan internal tertulis, komponen ini DITUNDA
    per kasus = BUTUH-VONIS-AKUNTAN/keputusan pemilik, jangan
    dihitung 1/30 atau 1/25 diam-diam); (b) ongkos pulang sesuai
    bukti/biaya nyata; (c) hal lain di PK/PP/PKB (termasuk
    penggantian perumahan/pengobatan bila dijanjikan — persennya
    dari PK/PP/PKB, bukan dari PP).
2.2 Pengali alasan. Nominal §2.1 adalah tabel DASAR (1x). Alasan
    PHK mengubah pengali (mis. efisiensi, perusahaan tutup,
    pailit, pekerja mangkir, kesalahan berat, pensiun, meninggal,
    pengunduran diri, berakhirnya PKWT bukan PHK) per Pasal
    41-52 PP 35/2021 (0x / 0,5x / 1x / 1,75x / 2x per komponen,
    berbeda per komponen pesangon vs UPMK). Vonis ini TIDAK
    menetapkan tabel pengali per alasan: kosakata endReason final
    = Q-EMP-1/2 BOT 1, dan pengali per alasan adalah keputusan
    hukum ketenagakerjaan per kasus dokumen. Penjaga mengikat
    untuk build: sistem DILARANG menerapkan pengali default 1x
    diam-diam; dokumen peristiwa berhenti wajib menyimpan alasan
    + pengali pesangon + pengali UPMK sebagai snapshot eksplisit
    yang diisi/disetujui manusia berwenang; tanpa snapshot
    pengali = hitung DITOLAK. Tabel pengali lengkap per Pasal
    41-52 = vonis lanjutan BOT 4 sesudah Q-EMP-2 diputus BOT 1 —
    jangan dibangun dari vonis ini.
2.3 Yang BUKAN pesangon: berakhirnya PKWT bukan PHK — haknya
    hanya uang kompensasi §1, BUKAN pesangon/UPMK. Mengundurkan
    diri: bukan pesangon Pasal 40 (uang pisah hanya bila diatur
    PK/PP/PKB — sumbernya dokumen itu, bukan PP; tandai per
    kasus). Meninggal/pensiun: ikut jalur Pasal 47/48 PP 35/2021
    lewat pengali §2.2, jangan jalur kompensasi PKWT.

### 3. PPh 21 atas kompensasi & pesangon (Q-EMP-4c)

3.1 Uang kompensasi PKWT = objek PPh 21 penghasilan pegawai
    (PMK 168/2023 Pasal 5 ayat (1) huruf a: penghasilan Pegawai
    Tetap teratur maupun tidak teratur; PKWT yang masih dalam
    hubungan kerja saat dibayar = tidak teratur, DIGABUNG bruto
    masa bayar lalu TER masa itu — pola T2 F-026/F-027, TANPA
    tarif final tersendiri). Ia BUKAN "uang pesangon" PMK
    16/PMK.03/2010 karena hubungan kerja tidak berakhir karena
    PHK — kontrak berakhir demi hukum dan kompensasi adalah hak
    kontraktual akhir masa PKWT; memaksakan tarif final pesangon
    ke kompensasi PKWT = BUTUH-VONIS-AKUNTAN per kasus bila ada
    yang mengusulkan, jangan diputus diam-diam di kode. Bila
    orang yang sama langsung menandatangani PKWT baru/
    diangkat PKWTT tanpa putus hubungan kerja nyata, kompensasi
    tetap dibayar & dipotong sebagai tidak teratur pada masa
    bayar itu (PP 35/2021 Pasal 15 ayat (4) untuk perpanjangan).
3.2 Pesangon/UPMK/penggantian hak yang MEMENUHI definisi uang
    pesangon (PMK No. 16/PMK.03/2010 Pasal 1 angka 4: dibayar
    sehubungan berakhirnya masa kerja/PHK, termasuk UPMK dan
    penggantian hak) dan dibayarkan SEKALIGUS (sebagian/seluruh
    pembayaran dalam <= 2 tahun kalender, Pasal 2 ayat (2)):
    PPh 21 FINAL Pasal 3 PMK 16/2010 (dasar PP 68/2009):
    0% atas bruto s.d. Rp50.000.000; 5% atas >50jt-100jt; 15%
    atas >100jt-500jt; 25% atas >500jt — diterapkan atas jumlah
    KUMULATIF dalam jendela 2 tahun kalender. Terutang saat
    dibayar (Pasal 2 ayat (4)). Bagian yang dibayar tahun ke-3+
    keluar dari rezim final: tarif Pasal 17 atas bruto tahun itu,
    tidak final, bisa kredit (Pasal 5 PMK 16/2010). Bukti potong
    wajib walau tarif 0% (Pasal 9 ayat (6)).
    Contoh mengikat: pesangon+UPMK bruto Rp48.000.000 dibayar
    sekaligus -> PPh final Rp0, neto Rp48.000.000. Bruto
    Rp120.000.000 -> 0 + 5% x 50jt + 15% x 20jt = Rp5.500.000,
    neto Rp114.500.000.
3.3 Batas definisi (fail-closed): pembayaran bernama "pesangon"
    yang tidak memenuhi definisi §3.2 (mis. bonus akhir tahun ke
    mantan pegawai, jasa produksi/tantiem mantan pegawai) BUKAN
    tarif final — ikut PPh 21 mantan pegawai PMK 168/2023 Pasal 5
    ayat (1) huruf h (tarif Pasal 17 x bruto se-masa). Sistem
    wajib menyimpan snapshot klasifikasi (kompensasi-PKWT /
    pesangon-final / imbalan-mantan-pegawai) per dokumen bayar;
    klasifikasi tidak diturunkan dari nama komponen bebas.
    Kode objek pajak & KJS setor final (keluarga 21-401/401 dsb.)
    = dari katalog Coretax/DJP berjalan saat build, dikonfirmasi
    BOT 3/BOT 4 saat wiring — vonis ini tidak mengunci nomor kode
    objek karena katalog kode DJP berubah lewat PER/Pengumuman
    DJP; hardcode kode objek di service DILARANG (pola tax rules
    register: kode hidup di master bertanggal efektif).
3.4 BPJS: kompensasi PKWT & pesangon/UPMK/penggantian hak BUKAN
    upah rutin basis BPJS (di luar basis F-083-V: bukan baseSalary
    dan bukan tunjangan tetap berjalan) — tidak ada iuran BPJS
    atas komponen ini dan tidak masuk agregator se-masa F-081-V.
    Memasukkan ke basis BPJS = penyimpangan, eskalasi BOT 4.

### 4. Akun, jurnal, titik akui (Q-EMP-4d + Q-EMP-5 separuh)

4.1 Akun beban: 600005 "Beban Bonus, Pesangon & Kompensasi"
    (existing, EXPS) untuk SEMUA komponen §1-§2. Dilarang akun
    beban baru dan dilarang memakai 600004 Beban Gaji (mencampur
    beban akhir hubungan kerja ke beban gaji rutin mengotori
    rekonsiliasi payroll). Pemisahan kompensasi vs pesangon =
    lewat komponen/dimensi dokumen, bukan akun GL kedua, selama
    belum ada kebutuhan laporan terpisah yang diputus Lead.
4.2 Akun kewajiban: akun BARU 210208 "Utang Kompensasi &
    Pesangon" (anak 2102 OCLY) — BUKAN 210204 Hutang Gaji
    (salariesPayable setting existing): kewajiban berhenti
    dibayar tidak selalu lewat siklus gaji berjalan dan bisa
    lintas periode; mencampur ke Hutang Gaji = rekonsiliasi
    payroll tercemar (pola sama larangan F-084-V §2.3 untuk
    komisi). 210207 sudah dipesan komisi (F-084-V) — dilarang
    tabrakan. Mapping SystemSetting baru nullable (pola F-021/
    F-084-V): terminationPayableAccountId; expense tetap dibaca
    dari salaryExpense mapping? TIDAK — beban §4.1 bukan beban
    gaji: mapping kedua terminationExpenseAccountId nullable,
    seed menunjuk 600005/210208, instalasi berjalan tanpa seed =
    diisi admin, kosong = posting DITOLAK berisik fail-closed.
    Dilarang fallback ke akun lain.
4.3 Titik akui & jurnal. Hak lahir saat hubungan kerja berakhir
    (tanggal employmentEndedAt F-085-S / tanggal selesai kontrak),
    BUKAN saat dibayar dan bukan saat slip final digenerate:
    (a) Akrual pada tanggal berakhir (periode terbuka,
        assertPeriodOpen dalam tx yang menetapkan status
        berhenti): Dr 600005 / Cr 210208 sebesar hak bruto penuh
        (snapshot §1.3/§2). Periode terkunci = penetapan status
        berhenti untuk tujuan akrual DITOLAK, tanggal tidak
        digeser diam-diam.
    (b) Bayar: Dr 210208 / Cr payrollBank (neto) / Cr Utang PPh 21
        (akun liabilitas PPh 21 payroll existing yang dipakai
        jalur setor payroll — BUKAN 210206 PPh 4(2) sewa, BUKAN
        akun pajak baru) sebesar PPh terpotong. PPh TIDAK dipotong
        saat akrual (akrual bruto penuh; pola F-084-V §5.4).
    (c) Idempotensi: satu jurnal akrual per (karyawan, peristiwa
        berhenti) — referenceType bernama per dokumen peristiwa
        (BOT 3 tetapkan nama persis, unik referenceType/
        referenceId pola jurnal repo); retry tidak dobel.
        Perpanjangan PKWT = peristiwa berhenti kontraktual
        terpisah per Pasal 15 ayat (4) -> akrual sendiri per
        segmen kontrak.
    (d) Koreksi: hak yang ternyata keliru sesudah akrual =
        jurnal lawan/koreksi di periode terbuka; jurnal akrual
        asal tidak diubah/dihapus. Hak batal (orang dipekerjakan
        kembali sebelum bayar dengan kesepakatan tertulis hak
        gugur) = reversal penuh Dr 210208 / Cr 600005 masa
        kesepakatan, wajib dokumen pendukung — tanpa dokumen,
        reversal DILARANG.
4.4 Deductibility fiskal: beban kompensasi/pesangon = biaya
    sehubungan pekerjaan (uji 3M Pasal 6 UU PPh) pada tahun
    terutang menurut akuntansi ini; vonis ini tidak mengklaim
    posisi SPT final per kasus sengketa (mis. pesangon tanpa
    dokumen PHK sah) — kasus sengketa = BUTUH-VONIS-AKUNTAN.
    Provisi estimasi massal sebelum peristiwa berhenti (akrual
    statistik per portofolio karyawan) TIDAK diputus vonis ini
    dan DILARANG dibangun dari vonis ini (pola provisi = vonis
    terpisah seperti F-021).

### 5. Jalur bayar (Q-EMP-5)

5.1 Kompensasi PKWT saat berakhir TANPA putus hubungan kerja
    nyata berikutnya (perpanjangan / lanjut PKWTT orang sama):
    bayar sebagai komponen earning tidak teratur (T2) pada slip
    payroll masa bayar orang itu — komponen PayrollComponent
    existing (F-027), snapshot klasifikasi §3.3 = kompensasi-PKWT;
    PPh ikut TER gabungan slip itu. Jurnal mengikuti onPayrollPaid
    existing TETAPI kaki beban komponen ini wajib ke 600005
    (mapping §4.2), bukan salaryExpense generik — BOT 3: jangan
    paksa lewat onPayrollPaid apa adanya bila ia mendebit semua
    gross ke satu akun beban; perluas pemetaan akun per komponen
    atau jurnal peristiwa terpisah §5.2. Memutuskan perluasan itu
    = fisik BOT 3 dalam batas vonis ini.
5.2 Pesangon/UPMK/penggantian hak PHK dan kompensasi PKWT saat
    hubungan kerja BENAR-BENAR berakhir: dokumen bayar peristiwa
    berhenti TERPISAH dari slip gaji reguler (bukan baris slip
    biasa), karena (a) PPh-nya rezim final §3.2 berbeda dari TER
    slip, (b) penerima sudah bukan populasi run reguler (BR-EMP-06
    spec), (c) masa pajak terakhir PPh 21 orang itu (hitung ulang
    F-026) harus ditutup oleh slip final gaji, bukan dicampur
    dokumen pesangon. Dokumen terpisah tetap memakai akun §4 +
    bupot sendiri; pembayaran lewat payrollBank existing.
    Dilarang jalur kas terpisah tanpa dokumen (tunai langsung
    tanpa slip/dokumen = memutus rantai bupot & jurnal).
5.3 Urutan masa terakhir: slip final gaji (masa terakhir, hitung
    ulang PPh 21 tahunan F-026) diselesaikan/dibayar terpisah
    dari dokumen §5.2; keduanya boleh masa sama, tidak boleh
    digabung satu slip, dan bupot pesangon final tidak masuk
    hitung ulang masa terakhir (final = di luar TER/Pasal 17
    masa itu, kecuali porsi tahun ke-3+ per §3.2 yang justru
    tidak final dan masuk kredit — porsi itu diperlakukan
    sebagai penghasilan tahun bayarnya, tangani per kasus,
    jangan otomatis).

### 6. Larangan

L1. Hitung kompensasi/pesangon dari joinDate mentah / dari
    isActive / dari flag FormData client. Sumber = rentang
    kontrak + tanggal berhenti terstruktur (F-085-S) + snapshot
    basis §1.3. Tanpa field itu live: hitung DITOLAK.
L2. Pengali alasan PHK default 1x diam-diam; nilai cuti per hari
    karangan (1/25, 1/30) tanpa aturan internal tertulis.
L3. Tarif final pesangon untuk kompensasi PKWT, atau TER untuk
    pesangon-final yang memenuhi §3.2 (klasifikasi snapshot §3.3
    menentukan; tertukar = temuan).
L4. Jurnal akrual massal/provisi statistik dari vonis ini;
    backfill hak untuk berhenti historis sebelum field kontrak
    live (hak historis = penilaian manual per dokumen, bukan
    generate massal).
L5. Akun fallback: 210204/210207/210205 untuk kewajiban ini;
    600004 untuk bebannya; akun pajak baru untuk PPh-nya.
L6. BPJS atas komponen §1-§2 (§3.4).

### 7. Syarat buka inti pembayaran (gerbang, sebelum BOT 3 bangun jalur bayar)

G1. Q-EMP-1/2/3 diputus BOT 1 + field kontrak/berhenti F-085-S
    live (BOT 3, Q-EMP-6) — tanpa tanggal terstruktur tidak ada
    peristiwa akrual.
G2. Tabel pengali alasan Pasal 41-52 = vonis lanjutan BOT 4
    (sesudah Q-EMP-2) terbit; sebelum itu build hanya boleh
    kompensasi PKWT §1 (tanpa pengali) + pencatatan snapshot.
G3. Akun 210208 + dua mapping §4.2 ter-seed/terkonfigurasi;
    kosong = fail-closed.
G4. Klasifikasi pajak snapshot §3.3 + katalog kode objek dari
    master pajak bertanggal efektif (bukan hardcode).
G5. Tes falsifikasi §8 hijau di head inti persis; BOT 6 audit
    sebelum Lead merge.

### 8. Draf acceptance BOT 6 (falsifikasi; cabut penjaga -> MERAH)

E45-1. PKWT 7 bulan basis 6.000.000 -> kompensasi 3.500.000
  persis sen; 20 hari -> 0 dan nol jurnal; cabut syarat >=1 bulan
  -> MERAH.
E45-2. Edit baseSalary/komponen fixed sesudah snapshot berhenti
  -> hak tidak berubah; hitung dari joinDate karyawan yang pernah
  putus -> ditolak/MERAH.
E45-3. Perpanjangan: segmen-1 diakru saat segmen-1 selesai walau
  orang lanjut bekerja; digabung ke akhir segmen-2 -> MERAH.
E45-4. Pesangon bruto 120.000.000 sekaligus -> PPh final
  5.500.000, neto 114.500.000, bupot terbit walau lapis 0%
  (kasus 48.000.000 -> PPh 0 tetap bupot); terapkan TER ke
  dokumen final -> MERAH; terapkan final ke kompensasi PKWT ->
  MERAH.
E45-5. Mapping termination* kosong + ada hak -> akrual ditolak,
  nol jurnal parsial; ganti fallback ke 210204 -> MERAH.
E45-6. Retry penetapan berhenti -> satu akrual; jurnal akrual
  asal diedit/dihapus -> ditolak (hanya reversal periode terbuka).
E45-7. Komponen §1-§2 masuk basis/agregator BPJS -> MERAH (§3.4);
  komponen kompensasi lanjut-kerja terpotong TER gabungan slip
  masa bayar, bukan tarif sendiri (E45-4 pasangan).
E45-8. Pengali alasan kosong pada dokumen PHK -> hitung ditolak;
  isi default 1x diam-diam -> MERAH (L2).

### 9. Klaim kepatuhan

REGULASI (bukan fitur software): PP 35/2021 Pasal 15-17 & 40
(JDIH Kemnaker https://jdih.kemnaker.go.id/asset/data_puu/
PP352021.pdf; peraturan.go.id/files/pp35-2021bt.pdf; diakses
2026-10-22) untuk hak/rumus/basis; PMK 168/2023 Pasal 5 ayat
(1) huruf a/h (PDF resmi DJP pajak.go.id, diakses 2026-10-22)
untuk objek TER-gabungan & mantan pegawai; PMK No.
16/PMK.03/2010 Pasal 1-3,5,9 (pajak.go.id/id/peraturan/
tata-cara-pemotongan-pajak-penghasilan-pasal-21-atas-penghasilan-
berupa-uang-pesangon, diakses 2026-10-22; dasar PP 68/2009)
untuk final pesangon sekaligus <= 2 tahun kalender. Cakupan:
kompensasi PKWT, pesangon/UPMK/penggantian hak dasar, PPh-nya,
akun/jalur bayar ISF. Di luar cakupan: tabel pengali per alasan
Pasal 41-52 (vonis lanjutan sesudah Q-EMP-2), nilai hari cuti
tanpa aturan internal, kasus sengketa/deductibility per kasus,
TKA tanpa penanda master — semua BUTUH-VONIS lanjutan/AKUNTAN,
jangan diputus diam-diam (pola BUTUH-VONIS-AKUNTAN backlog).

ID vonis ini **F-2026-10-22-086-V** (086 bebas: 085-S spec BOT 5
PR #535, 084-V PR #534, 084-S PR #532). Pemilik berikutnya: BOT 1
(merge PR vonis + PR #535; putus Q-EMP-1/2/3) -> BOT 4 (vonis
lanjutan tabel pengali sesudah Q-EMP-2) -> BOT 3 (inti F-085-S +
jalur bayar §5/G1-G4) -> BOT 2 -> BOT 6 E45-1..8.

---
