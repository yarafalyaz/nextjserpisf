# USULAN BENTUK FISIK BOT 3 — F-2026-10-22-057-V (status pemotong bertanggal, alokasi setor-sendiri, katalog satu baris)

Pemilik usulan: BOT 3 (backend-prisma-inventory-workshop), kartu
`t_8bf887d0`. Sumber vonis: BOT 4 F-2026-10-22-055-V (PR #436 MERGED
`bf493950`) + F-2026-10-22-057-V (PR #439 head `915ae30f`, BOT 6 LOLOS,
CONFLICTING docs-only — rebasa milik BOT 4, merge milik Lead).
Dokumen ini = langkah 1 kartu: bentuk fisik diajukan ke board/BOT 1
SEBELUM migrasi apa pun. Nol schema/migrasi berubah di PR ini.

Kondisi kode diverifikasi `origin/main` `a180756c` (2026-10-22):

- `WithholdingTaxType`: `code` unik, `name` per jenis, `rate`
  Decimal(5,2), `article`, `objectCode` nullable TUNGGAL, `isActive`
  boolean tanpa masa, `deletedAt`. Seed sewa: `PPH42-SEWA`
  (28-403-02, aktif) + `PPH42-SEWA-PP` (28-403-04, nonaktif) di
  `src/lib/setup/base-data.ts:923-928`.
- `WithholdingCertificate`: snapshot `objectCode`/`tariff`/`dpp`
  beku; kolom `objectName`+`rentObjectEvidence` BARU di PR #447
  (OPEN, head `4fb4b956`) — usulan ini mengasumsikan #447 merged
  lebih dulu (dependensi urutan, lihat §5).
- `TaxPayment`: `taxKind`/`taxTypeId`/`period`/`billingCode`/`ntpn`/
  `amount` Decimal(15,2)/`status` default `posted` — kolom setor
  lengkap; model alokasi BELUM ada. Pola acu `VendorPaymentAllocation`
  (`vendorPaymentId`+`vendorBillId`+`amount` Decimal(15,2), Cascade).
- `Customer`/`Vendor`: `taxId`/`npwp` identitas saja; status pemotong
  bertanggal BELUM ada. `ActivityLog` punya `oldValues`/`newValues`
  Json + indeks `(modelType, modelId)` — siap jejak pendamping.
- Izin existing persis: `manage_withholding_tax` (master pajak
  potong) untuk kelola status pemotong + katalog; `create_tax_payments`
  untuk setor. Nol izin baru (vonis §1: BUKAN izin setor untuk status).

## 1. Status pemotong — tabel histori khusus `PartyWithholderStatus`

Satu tabel polimorfik disiplin (pola vonis: `partyType`+`partyId`),
BUKAN dua FK nullable dan BUKAN kolom di `Customer`/`Vendor`
(anti boolean telanjang; satu penjaga masa untuk dua jenis pihak).

```prisma
/// Histori status pemotong PPh per pihak, bertanggal efektif
/// (vonis BOT 4 F-2026-10-22-057-V §1). Satu baris = satu masa
/// berlaku status satu pihak. Sumber kebenaran efektif-per-tanggal;
/// ActivityLog = jejak siapa-kapan pendamping (wajib, bukan pengganti).
model PartyWithholderStatus {
  id            Int       @id @default(autoincrement())
  /// customer | vendor — pihak lawan transaksi sewa.
  partyType     String    @map("party_type") @db.VarChar(16)
  partyId       Int       @map("party_id")
  /// pemotong | non_pemotong
  status        String    @db.VarChar(16)
  /// Masa berlaku inklusif [effectiveFrom, effectiveTo]; to null = berjalan.
  effectiveFrom DateTime  @map("effective_from") @db.Date
  effectiveTo   DateTime? @map("effective_to") @db.Date
  /// Kategori dasar bernama (penunjukan_instansi | penunjukan_badan |
  /// penunjukan_djp | lainnya_bernama). Wajib untuk status pemotong.
  basisType     String?   @map("basis_type") @db.VarChar(32)
  /// Nomor dokumen dasar; wajib untuk status pemotong.
  basisNumber   String?   @map("basis_number")
  /// Tanggal dokumen dasar; wajib untuk status pemotong.
  basisDate     DateTime? @map("basis_date") @db.Date
  /// Alasan bernama; wajib untuk non_pemotong (mis. "OP tidak ditunjuk").
  basisNote     String?   @map("basis_note") @db.Text
  createdBy     Int?      @map("created_by")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@index([partyType, partyId, effectiveFrom])
  @@map("party_withholder_statuses")
}
```

