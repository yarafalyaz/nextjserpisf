# Round 8 — Pajak (temuan agen audit, read-only)

Hasil audit agen pajak sesi 4 (2026-10-31). Status CONFIRMED/PLAUSIBLE
seperti dilaporkan agen; triase main session dari kode nyata menentukan
vonis akhir sebelum fix. Format: `R8-PAJAK-NN` — file:line, skenario.

## Temuan

### R8-PAJAK-01 — HIGH, CONFIRMED — Faktur pengganti mustahil terbit
**Status: SELESAI 2026-10-31.** Akar lebih dalam dari laporan awal:
unique DB adalah plain `@@unique([direction, taxInvoiceNumber])`
semua baris, jadi menandai asal `replaced` lebih dulu tetap P2002 —
nomor seri pengganti memang sama dengan faktur diganti (vonis
backlog F-001/F-002: "nomor seri sama dengan digit status pengganti
sesuai Coretax"; form meminta "Nomor Faktur Pengganti" dan service
menegakkannya). Fix: kolom GENERATED `active_number_key`
(`${direction}#${taxInvoiceNumber}`, NULL saat `replaced`) + unique
`tax_invoices_active_number_unique`, unique plain dibuang — pola yang
sama dengan `Journal.activeReferenceKey`; urutan tulis di
`replaceTaxInvoice` juga dibalik (asal `replaced` sebelum create)
supaya kunci aktif benar-benar bebas saat create. Migrasi
`20261031100000_taxinvoice_active_number_unique` lolos
`db:check-migrations` (drift 0); perilaku kunci diverifikasi di
MySQL 8.0 scratch (replaced→NULL, draft memegang nomor, aktif kedua
1062, precheck berhenti tanpa ubah data). Regression:
`tax-invoice-active-number.integration.test.ts` (opt-in
`RUN_DB_INTEGRATION`) + test urutan tulis mock.
`src/lib/services/tax-invoice.service.ts:484-511` membuat baris baru
dengan nomor seri SAMA sebelum faktur asal ditandai `replaced` →
bentrok `@@unique([direction, taxInvoiceNumber])`
(`prisma/schema.prisma:1387`) → P2002 selalu, rollback. Test mock
Prisma tidak menangkap constraint DB nyata.

### R8-PAJAK-02 — HIGH, CONFIRMED — Race slug/nomor di settle bupot
`settleWithholdingTax`: `generateDocumentNumber("PAJAK")` +
`nextSlugGlobal` di LUAR tx (`withholding-certificate.service.ts:390-393,434-453`)
→ race slug/nomor konkuren → P2002 ditelan menjadi `ambiguous`.

### R8-PAJAK-03 — HIGH, CONFIRMED — Tarif fasilitas tidak menurunkan potongan
Bupot fasilitas SKB/PP23/DTP: `facility` hanya snapshot
(`withholding-certificate.service.ts:195,203-225`);
`withheldAmount = DPP × tarif penuh`. Vendor SKB tarif efektif 0%
tetap dipotong (cth DPP Rp100jt PPh23 2% → dipotong Rp2jt, salah).

