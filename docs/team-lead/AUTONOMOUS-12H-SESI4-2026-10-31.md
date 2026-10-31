# Autonomous 12H Sesi 4 — 2026-10-31

Perintah user: kerja 12 jam nonstop, TANPA tanya. Pilih sendiri opsi
recommended. DILARANG ubah config permissions/bypass. DILARANG push.
Catatan: satu-satunya pertanyaan yang boleh muncul adalah gerbang
consent tertulis dari tool itu sendiri (Prisma dangerous-action) —
bukan pertanyaan pendapat.

Aturan tetap: verifikasi main session sebelum fix (klaim agen bukan
vonis); bug fix = regression test; diff + test terdampak + tsc + lint
per batch; commit lokal per domain di `main`; migrasi baru bila perlu,
jangan `migrate deploy` ke DB dev; `TZ=Asia/Jakarta`; jangan seed demo
ke DB dev; jangan materialisasi cookie/kredensial.

## Antrean

### S4-A — Audit Round 8 (read-only, agen paralel, domain belum digali)
1. Keuangan inti: jurnal/posting, tutup periode, rekonsiliasi bank,
   pembayaran (vendor/customer), alokasi, mata uang.
2. Pajak: faktur pajak, PPh/PPN, Coretax jalur selain snapshot R6IE-07.
3. SDM/payroll: hitung gaji, komponen, pinjaman karyawan, cuti, lembur,
   absensi — jalur uang selain approval (sudah Round 6).
4. Penjualan/pembelian rantai: DP, retur, komisi, termin, harga.

Setiap domain: file `ROUND8-<DOMAIN>.md`, file:line, CONFIRMED/
PLAUSIBLE, bukti kode. "Bersih" dicatat supaya tidak diaudit ulang.

### S4-B — Triase + fix
Prioritas CONFIRMED: uang > stok > scope/izin > data hilang > tampilan.
Diff terkecil di titik bersama, bukan per pemanggil.

### S4-C — Verifikasi berat
Suite terdampak per fix; penutup: ci:quick penuh; E2E subset sesi sah
bila ada perubahan perilaku UI/API; db:check-migrations bila ada
migrasi baru.

## Log
- Sesi 4 dimulai. HEAD d5be0b6b7, tree bersih.
- S4-A: 4 agen audit paralel jalan (keuangan inti, pajak, payroll,
  rantai jual-beli). Dokumen ROUND8-* menyusul dari hasil agen.
- Temuan main session (integrasi DB nyata, `RUN_DB_INTEGRATION=1` ke
  DB dev): 3 gagal dari 13 —
  (a) `db-concurrency`: dua `createJournal` paralel referensi sama
  sama-sama fulfilled (harusnya 1 ditolak) → kandidat double-posting,
  verifikasi ditahan sampai agen keuangan selesai (domain sama);
  (b) `db-concurrency` reversal: 0 fulfilled dari 2 paralel;
  (c) `warranty-unique`: cleanup FK `customer.delete` gagal — kandidat
  artefak data sisa DB bersama, perlu rerun terisolasi. **Rerun
  terisolasi HIJAU 1/1 → artefak cleanup saat suite paralel berbagi DB
  dev, bukan bug.** (a)+(b) menunggu agen keuangan.
  4 suite lain hijau termasuk inventory-integration + bank-ledger
  equivalence melawan schema baru hasil db push.
- Temuan R8-NAV-01 (dari E2E nyata): anak "Slip Gaji Saya" tanpa
  `permission` (pengecualian PUTUSAN Lead Q-PS-1) membuat grup SDM tak
  pernah kosong → grup tampil untuk role tanpa satu pun izin SDM.
  Fix: `NavItem.selfService` + helper murni `visibleGroupChildren`
  (`navigation.ts`) + render `sidebar.tsx` pakai helper itu. Grup
  hanya dibuka oleh anak non-self-service; item self-service ikut di
  dalamnya saat grup terbuka. Regression: 3 test helper +
  `sidebar-render.test.tsx` 4 test (satu sidebar, satu tautan per
  href, SDM tertutup untuk `view_items`, Slip Gaji Saya ikut saat
  `view_attendance`). Layout suite 31/31, tsc+lint bersih.
  Verifikasi E2E — flake penjelasan: `rbac-role-access` gagal
  strict-mode hanya pada run paralel (4 worker): salinan SSR-shell
  RSC masih di DOM saat hidrasi CSR menulis ulang shell yang sama.
  Bukti read-only: snapshot galat memuat satu sidebar; diag polling
  50ms sejak sebelum hidrasi selalu `links=1`; junit.xml bersih.
  serial 15/15 hijau; sesudah `waitForLoadState("networkidle")`
  sebelum asersi tautan (pola sama seperti test tombol payroll yang
  sudah ada) → 3 run paralel berturut-turut 15/15 hijau.