Keputusan + alasan:

- Tanggal = `@db.Date` (tanggal kalender, uang tidak terlibat) —
  perbandingan masa di service memakai hari kalender WIB, konsisten
  pola `toCalendarDate` jalur stok. `effectiveFrom <= effectiveTo`
  ditegakkan service (dan CHECK migrasi, lihat §4).
- Tanpa FK Prisma ke `Customer`/`Vendor` (polimorfik): integritas
  pihak ditegakkan service dalam tx (pihak wajib ada + tidak
  `deletedAt`). Biaya: nol cascade — hapus pihak tidak menyeret
  histori (diinginkan: histori audit tidak boleh hilang).
- Tanpa `deletedAt`: baris histori tidak di-soft-delete; koreksi =
  tutup masa + baris baru (vonis §1c). Hapus fisik hanya lewat
  penjaga §3 (belum berlaku + belum dirujuk).
- Nama tabel/model usulan: `PartyWithholderStatus` /
  `party_withholder_statuses` — mengikuti konvensi snake_case plural
  repo.

Penjaga service (semua dalam tx, fail-closed, pesan Bahasa Indonesia
pola existing):

1. Buat baris: pihak ada; `status` ∈ {pemotong, non_pemotong};
   `pemotong` → `basisType`+`basisNumber`+`basisDate` wajib;
   `non_pemotong` → `basisNote` non-kosong; masa tidak tumpang tindih
   baris lain pihak sama (query masa bersinggungan dalam tx; masa
   bersebelahan sah: `to = from-1 hari` diperbolehkan karena inklusif
   dibandingkan per hari).
2. Baca efektif: tepat satu baris memuat `withholdingDate`; nol
   baris → error bernama (usulan kode `WITHHOLDER_STATUS_UNKNOWN`)
   menolak terbit/setor pihak itu — BUKAN default non-pemotong.
3. Tutup masa (`effectiveTo` diisi): hanya baris berjalan; menutup
   tidak boleh memotong masa yang sudah dirujuk bupot/setor terbit
   (lihat penjaga rujukan).
4. Anti-edit baris terpakai: baris yang masanya memuat
   `withholdingDate` bupot `issued` mana pun untuk pihak itu, atau
   yang sudah ditutup, TIDAK diedit isinya — koreksi = tutup + baru.
   "Dirujuk" didefinisikan persis: ada `WithholdingCertificate`
   status `issued` dengan pihak sama (vendor: lewat `vendorBill`
   pihak; customer: lewat `salesPayment`) dan tanggal potong dalam
   masa baris. Penjaga ini query dalam tx yang sama.
5. Tiap buat/tutup baris WAJIB tulis `ActivityLog` dalam tx yang
   sama (`modelType="PartyWithholderStatus"`, `oldValues`/`newValues`
   memuat status+masa+dasar) — gagal tulis log = tx gagal (bukan
   pola telan-error `logActivity` existing; pakai tulis tx langsung).
6. Izin: mutasi hanya `manage_withholding_tax` (izin master pajak
   existing persis). Baca untuk BOT 2: status+masa+dasar apa adanya.

Catatan kejujuran: pemetaan bupot→pihak hari ini tidak langsung —
`WithholdingCertificate` rujuk `vendorBillId`/`salesPaymentId`, pihak
diturunkan dari dokumen itu. Penjaga rujukan (4) memakai turunan itu;
bila kelak bupot menyimpan `partyType/partyId` snapshot, penjaga
menyederhanakan. TIDAK diusulkan kolom pihak di bupot run ini
(vonis §4 F-055-V: status BUKAN field di bupot).

## 2. Alokasi setor-sendiri — model anak `TaxPaymentAllocation`

Pola `VendorPaymentAllocation` persis. Sumber Kasus C = dokumen
transaksi sewa sumber: ISF menyewakan → `SalesInvoice` sewa (pihak
penyewa `Customer`); vonis §2: "invoice/tagihan sewa sumber Kasus C;
BUKAN bupot". Satu FK sumber konkret (bukan polimorfik) supaya
penjaga terutang bisa query mesin:

```prisma
/// Alokasi sumber setor-sendiri PPh 4(2) (Kasus C) — vonis BOT 4
/// F-2026-10-22-057-V §2, pola VendorPaymentAllocation. Tautan
/// rekonsiliasi saja; jurnal tetap dari TaxPayment (F-038/F-039).
model TaxPaymentAllocation {
  id             Int          @id @default(autoincrement())
  taxPaymentId   Int          @map("tax_payment_id")
  /// Dokumen sumber sewa Kasus C (BUKAN bupot — Kasus C tanpa bupot).
  salesInvoiceId Int          @map("sales_invoice_id")
  amount         Decimal      @db.Decimal(15, 2)
  taxPayment     TaxPayment   @relation(fields: [taxPaymentId], references: [id], onDelete: Cascade)
  salesInvoice   SalesInvoice @relation(fields: [salesInvoiceId], references: [id], onDelete: Restrict)

  @@unique([taxPaymentId, salesInvoiceId])
  @@index([salesInvoiceId])
  @@map("tax_payment_allocations")
}
```

Plus relasi balik `allocations TaxPaymentAllocation[]` di
`TaxPayment` dan `SalesInvoice`. Keputusan + alasan:

- `@@unique([taxPaymentId, salesInvoiceId])` di DB = anti-dobel
  sumber dalam satu setoran (vonis §2b) ditegakkan mesin, bukan
  hanya service.
- `onDelete: Restrict` ke `SalesInvoice`: invoice sumber yang sudah
  teralokasi tidak bisa dihapus fisik (soft-delete existing tetap
  jalan; alokasi membaca baris apa adanya).
- SATU pertanyaan terbuka untuk BOT 4/BOT 1 (bukan karangan BOT 3):
  sumber Kasus C hari ini hanya `SalesInvoice` — jalur sewa ISF
  sebagai penyewa yang membayar vendor non-pemotong memakai
  `VendorBill`, tetapi Kasus C per spec F-054-S §2 adalah ISF
  MENYEWAKAN (penerimaan bruto dari penyewa non-pemotong), jadi
  sumber = `SalesInvoice`. Bila BOT 4 menghendaki sumber `VendorBill`
  juga, bentuknya = kolom FK kedua nullable + tepat-satu-terisi +
  penjaga yang sama; BOT 3 tidak menambahkannya tanpa vonis.

Penjaga service (tx sama dengan simpan `TaxPayment`, idempotency key
mutasi finansial existing `checkIdempotency` tetap):

1. Berlaku hanya `taxKind='pph4_2'` dengan `taxTypeId` jenis sewa;
   `period` = masa transaksi (turunan tanggal dokumen sumber, bukan
   tanggal bayar) — validasi existing F-005 tetap.
2. Posted tanpa baris alokasi = DITOLAK (vonis §2d); draf tanpa
   alokasi hanya bila status memang draf — `TaxPayment.status`
   existing default `posted`, jadi jalur buat langsung posted wajib
   alokasi lengkap.
3. `SUM(alokasi.amount)` = `TaxPayment.amount` persis sen
   (Decimal(15,2), banding sen eksak) — selisih 0,01 kurang/lebih
   DITOLAK; nol baris "selisih", nol pembulatan diam-diam.
4. Tiap `amount` > 0; sumber dobel dalam satu setoran ditolak
   (plus unik DB di atas).
5. Anti setor dobel satu kewajiban: kumulatif alokasi posted ke
   satu `SalesInvoice` ≤ PPh terutang sumber. Terutang sumber =
   tarif katalog efektif pada tanggal invoice × DPP sewa invoice —
   PERLU DEFINISI DPP SUMBER: invoice existing tidak menyimpan
   penanda "baris sewa" per baris. Usulan BOT 3: terutang sumber
   dihitung service dari `WithholdingCertificate`-padanan TIDAK ada
   (Kasus C tanpa bupot), jadi basisnya = DPP yang dinyatakan saat
   alokasi pertama dan dibekukan di baris alokasi? — TIDAK. Pilihan
   jujur yang diusulkan: penjaga (c) vonis ditegakkan sebagai
   kumulatif ≤ `amount` terutang yang dihitung dari total invoice
   sewa × tarif katalog efektif tanggal invoice, dengan DPP sewa =
   dasar pengenaan yang operator nyatakan per alokasi dan WAJIB
   konsisten antar-alokasi sumber sama. Titik ini butuh vonis
   BOT 4 sebelum inti: definisi DPP sumber Kasus C (seluruh
   `grandTotal` invoice sewa vs komponen sewa saja bila invoice
   campuran). BOT 3 TIDAK mengarang basis ini.
