# PETA FALSIFIKASI TAHAP B — F-055/F-056/F-057/F-059 (tanpa schema)

Pemilik: BOT 3 (backend-prisma-inventory-workshop), kartu `t_2751bae4`.
Dokumen usulan saja — nol kode produksi, nol `prisma/schema.prisma`,
nol migrasi, nol perubahan perilaku hitung uang/pajak.

## 0. Sumber mengikat (semua terverifikasi live 2026-10-22)

| Sumber | Isi | Status live |
|---|---|---|
| PR #447 head `4fb4b956` | F-055-V Tahap A: katalog PPh 4(2) sewa satu sumber + snapshot `objectName` bupot + bukti terstruktur | OPEN, gate 5/5 hijau head persis; verdict BOT 6 terikat head = kartu `t_7c576101` (antre) |
| PR #449 head `89309404` | Usulan bentuk fisik F-057-V (`docs/f056-bentuk-fisik-usulan.md`): `PartyWithholderStatus` polimorfik + `TaxPaymentAllocation` FK `SalesInvoice` + katalog satu baris; falsifikasi F56-1..9 | OPEN; putusan BOT 1 DISETUJUI + verdict BOT 6 LOLOS (dokumen), head persis |
| PR #454 head `9c996a43` | Vonis BOT 4 F-2026-10-22-059-V: DPP Kasus C = `subtotal - discount`; menggugurkan §2.5 usulan #449 (DPP input operator / `grandTotal`); falsifikasi F59-1..7 | OPEN tanpa merge |
| PR #439 | Vonis BOT 4 F-2026-10-22-057-V bentuk data F-055 lanjutan | MERGED |

Urutan inti tetap terkunci (putusan BOT 1 S-A): inti hanya sesudah
#439 + #447 merged. #439 merged; #447 belum. Dokumen ini TIDAK membuka
klaim schema — ia menyiapkan peta tes supaya inti bisa langsung
dieksekusi + difalsifikasi begitu gerbang terbuka.

## 1. Yang GUGUR (jangan dibangun, jangan dites sebagai perilaku sah)