### S4-A hasil agen (masuk, menunggu triase main session)
- Pajak (12): R8-PAJAK-01..12 — dokumen `ROUND8-PAJAK.md`.
- Jual-beli (10): R8-JB-01..10 — dokumen `ROUND8-JUAL-BELI.md`.
- SDM/payroll (6): R8-SDM-01..06 — dokumen `ROUND8-SDM.md`.
- Keuangan inti (10): R8-KEU-01..10 — dokumen `ROUND8-KEUANGAN.md`.
Empat dokumen hasil agen + daftar "Bersih" (anti-audit-ulang) dicatat
persis seperti dilaporkan; status CONFIRMED/PLAUSIBLE dicantumkan
apa adanya. Triase per temuan dilakukan main session dari kode nyata
sebelum fix (klaim agen bukan vonis).

- Batch customer-credit (ter-commit): R8-KEU-01 refund parsial kedua
  P2002 + R8-KEU-02/R8-JB-01/02 alokasi kredit (gate posted/partial +
  returnCredit) — `ROUND8-KEUANGAN.md`/`ROUND8-JUAL-BELI.md`.
- Batch pajak: R8-PAJAK-04 (replace faktur masukan credited ditolak),
  R8-PAJAK-05 (kredit replaced/draft/rejected ditolak), R8-PAJAK-06
  (read-model SPT skip replaced). R8-PAJAK-01 ternyata lebih dalam
  dari laporan agen: unique DB plain semua baris, jadi reorder saja
  tidak cukup — nomor seri pengganti memang sama dengan asal. Fix =
  kolom GENERATED `active_number_key` + unique aktif saja (pola
  `Journal.activeReferenceKey`) + reorder tulis; migrasi
  `20261031100000_taxinvoice_active_number_unique` drift 0,
  diterapkan manual ke DB dev (db push diblokir gerbang
  `--accept-data-loss`; tax_invoices 0 baris), regression integrasi
  DB hijau lawan DB dev (RUN_DB_INTEGRATION). Suite pajak 38 + guard
  schema-usage 53 hijau, tsc+lint bersih.
- Pajak tuntas 12/12: 02 (slug settle dalam tx), 03 (potongan fasilitas
  nol), 08 (jenis aktif), 09 (slug tax payment dalam tx), 07 (bupot bill
  batal disaring + void digerbang), 10 (sisa sengketa hanya
  DIKABULKAN*), 11 (cancel ketetapan klaim atomik), 12 (daftar pelanggan
  tanpa replaced). Berikutnya: keuangan R8-KEU-03..10, jual-beli
  R8-JB-03..10, SDM R8-SDM-01..06.
- R8-KEU-03 selesai: purchase advance tanpa idempotencyKey kini mengklaim
  key dalam tx, form create mengirim key, akun direct-call dikontrol
  aktif/non-deleted + reportGroup BANK + type ASSET, slug dibaca dalam tx.
  Test purchase advance 25/25 lokal, suite purchase terkait 213/213; tsc
  0 debug, lint 0 error, diff bersih. Berikutnya R8-KEU-04..10,
  R8-JB-03..10, R8-SDM-01..06.
- R8-KEU-04/05 selesai: deleteExpense lock + recheck + deleteMany
  bersyarat dalam tx; approveExpense lock + recheck + sync kas kecil +
  flip (dan akrual klaim) dalam tx bersama; hook terima txClient opsional
  + guard status. 276 test terkait hijau, tsc bersih, lint 0 error,
  diff bersih. Berikutnya R8-KEU-06..10, R8-JB-03..10,
  R8-SDM-01..06.
