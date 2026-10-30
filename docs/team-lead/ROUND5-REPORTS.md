# Round 5 — Audit Laporan / PDF / Excel

Audit read-only Round 5 atas `src/lib/reports/**`, `src/lib/pdf/**`,
`src/app/(dashboard)/laporan/**`. Fokus: bug BARU di luar temuan Round 2/3/4
(sudah diverifikasi teratasi: total PDF geser kolom statement pelanggan,
slug stok dibuang di PDF, Invalid Date registry, periode aging PDF, saldo
awal kartu stok full-scan).

Sapu statis yang dinyatakan SELARAS (tanpa temuan): trailing alignment
semua baris `kind: "total"` vs kontrak `render.ts:442-448` (aging,
ar-ap-summary, asset-register, customer-statement, ledger-cash, payroll,
tax-summary, trial-balance); penerusan filter layar → PDF (kartu-stok,
stok-tidak-bergerak, neraca/neraca-skontro, aset-tetap, piutang-pelanggan);
`multi-periode` (akun dicari dari hasil groupBy — tak ada akun hilang);
`financial-charts-data` (kumulatif + opening, tak ada hitung ganda);
`period-comparison`/`previousWindow` (uji ada di
`src/lib/reports/__tests__/period-comparison.test.ts`, jendela sama-panjang
benar); catch logo/gambar PDF (`render.ts`, `generator.ts:119,471` —
sengaja, kop/baris dokumen tetap jalan); akun nonaktif di statement —
DITOLAK sebagai temuan: tak ada jalur produk yang menulis
`Account.isActive=false`/`deletedAt` (`updateAccount` di
`src/actions/master.actions.ts:3208` hanya code/name/slug/type/parentId/
description/normalBalance), jadi tak ada skenario nyata.

Hasil: 3 temuan (2 HIGH, 1 MED). Semua CONFIRMED statis.

---

## 1. HIGH — Buku Pembantu Utang menghitung pembayaran vendor draft & reversed

Klasifikasi: CONFIRMED
File: `src/lib/reports/ledger-cash-data.ts:397-401`

Bukti:

```ts
prisma.vendorPayment.findMany({
  where: { vendorId: partyId, deletedAt: null },
  ...
```

- Tak ada filter `status`. Kontras dalam file sama: sisi piutang memakai
  `activeSalesPaymentWhere(...)` (`ledger-cash-data.ts:315`).
- `activeVendorPaymentWhere` tersedia dan terdokumentasi wajib untuk
  pembaca uang (`src/lib/finance/payment-status.ts:38-46`, komentar
  FIN-BR-008), tetapi nol pemakai di seluruh `src/`.
- Pembaca vendor payment setara sudah benar: `status: "completed"` di
  `src/lib/reports/bank-movements-data.ts:45-50` dan
  `src/lib/reports/payment-expenses-data.ts:33-39`.
- Baris draft & reversed benar-benar ada: `VendorPayment.status @default("draft")`
  (`prisma/schema.prisma:2556`), `vendorPayment.create` tanpa status
  (`src/actions/purchase.actions.ts:1731`), konfirmasi draft→completed
  baru mengalokasikan & memposting jurnal (`purchase.actions.ts:2057-2090`),
  reversal menandai baris `status: "reversed"` tanpa menghapus
  (`purchase.actions.ts:2025-2033`).
- Loader ini dipakai PDF registry `buku-pembantu-utang`
  (`report-registry.ts:1087-1094`).

Mengapa salah: entri pembayaran berubah jadi debit subledger
(`buildPayableSubledgerEntries`, `ledger-cash-data.ts:369-375`), jadi
pembayaran draft (belum dikonfirmasi, belum menurunkan `paidAmount`
tagihan, belum ada jurnal) dan pembayaran reversed (jurnal sudah dilawan,
tagihan sudah dibuka kembali) tetap mengurangi saldo Buku Pembantu Utang
selamanya.

Skenario: tagihan pemasok Rp1.000.000, PPh 20.000 → kredit subledger
980.000. Dibuat pembayaran draft Rp500.000 (belum konfirmasi). Buku
Pembantu Utang layar/PDF menampilkan saldo 480.000 seolah sudah dibayar;
aging dan GL tetap 980.000. Pembayaran yang kemudian di-reverse pun tetap
tampil mengurangi saldo.

Fix terkecil: samakan dengan pembaca lain —

```ts
where: { vendorId: partyId, status: "completed", deletedAt: null },
```

(`status: "completed"`, bukan `activeVendorPaymentWhere` `not: "reversed"`:
draft juga tidak boleh masuk karena belum mengalokasi/memposting.)

Test regresi: test loader mock Prisma di
`src/lib/reports/__tests__/subledger-reconciliation.test.ts` style —
vendorPayment draft 500rb + reversed 300rb + completed 200rb atas tagihan
980rb → saldo akhir 780rb, hanya completed muncul sebagai entri. Test yang
ada hanya menguji builder murni `buildPayableSubledgerEntries`, tak
menutup celah loader ini.

---

## 2. HIGH — Arus Kas: PDF memakai basis neto aktivitas, layar memakai neto kas → Saldo Kas Akhir beda antar medium

Klasifikasi: CONFIRMED
File: layar `src/app/(dashboard)/laporan/arus-kas/[[...segments]]/page.tsx:106-114,195-206`;
PDF `src/lib/reports/ledger-cash-data.ts:876-904`

Bukti:

- Layar: `buildCashFlowTotals(entries, openingRaw)` dari
  `src/lib/finance/cash-flow.ts:146` — `netCashFlow = totalInflow -
  totalOutflow` dari SEMUA entri akun kas; baris "Kenaikan/(Penurunan) Kas
  Bersih" = `netCashFlow`, "Saldo Kas Akhir Periode" = `closingBalance`
  (`page.tsx:197,205`).
- PDF: `buildCashFlowTotals({ entries: [], priorBalances, activities })`
  dari `src/lib/reports/arus-kas.ts:45`, lalu
  `const net = totals.activityNet` (`ledger-cash-data.ts:882`) dan baris
  yang sama dicetak `money(net)` + `money(safeAdd(opening, net, 2))`
  (`ledger-cash-data.ts:902-904`).

Mengapa salah: `activityNet` hanya menjumlah jurnal yang berhasil
diklasifikasi. `classifyJournal` mengembalikan `null` — dan
`foldActivities` melewatkannya — bila `cashDelta === 0` ATAU tak ada
counterpart non-kas (`src/lib/finance/cash-flow.ts:101`): transfer antar
akun kas dan jurnal kas-murni. Neto kas layar menghitung semua mutasi
akun kas, jadi kedua neto menyimpang persis sebesar mutasi tak
terklasifikasi; saldo awal sama-sama dari `priorSums`, sehingga selisih
murni masuk ke Saldo Kas Akhir PDF. Di layar sendiri, baris aktivitas dan
baris "Kenaikan Kas Bersih" juga tak harus cocok (aktivitas dari
klasifikasi, subtotal dari neto kas) tanpa baris penjelas.

Skenario: periode berisi jurnal transfer Kas → Bank Rp10.000.000 yang
dikelompokkan sebagai satu jurnal dua sisi kas (cashDelta antar akun kas
tak teratribusi ke aktivitas mana pun oleh `classifyJournal` bila
jurnalnya kas-vs-kas atau jurnal kas sebagian) plus penjualan tunai.
"Kenaikan Kas Bersih" dan "Saldo Kas Akhir Periode" di PDF berbeda dari
layar/CSV sebesar mutasi yang tak terklasifikasi, tanpa indikasi.

Fix terkecil: PDF memakai basis yang sama dengan layar untuk dua baris
bawah — hitung `netCashFlow` dari `entries` kas (sudah diambil di
`ledger-cash-data.ts:842-848`, saat ini dibuang dengan `entries: []`) dan
pakai `totals.closingBalance`; aktivitas tetap rincian. Alternatif setara:
tambah baris eksplisit "Mutasi kas tak terklasifikasi" = `netCashFlow -
activityNet` supaya subtotal aktivitas terikat ke neto kas.

Test regresi: fixture jurnal transfer antar-kas 10jt + jurnal kas dengan
counterpart pendapatan 3jt → assert grand total statement `loadCashFlow`
= opening + (total debit − kredit akun kas); test yang ada
(`src/lib/reports/__tests__/arus-kas.test.ts`) hanya menguji builder murni
terisolasi, bukan paritas layar-vs-PDF.

---

## 3. MED — Stok Minimum: filter periode range tampil di UI tapi periode tak berpengaruh ke angka sama sekali

Klasifikasi: CONFIRMED
File: `src/lib/reports/min-stock-data.ts:46-148`;
`src/app/(dashboard)/laporan/stok-minimum/[[...segments]]/page.tsx:32-60,74`

Bukti:

- `loadMinStock(period)` memakai `period` HANYA untuk label:
  `...rangePeriodLabels(period)` (`min-stock-data.ts:146`). Query barang
  (`min-stock-data.ts:50-65`) dan lapisan (`min-stock-data.ts:84-88`) tanpa
  filter tanggal apa pun — isi selalu posisi stok kini (`qtyOnHand`,
  `remaining > 0`).
- Halaman tetap memasang `ReportPeriodFilter mode="range"` dengan default
  1 Januari tahun berjalan → hari ini (`page.tsx:32-60`) dan meneruskan
  `period.slug` ke PDF (`page.tsx:74`; registry `report-registry.ts:685-698`
  juga hanya memakai `periodCaption`).

Mengapa salah: mengganti rentang periode mengubah caption ("Dari … s/d …")
tapi tidak mengubah satu angka pun. Pengguna membaca laporan sebagai
posisi pada periode terpilih (mis. akhir bulan lalu) padahal isinya posisi
saat ini. Ini filter menyesatkan, bukan divergensi layar-vs-PDF (keduanya
sama-sama mengabaikan periode).

Fix terkecil: laporan ini posisi-kini — pakai mode tanpa periode seperti
stok-tidak-bergerak (filter "none"/tanpa `ReportPeriodFilter`), caption
diganti tanggal cetak; ATAU bila posisi historis memang diinginkan,
hitung qty dari stock move s/d `period.end`. Pilihan pertama diff terkecil
dan jujur terhadap data yang benar-benar dibaca.

Test regresi: panggil `loadMinStock` dengan dua periode berbeda → assert
caption tidak mengklaim rentang yang tak dipakai (atau, bila mode
historis dipilih, assert qty berubah mengikuti move). Test saat ini tak
mengunci perilaku periode loader ini.

---

## Ringkasan

| # | Severity | Klasifikasi | Temuan |
|---|----------|-------------|--------|
| 1 | HIGH | CONFIRMED | Buku Pembantu Utang hitung pembayaran draft & reversed |
| 2 | HIGH | CONFIRMED | Arus Kas PDF vs layar beda basis neto → Saldo Akhir beda |
| 3 | MED | CONFIRMED | Stok Minimum: filter periode tak berpengaruh ke angka |

Tidak ada file produk yang diubah dalam audit ini.