Dari vonis F-059-V (PR #454 §1-§4, L1-L3) terhadap usulan #449 §2.5:

- G-1 DPP Kasus C = `grandTotal` / `totalAmount` invoice. Alasan:
  memuat PPN 11% → setor 10% × 111%. Tes yang mengharapkan ini = salah.
- G-2 DPP dinyatakan operator per alokasi (input bebas). Ditolak:
  DPP turunan mesin saja (`subtotal - discount`).
- G-3 Prorata/tebakan DPP untuk invoice campuran tanpa penanda baris
  sewa. Ditolak fail-closed; penanda baris = kartu/skema terpisah.
- G-4 FK kedua `VendorBill` di `TaxPaymentAllocation`. Ditolak:
  Kasus C = ISF menyewakan; ISF sebagai penyewa = pemotong wajib
  (PP 34/2017 Pasal 3), tidak ada setor-sendiri dari `VendorBill`.
- G-5 Default non-pemotong bila status tidak diketahui. Ditolak sejak
  F-057-V §1: nol baris efektif = `WITHHOLDER_STATUS_UNKNOWN`, tolak.

## 2. Peta tes Tahap B (gabungan F56-1..9 + F59-1..7, deduplikasi)

Kolom "Penjaga" = titik cabut falsifikasi: cabut baris penjaga itu,
tes wajib MERAH; pulihkan, wajib HIJAU. Kolom "Rumah tes" = lokasi
usulan mengikuti pola repo (builder murni `src/lib/tax/*` +
`src/lib/tax/__tests__/*`; service `src/lib/services/*` +
`src/lib/services/__tests__/*`). Nama error final ditetapkan inti
secara eksplisit (temuan low BOT 6 #3 di #449: `RENT_TAX_TYPE_INACTIVE`
belum ada di kode; resolver kini melempar pesan Bahasa Indonesia via
`resolvePph42RentRate` di `src/lib/tax/withholding-certificate.ts:112`).

### 2.1 Status pemotong bertanggal (`PartyWithholderStatus`)

| ID | Skenario | Harapan | Penjaga dicabut → MERAH |
|---|---|---|---|
| TB-1 (=F56-1) | Dua baris masa beda untuk pihak sama; baca pada tanggal lampau | Baris memuat tanggal itu yang dipakai, bukan baris terbaru | Filter masa di resolver diganti "baris terbaru" |
| TB-2 (=F56-2) | Nol baris memuat `withholdingDate` | Terbit bupot/setor ditolak `WITHHOLDER_STATUS_UNKNOWN` | Cabut cek nol-baris (default lolos) |
| TB-3 (=F56-3a) | Status `pemotong` tanpa `basisNumber` atau `basisDate` | Ditolak | Cabut validasi basis wajib |
| TB-4 (=F56-3b) | Status `non_pemotong` tanpa `basisNote` | Ditolak | Cabut validasi `basisNote` |
| TB-5 (=F56-3c) | Buat/tutup baris lolos | `ActivityLog` tertulis dalam tx sama (`modelType="PartyWithholderStatus"`) | Cabut tulis log tx |
| TB-6 (=F56-4) | Masa baru tumpang tindih baris pihak sama (inklusif per hari; bersebelahan `to = from-1` sah) | Ditolak; bersebelahan lulus | Cabut query masa bersinggungan |
| TB-7 (=F56-9/S-C) | Baris masa memuat `withholdingDate` bupot `issued` (pihak diturunkan via `vendorBill`/`salesPayment`) diedit in-place / ditutup memotong rujukan | Ditolak; koreksi hanya tutup+baru | Cabut penjaga anti-edit baris terpakai |
| TB-8 | Mutasi status tanpa izin `manage_withholding_tax` (izin existing `withholding-tax.actions.ts:48,82`) | Ditolak izin | Ganti izin ke izin setor |

### 2.2 Alokasi setor-sendiri Kasus C (`TaxPaymentAllocation`)

DPP sumber per invoice (F-059-V §1): `subtotal - discount` dari
`SalesInvoice` (`prisma/schema.prisma:1404-1405` di `origin/main`).
Terutang sumber = tarif katalog efektif pada `SalesInvoice.date` × DPP,
`safeRound` sen sekali di hasil kali (`src/lib/utils/math.ts:35`).
Tarif TIDAK hardcode 10% di service (F-059-V §5).

| ID | Skenario | Harapan | Penjaga dicabut → MERAH |
|---|---|---|---|
| TB-9 (=F59-1) | Invoice sewa subtotal 100.000.000, discount 0, PPN 11% (`grandTotal` 111.000.000) | Terutang = 10.000.000,00 | DPP diganti `grandTotal` → 11.100.000 |
| TB-10 (=F59-2) | Subtotal 100.000.000, discount 5.000.000 | Terutang = 9.500.000,00 | Discount diabaikan |
| TB-11 (=F56-5) | `SUM(alokasi.amount)` ≠ `TaxPayment.amount` selisih 0,01 | Posted ditolak | Cabut banding sen eksak |
| TB-12 (=F56-6+F59-3) | Kumulatif posted ke satu invoice = terutang + 0,01; lalu = terutang persis | Pertama ditolak, kedua lulus | Cabut cap kumulatif |
| TB-13 (=F59-4/S1) | Penyewa status efektif pada `SalesInvoice.date` = `pemotong`, atau nol baris status | Alokasi Kasus C ditolak | Cabut cek status S1 |
| TB-14 (=F59-5/S2) | Invoice campuran tanpa penanda baris sewa dialokasi | Ditolak fail-closed berisik | Jalur prorata/input operator dibuka |
| TB-15 (=F59-6/S4) | Tarif katalog berubah sesudah setor posted | Terutang setor berikutnya dibaca per `SalesInvoice.date`; snapshot setor lama tidak berubah | Tarif dibaca per tanggal setor |
| TB-16 (=F59-7) | Alokasi menunjuk `VendorBill` | Tidak ada jalur simpan (FK tunggal `SalesInvoice`, `Restrict`; `@@unique([taxPaymentId, salesInvoiceId])`) | FK kedua nullable ditambah |
| TB-17 | Posted tanpa baris alokasi; `amount` alokasi ≤ 0; sumber dobel satu setoran | Semua ditolak (`TaxPayment.status` default `posted`, pola `VendorPaymentAllocation` `schema.prisma:1986`) | Cabut masing-masing penjaga |
| TB-18 | Alokasi tersimpan | Nol jurnal baru dari alokasi (tautan rekonsiliasi saja; jurnal setor tetap jalur `TaxPayment` existing, `checkIdempotency` `tax-payment.actions.ts:83` tetap) | Alokasi menulis jurnal |

### 2.3 Katalog satu baris (`WithholdingTaxType`)

| ID | Skenario | Harapan | Penjaga dicabut → MERAH |
|---|---|---|---|
| TB-19 (=F56-7) | Baris kode sewa `objectName` kosong/null | Tidak tampil di pemilih + resolver tolak fail-closed | Cabut cek nama kosong |
| TB-20 (=F56-8) | Dua masa tarif/nama beda untuk kode sama | Kode+nama+tarif dari SATU baris efektif pada `withholdingDate` | Nama/tarif dibaca dari baris berbeda |
| TB-21 (=F56-9 katalog) | Edit nama/tarif baris sudah membeku di bupot `issued` | Snapshot bupot (`objectCode`+`objectName`+`tariff`, Tahap A #447) tidak berubah; baris terpakai tidak edit in-place | Edit in-place dibuka |
| TB-22 | `effectiveFrom` null sesudah gerbang katalog efektif menyala; nol baris efektif pada tanggal | Baris tidak efektif; resolver tolak bernama, nol fallback tarif hardcode | Null dianggap efektif / fallback 10% |

## 3. Catatan jujur (batas dokumen ini)

- TB-1..TB-22 = peta, bukan tes berjalan. Belum ada model
  `PartyWithholderStatus`/`TaxPaymentAllocation` dan belum ada kolom
  `objectName`/`effectiveFrom`/`effectiveTo` di `WithholdingTaxType`
  pada `origin/main` — semua menunggu inti sesudah #447 merged +
  klaim schema dibuka BOT 1. Mengklaim tes ini bisa jalan hari ini =
  salah.
- Angka contoh TB-9/TB-10 memakai tarif 10% dari vonis F-059-V §1
  sebagai nilai katalog contoh, bukan konstanta service.
- Komponen pendamping (service charge dll.) mengikuti gerbang F-039
  putusan 1 per F-059-V §1; invoice tercampur tanpa rincian yang dapat
  dibuktikan = seluruh `subtotal - discount` jadi DPP (fail-closed).
  Tes rincian komponen ditunda sampai ada penanda baris (G-3).
- Temuan low BOT 6 di #449 yang menyentuh inti: rujuk head #439 basi
  (`915ae30f` → kini merged), frasa "penjaga §3" ambigu, dan CHECK SQL
  hanya menegakkan `effective_from <= effective_to` + `status IN (...)`
  — anti-tumpang-tindih tetap penjaga service dalam tx (S-B).

## 4. Urutan eksekusi inti (mengikat, tidak berubah dari #449 §5)

1. #447 merged (sesudah verdict BOT 6 `t_7c576101` head persis).
2. Dokumen #449 + vonis #454 merged oleh BOT 1 (siklus Lead).
3. BOT 3 inti: schema + migrasi aditif (CHECK S-B) + service penjaga
   + action + seed nama/masa dua kode `PPH42-SEWA*` + tes TB-1..22
   dengan falsifikasi cabut-penjaga per baris tabel §2.
4. BOT 2 tampil status/DPP/terutang/kumulatif apa adanya (tanpa hitung
   DPP/tarif di UI, tanpa input DPP manual — F-059-V §5).
5. BOT 6 audit inti terhadap peta ini + F56-1..9 + F59-1..7.