### R8-PAJAK-04 — HIGH, CONFIRMED — Penggantian faktur masukan credited
**Status: SELESAI 2026-10-31.** Guard di `replaceTaxInvoice`: faktur
masukan `creditStatus === "credited"` ditolak definitif ("batalkan
kreditnya dulu lewat masa yang sama") sebelum nomor dibandingkan /
baris pengganti dibuat. Regression: test "R8-PAJAK-04" (create tidak
terpanggil).
`replaceTaxInvoice` boleh mengganti faktur masukan yang sudah
`credited` (`tax-invoice.service.ts:433-525` tanpa guard
`old.creditStatus`); asal tetap `credited` terhitung SPT, pengganti
`uncredited` → PPN Masukan overstate/dobel (`spt-read-model.ts:86-103`
tidak menyaring `djpStatus=replaced`).

### R8-PAJAK-05 — HIGH, CONFIRMED — Kredit faktur replaced/draft/rejected
**Status: SELESAI 2026-10-31.** `creditInputInvoice` menolak
`djpStatus` replaced ("kreditkan faktur penggantinya"), rejected, dan
draft selain `cancelled` yang sudah ada. Fixture lama yang memakai
`draft` untuk jalur expired/duplikat disesuaikan ke `approved`
(gerbang tidak dilonggarkan). Regression: test parameter tiga status.
`creditInputInvoice` hanya memblokir `cancelled` + sudah credited
(`tax-invoice.service.ts:642-644`) → faktur `replaced`/`draft`/
`rejected` bisa dikreditkan → kredit dobel atas satu nomor seri.

### R8-PAJAK-06 — MEDIUM, CONFIRMED — Sisi baca SPT (pasangan 04)
**Status: SELESAI 2026-10-31.** `buildInputSptRows` kini skip
`replaced` bersama cancelled/rejected. Regression: test
"R8-PAJAK-06: replaced+credited warisan tidak bocor ke SPT masukan".
`spt-read-model.ts:89` hanya skip cancelled|rejected; data warisan
`replaced`+`credited` tetap bocor walau service diperbaiki.

### R8-PAJAK-07 — MEDIUM, CONFIRMED — Bupot dari bill dibatalkan ikut laporan
Laporan Bukti Potong (`withholding-certificates-data.ts:33-95`): baris
bupot dari vendor bill yang dibatalkan/di-void tetap dihitung;
`voidVendorBill` (`purchase.actions.ts:3871-3920`) tanpa guard bupot
aktif (bandingkan `reverseSalesPayment` sales yang menolak).

### R8-PAJAK-08 — MEDIUM, CONFIRMED — Terbit bupot untuk jenis PPh nonaktif
`issueWithholdingCertificate`: jenis PPh nonaktif/terhapus tetap bisa
diterbit (`findUniqueOrThrow` tanpa `isActive/deletedAt`,
`withholding-certificate.service.ts:161`; juga revoke `:279`,
settle `:402`, `createTaxPayment` `tax-payment.actions.ts:64,67`).

### R8-PAJAK-09 — MEDIUM, CONFIRMED — Race slug pra-tx pembayaran pajak
`createTaxPayment`: slug global pra-tx race
(`tax-payment.actions.ts:70-72,90,111`); nomor urut atomik sehingga
dampak lebih rendah dari R8-PAJAK-02.

### R8-PAJAK-10 — MEDIUM, CONFIRMED — Sisa sengketa menghitung putusan ditolak
Register sengketa: `remainingDisputed` menghitung `decidedAmount`
SEMUA putusan termasuk DITOLAK (`tax-dispute-register-queue.ts:216-220`)
vs service yang benar hanya `DIKABULKAN*`
(`tax-dispute.actions.ts:243-256`) → sisa sengketa hilang dari
antrean; register vs status bertentangan.

### R8-PAJAK-11 — LOW, CONFIRMED — Batal ketetapan tanpa tx/kunci baris
`cancelTaxAssessment` tanpa tx/kunci baris
(`tax-dispute.actions.ts:282-298`) race lawan
`recordTaxDisputeDecision` yang memakai FOR UPDATE.

### R8-PAJAK-12 — LOW, PLAUSIBLE — Daftar faktur pelanggan tampilkan replaced
Halaman pelanggan menampilkan faktur `replaced` sebagai berjalan
(`master/pelanggan/[slug]/page.tsx:75` filter hanya
`djpStatus != cancelled`) → nomor sama tampil dobel di daftar.

## Bersih (jangan audit ulang)
Matematika DPP/PPN `computeVatFromSellingPrice` (`tax/tax-invoice.ts:126-143`),
FP UM snapshot + settlement anti-dobel, Coretax ekspor selain R6IE-07,
SPT keluaran rantai approved, window kredit 3 masa, bupot revoke
idempoten, setor pajak billing/NTPN, sengketa selain R8-PAJAK-10/11.
Non-temuan sengaja: `loadVatInvoices` membaca dokumen live (berlabel
dokumen berjalan; SPT resmi terpisah).