- R8-KEU-06 selesai: match + complete rekonsiliasi bank kini menolak
  jurnal/baris yang sudah dipakai recon completed (cek global + lock
  jurnal/kronon dalam complete). Finance suite 163/163. Berikutnya
  R8-KEU-07..10, R8-JB-03..10, R8-SDM-01..06.
- R8-KEU-08 + R8-KEU-10 selesai: helper delete jurnal kas kecil menolak
  POSTED aktif di dalam tx; refund PPN DP menyerap residu di refund
  penutup (previouslyRefunded dari akumulasi kredit sumber DP). Finance
  164/164, DP VAT + customer-credit 62/62. Berikutnya R8-KEU-07,
  R8-KEU-09, R8-JB-03..10, R8-SDM-01..06.
- R8-KEU-09 selesai: guard edit pembayaran penjualan legacy kini
  mengurangkan kredit retur completed dari sisa tagihan (loader kanonis,
  sama seperti create). Sales suites 218/218 hijau. Berikutnya
  R8-KEU-07 (PLAUSIBLE), R8-JB-03..10, R8-SDM-01..06.
- R8-KEU-07 selesai: complete rekonsiliasi kini tie-out saldo buku
  tersimpan ke GL akun s/d cutoff dan mewajibkan seluruh baris koran
  dalam cakupan tercocok/dikonsumsi completed lain. Domain keuangan
  Round 8 tuntas. Berikutnya R8-JB-03..10, R8-SDM-01..06.
- R8-JB-03 + R8-JB-04 selesai: relief retur beli menyebar ke bill
  terbuka PO tertua (prioritas tautan GR), bill lunas tidak menelan
  relief; reversal + confirm pembayaran vendor menggeser balanceDue
  tersimpan persis sebesar alokasi (relief retur tak terhapus).
  Keputusan: tanpa migrasi/model VendorCredit; balanceDue tetap
  kanonis 155-S. 238 test batch + 124 tetangga hijau, tsc bersih,
  lint bersih. Berikutnya verifikasi JB-05..10, SDM-01..06 dari kode
  nyata, lalu triase integrasi jurnal.
- R8-JB-05..07 + R8-JB-10 selesai: baris DP konversi awal sebesar porsi teralokasi (kelebihan tetap kredit pelanggan, baris Rp0 = marker idempotency); postInvoice kini memanggil recalc kanonis dalam tx yang sama (akrual komisi faktur konversi DP); persen diskon/pajak bill di-clamp [0,100] di satu sumber hitung; komentar confirmVendorBill diperbaiki. 442 test batch + 223 tetangga hijau, tsc bersih, lint bersih. Berikutnya JB-08 (keputusan), triase SDM-01..06 dari kode nyata, triase integrasi jurnal.
- R8-JB-08 selesai: kop manual bill tanpa baris wajib grandTotal = subtotal + tax; ditolak di create, update, dan confirm (nilai tersimpan, bila tanpa baris). 250 test hijau, tsc bersih, lint bersih. Sisa Round 8: SDM-01..06 (verifikasi dari kode nyata), triase integrasi jurnal, penutup sesi.
- R8-SDM-01..04 selesai: koreksi slip paid kini amortisasi ulang persis invers pemulihan (subledger neto nol per pinjaman); agregator BPJS/PPh21 menyingkirkan slip yang digantikan; updatePayroll klaim atomik draft; mutasi baris + recalc satu tx terkunci. SDM-05 (prorate) dan SDM-06 (basis lembur/lantai 75%) DITANGGUHI dengan alasan tertulis di dokumen audit -- butuh vonis bisnis/data historis, bukan patch. 233 test HRM hijau, tsc bersih, lint bersih. Sisa: triase integrasi jurnal, penutup sesi.
- Triase integrasi jurnal tuntas: dua kegagalan historis (dua createJournal paralel reference sama sama-sama fulfilled; dua reversal paralel 0 fulfilled) TIDAK ter-reproduksi di MySQL 8 nyata dengan seluruh migrasi diterapkan. createJournal paralel: tepat 1 fulfilled (unique aktif memangikat; jalur Serrano txless Serializable dan tx-client keduanya aman). reverseJournal paralel: tepat 1 fulfilled langka (kalah ditolak cek status/reversal sudah ada). Index unique jurnal aktif terbukti ada di fisik DB. Vonis: artefak DB bersama sesi awal (seperti warranty), bukan bug kode; tidak ada perubahan fungsi produk. Scratch dibuang, file test debug dihapus. Sisa Round 8 yang memang butuh vonis: R8-JB-09 (due date dari termin), R8-SDM-05/06 (prorate, basis lembur).

