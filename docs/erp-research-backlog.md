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