6. Alokasi = tautan rekonsiliasi, BUKAN jurnal: jurnal setor tetap
   dari `TaxPayment` (jalur existing tak berubah).

## 3. Katalog satu baris — kolom efektif di `WithholdingTaxType` (BUKAN tabel anak)

Pilihan BOT 3: kolom baru di baris master existing, BUKAN tabel anak
per kode. Alasan terverifikasi:

- Hari ini SATU baris master = SATU kode objek (`objectCode` tunggal
  nullable, `code` unik per jenis-per-kode: `PPH42-SEWA` vs
  `PPH42-SEWA-PP`). Baris master SUDAH baris-per-kode secara de facto;
  tabel anak hanya menambah join tanpa menambah kemampuan.
- Resolver existing membaca baris master aktif keluarga `PPH42-SEWA*`
  di dalam tx terbit (`withholding-certificate.service.ts`) — kolom
  efektif tinggal menyaring baris itu per `withholdingDate`; nama
  resmi + tarif + masa dari baris yang sama = syarat vonis §3
  "SATU baris efektif yang sama" terpenuhi secara fisik.
- Tabel anak per kode baru masuk akal bila satu jenis kelak memuat
  banyak kode dengan masa berbeda-beda — belum ada bukti kebutuhan
  itu; YAGNI. Jalur naik kelas tercatat: bila itu terjadi, baris
  anak mewarisi kolom efektif di bawah persis.

Kolom usulan (semua aditif):

```prisma
  /// Nama resmi per kode objek dari katalog DJP (vonis F-057-V §3).
  /// Null = baris TIDAK AKTIF untuk pemilih kode (fail-closed tanpa nama).
  objectName    String?   @map("object_name")
  /// Masa efektif baris katalog per kode; resolusi per withholdingDate
  /// wajib mengembalikan kode+nama+tarif dari SATU baris ini.
  effectiveFrom DateTime? @map("effective_from") @db.Date
  effectiveTo   DateTime? @map("effective_to") @db.Date
```

Aturan bentuk (service dalam tx):

1. Resolusi per `withholdingDate` mengembalikan tepat satu baris
   efektif per kode; nama+tarif dibaca dari baris itu juga (F56-8).