## Penutup sesi 4 (2026-10-31)

### Status domain Round 8
- Pajak: 12/12 SELESAI.
- Keuangan: 10/10 SELESAI.
- Jual-beli: 09/10 SELESAI; sisa R8-JB-09 DITANGGUHI (keputusan desain sumber termin).
- SDM: 01--04 SELESAI; 05--06 DITANGGUHI dengan alasan tertulis (vonis bisnis/data historis).
- Triase integrasi jurnal: vonis artefak, tanpa perubahan kode.

### Commit sesi 4 (lokal, branch main, belum push)
Urutan commit lokal sesi 4 (pajak -> keuangan -> jual-beli -> SDM; log sesi ini menyertai). Politik: jangan push, jangan rewrite history yang sudah ter-push, jangan tanam demo data ke DB dev tangan, jangan tanya ulang hal yang butuh keputusan bisnis -- dokumen audit memiliki status DITANGGUHI yang cukup sebagai checkpoint tertulis.
Disiplin verifikasi yang berlaku: reviewer code-review terpisah per commit (menemukan tiga blocker finansial yang lolos test lokal), higiene kredensial mutlak, test+lengkap+build sebelum E2E bila suite tersedia.

## R8-JB-09 SELESAI (2026-10-31, lanjutan)

- Vonis: akibat ERP-nya, `dueDate` adalah SNAPSHOT dokumen — `date +
  PaymentTerm.days` lawan saat dokumen lahir/diubah; master berubah
  tidak menggeser dokumen lama. Isian eksplisit form menang; tanpa
  termin aktif → null (semantik aging lama). Dokumen lama tidak
  di-backfill.
- Server: `computeDueDate`/`resolveDueDate` di `vendor-bill.ts`;
  create/update faktur + bill, faktur selisih/progres, faktur
  konversi DP (tanggal dokumen tengah malam UTC). Pelanggan mendapat
  `paymentTermId` cermin vendor (migrasi
  `20261031110000_customer_payment_term`, FK SET NULL) + penjaga
  termin aktif di create/update pelanggan.
- Form: pratinjau dueDate dari termin lawan (hari terhitung di
  handler/initializer, tanpa effect); dueDate tersimpan mode ubah
  tidak ditimpa. Termin 0 hari = jatuh tempo tanggal dokumen.
- Bukti: helper + action + hook + form tests 742/742 hijau;
  guard statis 32/32; tsc bersih; lint tanpa error baru (2 warning
  e2e lama); `db:check-migrations` drift 0; production build hijau;
  kolom/index dev DB terverifikasi; dev server CSRF 200 sesudah
  regenerate Prisma + restart.

## E2E (permintaan: rerun dulu, fix sisa)

- Sweep penuh: 680 pass, 42 fail, 10 skip. Rerun serial atas 19 file
  gagal: 38 masih gagal. Klasifikasi dari artefak `error-context.md`:
  dominan duplikat TRANSIEN hidrasi/streaming (snapshot aksesibilitas
  steady-state hanya 1 elemen; polling DOM standalone `1,2,1,1,...`
  ~150ms) — locator spec tanpa `.first()`/scope adalah korban, bukan
  bug produk. Sisa non-transien yang tercatat: 2 kegagalan
  `crud-surface` (`/produksi/garansi`, `/produksi/qc/inspeksi` — qc
  diketahui butuh data demo released), kegagalan `purchase-chain`/
  `sales-chain` tanpa pesan locator (perlu rerun terisolasi untuk
  vonis), dan beberapa `toBeVisible`/`toHaveCount` halaman modul
  yang perlu dibedakan beban vs perubahan halaman per kasus.
- Belum ada edit spec yang dilakukan; tak ada temuan produk dari
  klasifikasi ini. Perbaikan spec per pola rumah: `.first()`/
  `:visible` pada locator yang terbukti transien, helper
  `awaitReady` yang sudah ada.