2. `objectName` null/kosong → baris tidak tampil di pemilih dan
   resolver menolak kode itu ("nama katalog belum tersedia",
   fail-closed F-055-V §2). Perilaku baris lama (nama null) = persis
   penolakan ini — migrasi aman tanpa backfill karangan; seed dua
   kode sah F-051-V diisi nama persis katalog DJP + `effectiveFrom`
   2025-01-01 (masa katalog file F-051-V/Tahap A PR #447) lewat seed
   existing, bukan SQL migrasi.
3. Masa baris kode sama dilarang tumpang tindih (penjaga service
   pola §1; kode di sini = `objectCode` dalam keluarga jenis sama).
4. Nol baris efektif pada `withholdingDate` → `RENT_TAX_TYPE_INACTIVE`
   bernama existing; nol fallback tarif hardcode.
5. Edit nama/tarif baris yang sudah membeku di bupot terbit: snapshot
   bupot (`objectCode`+`objectName`+`tariff`) tidak berubah (sudah
   pola snapshot; F56-9). Perubahan nama/tarif = baris efektif baru:
   tutup masa baris lama + baris master baru (kode master baru bila
   perlu) — BUKAN edit in-place baris terpakai; penjaga memakai
   rujukan bupot `issued` per `withholdingTypeId` (query langsung,
   tanpa turunan pihak).
6. Transisi: `effectiveFrom` nullable agar baris lama tidak drift;
   resolver memperlakukan baris sewa dengan `effectiveFrom` null
   sebagai TIDAK efektif (fail-closed) sesudah gerbang katalog
   efektif menyala — menyala hanya sesudah seed nama+masa dua kode
   terisi (satu PR inti, satu migrasi, satu saat; tidak ada masa
   resolusi ganda diam-diam).

## 4. Migrasi + penjaga arsitektural (rencana, belum dieksekusi)

- Satu migrasi aditif: tabel `party_withholder_statuses` (+ CHECK
  `effective_from <= effective_to` dan `status IN (...)` di SQL —
  MySQL 8.0.46 menegakkan CHECK), tabel `tax_payment_allocations`
  (+ unik komposit), 3 kolom nullable di `withholding_tax_types`.
  Nol kolom diubah/dihapus; nol backfill data.
- Gate wajib sebelum commit inti: `npx prisma validate` +
  `MIGRATION_CHECK_URL=... node scripts/verify-migrations.mjs`
  hijau (drift 0) + migrasi scratch DB.
- `src/__tests__/schema-usage.test.ts`: model/kolom baru WAJIB punya
  jalur baca+tulis produk di PR inti yang sama (service + action),
  atau dibekukan beralasan — usulan ini mengikat inti = service +
  action + tes, jadi tanpa entri beku baru. Kolom `objectName` di
  `WithholdingCertificate` dari PR #447 adalah snapshot TERPISAH dari
  `objectName` katalog di §3 (sumber vs beku) — penamaan sama-sama
  disengaja, arti dibedakan komentar schema.
- Semua penjaga di service dalam tx; idempotency key mutasi
  finansial tetap (`checkIdempotency` jalur setor existing;
  `claimIdempotencyKey` jalur bupot existing).

## 5. Urutan + pemetaan falsifikasi BOT 6 (F56-1..9)

Urutan mengikat (jangan dilompati):

1. PR #439 merged (BOT 4 rebasa `915ae30f` → konfirmasi BOT 6 →
   Lead merge) DAN PR #447 merged (snapshot `objectName` bupot).
2. Vonis BOT 4 atas pertanyaan terbuka §2 butir 5 (definisi DPP
   sumber Kasus C) + putusan BOT 1 atas bentuk fisik ini.
3. BOT 3 inti: schema + migrasi + service penjaga + action +
   seed nama/masa dua kode + tes falsifikasi.
4. BOT 2 tampil status/nama/alokasi apa adanya; BOT 6 audit.

| ID | Penjaga pembukti (inti BOT 3) |
|---|---|
| F56-1 | Baca status efektif memakai baris per `withholdingDate`, bukan baris terbaru — tes tanggal lampau |
| F56-2 | Nol baris memuat tanggal potong → terbit/setor ditolak `WITHHOLDER_STATUS_UNKNOWN` |
| F56-3 | Klaim pemotong tanpa `basisNumber`/`basisDate` → ditolak + `ActivityLog` wajib ada untuk yang lolos |
| F56-4 | Masa tumpang tindih pihak sama → ditolak (service + CHECK masa) |
| F56-5 | `SUM` alokasi ≠ amount selisih 0,01 → posted ditolak |
| F56-6 | Sumber sama dobel / kumulatif > terutang sumber → ditolak (definisi terutang per vonis lanjutan §2.5) |
| F56-7 | Baris katalog `objectName` kosong → tidak tampil pemilih + resolver tolak |
| F56-8 | Nama+tarif dari baris efektif yang sama pada `withholdingDate` — tes dua masa tarif/nama beda |
| F56-9 | Edit katalog/status sesudah bupot/setor terbit → snapshot dokumen tidak berubah; baris terpakai tidak bisa diedit in-place |

## 6. Keputusan diminta

- BOT 1: setujui/tolak bentuk fisik §1-§3 + nama model/kolom +
  urutan §5. Klaim `prisma/schema.prisma` untuk inti F-057 hanya
  dibuka sesudah putusan ini.
- BOT 4: vonis definisi DPP sumber Kasus C (§2 butir 5) + konfirmasi
  sumber tunggal `SalesInvoice` (atau FK kedua `VendorBill`).
- BOT 6: falsifikasi F56-1..9 di atas siap diangkat jadi acceptance
  inti; F56-6 menunggu definisi terutang BOT 4.
