# Scan Anomali Sistem — 21 Oktober 2026

Pemindaian ulang seluruh sistem dengan lima kelas anomali yang sama dengan
temuan manual sebelumnya: (A) tautan "buat dari" mati / gerbang status tidak
sinkron, (B) URL query yang tersisa, (C) tombol aksi dobel / jalan buntu
status, (D) inkonsistensi slug vs id numerik, (E) tombol tampil tapi ditolak
guard.

Metode: lima pemindai read-only membuka badan file yang dikutip (bukan hanya
grep). Dua temuan terberat (A-01, C-01) diverifikasi ulang secara manual
sesudah pemindaian. Tidak ada eksekusi browser/DB dalam scan ini; temuan
adalah kesimpulan dari kode + server action.

Sudah diperbaiki sebelumnya dan sengaja TIDAK dilaporkan ulang: pembayaran
penjualan (gerbang posted/partial + segmen `tambah/faktur/<slug>` + banner),
detail faktur penjualan (StatusActions generik dicabut), URL absensi &
laporan (path kunci/nilai), sidebar/command-palette/hub Pengaturan (tersaring
izin, terbukti E2E).

Ringkasan: **58 temuan — 11 P1, 32 P2, 15 P3** (6 di antaranya catatan
"terverifikasi disengaja/bersih", bukan cacat).

Prioritas: P1 = pengguna bisa terjebak (form kosong diam-diam, jalan buntu,
fitur inti tidak terjangkau). P2 = inkonsistensi membingungkan tapi ada jalan
lain. P3 = konvensi/kosmetik.

Tumpang tindih antar kelas (satu akar, jangan dihitung dobel):
A-16 ≈ E-02 (tombol tanpa gerbang izin, sistemik); C-04 ≈ A-11/A-15 (gerbang
status hanya di UI); C-02 ≈ A-05 (tombol penerimaan PO).

---

## P1 — Terjebak / fitur inti tidak terjangkau

### A-01 Retur penjualan: faktur lunas tak bisa diretur
`penjualan/faktur/[slug]/page.tsx:340`, `penjualan/retur/tambah/page.tsx:27`, `actions/sales.actions.ts:1641`.
Tombol asal hanya posted/partial; halaman tambah hanya memuat faktur
`[posted, sent]` — faktur `paid` tidak pernah ditawarkan dari UI mana pun,
padahal itu kasus retur paling umum. Faktur partial ter-prefill tapi absen
dari opsi pemilih (tampil kosong). `createSalesReturn` sendiri tidak punya
gerbang status faktur.
Perbaikan: samakan tiga lapis ke status yang memang boleh diretur (termasuk
paid), tampilkan penjelasan bila faktur tak memenuhi syarat.

### A-02 Faktur dari Pesanan: gerbang asal dan saringan tujuan nyaris tak beririsan
`penjualan/pesanan/[slug]/page.tsx:308`, `penjualan/faktur/tambah/page.tsx:30`, `actions/sales.actions.ts:1351`.
Tombol +Faktur tampil untuk SO `[approved, confirmed, processing, completed]`,
halaman tambah hanya memuat SO `[draft, confirmed]`. Dari SO
approved/processing/completed: baris faktur terisi tapi pemilih Pesanan kosong
tanpa penjelasan. Sebaliknya SO draft bisa difaktur dari menu.
Perbaikan: satu daftar status bersama untuk asal/tujuan/action, plus
dokumen yang diminta selalu dimuat kembali ke pemilih.

### A-03 Uang Muka dari Pesanan tanpa Penawaran membuka form kosong diam-diam
`penjualan/pesanan/[slug]/page.tsx:133`, `penjualan/uang-muka/tambah/page.tsx:30`.
Tombol +Uang Muka tampil untuk semua SO confirmed tanpa memeriksa
`quotationId`; untuk SO mandiri parameter dibuang tanpa pemberitahuan.
Perbaikan: sembunyikan tombol bila SO tak punya penawaran, atau tampilkan
penjelasan di tujuan (pola `prefillNotice` surat jalan).

### A-06 Tagihan dari PO: baris tidak ditarik, PO tanpa penerimaan ditolak di akhir
`pembelian/pesanan/[slug]/page.tsx:90`, `pembelian/tagihan/tambah/page.tsx:108`, `actions/purchase.actions.ts:117`.
Tombol tampil untuk semua PO non-cancelled (termasuk draft). Prefill `?poId=`
menghasilkan `items: []` (beda dari jalur `?grId=` yang menyalin baris);
`createVendorBill` menolak PO apa pun tanpa GR terverifikasi — sesudah
pengguna mengetik ulang seluruh baris. PO jasa terkena gerbang GR yang sama
(perlu keputusan).
Perbaikan: tarik baris PO saat prefill, saring tombol asal ke PO yang memang
bisa ditagih, validasi three-way-match di awal form.

### A-10 Faktur dari Perintah Kerja tanpa Pesanan: form kosong, quotationId terbuang
`produksi/perintah-kerja/[slug]/page.tsx:226`, `penjualan/faktur/tambah/page.tsx:42`.
Tombol tampil untuk WO completed ber-quotationId; bila penawaran belum punya
SO, tidak ada prefill dan `quotationId` tidak diteruskan ke form, padahal
`createSalesInvoice` mendukungnya.
Perbaikan: teruskan `quotationId` ke form / buat faktur langsung dari
penawaran, beri pemberitahuan bila belum bisa.

### B-01 Filter bulan Transfer Pemasok yatim
`pembelian/transfer-pemasok/page.tsx:42`.
`?periode=` dibaca via `resolveMonth` tetapi tidak ada produsen UI, tidak ada
bentuk path, tidak ada redirect — satu-satunya filter periode yang tertinggal
dari migrasi path.
Perbaikan: migrasi ke segmen path seperti halaman periode lain + redirect
bentuk lama.

### C-01 Tagihan vendor: Setujui generik mengunci tagihan selamanya
`pembelian/tagihan/[slug]/page.tsx:71` (+ StatusActions baris 95-99).
Pada draft tampil bersamaan: **Konfirmasi** (domain: posting, jurnal,
balanceDue) dan **Setujui/Tolak** generik. Setujui hanya membalik status ke
`approved` tanpa jurnal dan tanpa balanceDue (default 0). Sesudah itu
Konfirmasi hilang (draft-only), Bayar terkunci (butuh status non-draft DAN
balanceDue > 0), Hapus ditolak server. Satu-satunya jalan keluar: Void lalu
buat ulang.
Perbaikan: cabut StatusActions dari detail tagihan (preseden faktur
penjualan), atau gerbangi tombol generik agar tak tampil bila ada aksi domain
untuk status yang sama.

### E-01 Satuan: isi form dulu, baru ditolak
`master/satuan/page.tsx:54`, `master/satuan/tambah/page.tsx:10`, `actions/master.actions.ts:2574`.
Tombol Tambah dirender tanpa syarat; halaman tambah TANPA guard sama sekali;
action menuntut `edit_units`. Karyawan/purchasing/warehouse (view-only)
mengisi seluruh form baru gagal saat simpan.
Perbaikan: bungkus tombol dengan izin + guard halaman tambah (pola
`master/barang`).

### E-02 Tombol Ubah/Hapus tampil tanpa izin di ~57 dari 63 halaman detail
Contoh `master/barang/[slug]/page.tsx:268`.
Halaman hanya menuntut `view_*`, lalu Ubah + Hapus dirender tanpa syarat;
action/tujuan menuntut edit/delete. Klik Ubah terpental diam ke dasbor; klik
Hapus melewati dialog konfirmasi baru ditolak. Pola benar sudah ada
(`kendaraan/fitment/[slug]`, `proyek/[slug]`).
Perbaikan: bungkus Ubah/Hapus dengan pemeriksaan izin secara sistemik +
ratchet test agar tidak regresi.

### E-03 Kalender Kerja: semua tombol tampil untuk peran lihat-saja
`sdm/kalender-kerja/page.tsx:106`.
Tiga tombol Tambah serta Ubah/Hapus libur & jadwal dirender tanpa syarat
padahal karyawan hanya punya izin lihat.
Perbaikan: gerbangi per izin tulis masing-masing seksi.

### E-04 Setujui/Tolak generik tampil tanpa izin approve
`components/ui/status-actions.tsx:65`.
`canApprove/canReject` murni dari status, tanpa prop izin; API menolak
(FORBIDDEN → toast "Gagal memproses"). Pengaju bisa melihat tombol Setujui
atas pengajuannya sendiri. Perlu keputusan: sembunyikan per izin approve
(pola yang disarankan) atau nyatakan disengaja.
Perbaikan: tambah prop izin ke StatusActions dan teruskan dari tiap halaman.

---

## P2 — Inkonsistensi yang membingungkan

### Kelas A (rantai buat-dari)

- **A-04** Uang Muka: penawaran `converted` disaring halaman tambah tapi
  diizinkan action — pemilih tampak kosong padahal submit bisa tersimpan.
  `penjualan/uang-muka/_components/down-payment-options.ts:28`.
- **A-05** Penerimaan kedua: tombol Buat Penerimaan hilang tepat saat PO
  menjadi `partial_received`, padahal tujuan/action mendukung penerimaan
  lanjutan. `pembelian/pesanan/[slug]/page.tsx:193` (≈ C-02).
- **A-07** Tagihan dari Penerimaan cancelled/belum verifikasi: prefill hilang
  tanpa pemberitahuan; tagihan tersimpan tanpa tautan penerimaan.
  `pembelian/penerimaan/[slug]/page.tsx:176`.
- **A-08** Pembayaran vendor: tagihan draft bisa dibayar lewat menu (form +
  action membolehkan), tapi tombol asal menyembunyikannya — pembayaran bisa
  lahir sebelum utang diakui. `pembelian/tagihan/[slug]/page.tsx:81`.
- **A-09** Retur pembelian dari PO yang belum menerima apa pun: form terpilih
  tapi nol baris tanpa penjelasan; larangan baru muncul sebagai error server.
  `pembelian/pesanan/[slug]/page.tsx:233`.
- **A-11** Penawaran→Pesanan: jalur form tanpa gerbang status/kedaluwarsa
  yang dimiliki jalur convert — penawaran draft/ditolak/kedaluwarsa bisa jadi
  pesanan (perlu keputusan). `penjualan/pesanan/tambah/page.tsx:31` (≈ C-04).
- **A-12** Surat Jalan dari Faktur hanya untuk `paid`, padahal
  tujuan/action hanya peduli status Pesanan — faktur posted/partial yang siap
  kirim tak punya jalan pintas. `penjualan/faktur/[slug]/page.tsx:138`.
- **A-13** Baris Rak dari Gudang tanpa rak: gudang ter-prefill yatim, pemilih
  rak kosong, tanpa pemberitahuan. `master/gudang/[slug]/page.tsx:110`.
- **A-14** Inspeksi QC dari WO: checklist tidak disaring menurut jenis
  inspeksi — gate Inspeksi Masuk bisa terpenuhi checklist jenis lain (perlu
  keputusan). `produksi/qc/inspeksi/tambah/page.tsx:21`.
- **A-15** Permintaan→Pesanan: PR draft/ditolak tetap bisa dipesan lewat URL
  basi; `createPurchaseOrder` tak memeriksa status PR (perlu keputusan).
  `pembelian/permintaan/[slug]/page.tsx:72` (≈ C-04).
- **A-16** Sistemik: tombol buat-dari di halaman detail tanpa gerbang izin
  buat; peran lihat-saja terlempar ke dasbor tanpa pesan (akar sama dengan
  E-02). `penjualan/faktur/[slug]/page.tsx:39`.

### Kelas B (URL)

- **B-02** Filter tahun Saldo Cuti (`?tahun=`) belum migrasi path; masih
  dibaca, bukan jalan buntu. `sdm/cuti/saldo/page.tsx:20`.
- **B-03** Identitas sesi opname masih `?sessionId=`, belum ada bentuk path
  kanonis seperti detail lain (perlu keputusan bila sesi jadi halaman
  tersendiri). `inventaris/opname/sesi/page.tsx:29`.

### Kelas C (tombol/status)

- **C-02** PO pembelian: tombol Buat Penerimaan hanya pada status `ordered`,
  padahal gerbang resmi di tempat lain `approved` — PO approved justru tak
  ditawari dari detailnya. `pembelian/pesanan/[slug]/page.tsx:193` (≈ A-05).
- **C-03** Pesanan penjualan: tombol +Uang Muka digerbangi status `confirmed`
  yang tidak pernah bisa dicapai SalesOrder (tidak ada penulis status itu) —
  tombol mati permanen; lihat juga A-03. `penjualan/pesanan/[slug]/page.tsx:133`.
- **C-04** Gerbang `approved` hanya ditegakkan di UI, bukan server, pada
  konversi PR→PO dan Penawaran→SO: siapa pun yang tahu URL bisa melewati
  persetujuan (perlu keputusan). `pembelian/pesanan/tambah/_render.tsx:35`.
- **C-05** PO berstatus `rejected` masih ditawari Buat Tagihan dan Buat
  Retur; server juga tidak memeriksa status PO. `pembelian/pesanan/[slug]/page.tsx:90`.

### Kelas D (slug vs id)

- **D-01** Tautan Detail proyek di dasbor memakai id numerik mentah
  (`/proyek/123`), melewati `entityHref`. `src/app/(dashboard)/page.tsx:425`.
- **D-02** `referenceHref` selalu membangun URL dari id numerik untuk 13 tipe
  dokumen berslug — semua tautan silang dari jurnal/buku-besar/kartu-stok
  numerik (perlu keputusan: ubah kontrak agar menerima slug).
  `src/lib/utils/format.ts:366`.
- **D-03** `activityEntityHref` membangun URL master dari id untuk ±30 tipe
  entitas — tautan Log Aktivitas & notifikasi tak pernah slug.
  `src/lib/utils/activity-href.ts:121`.
- **D-04** Slug StockMove terdaftar di `SLUGGED_MODELS` tapi tidak pernah
  ditulis kode aplikasi; URL mutasi-stok selalu numerik.
  `src/lib/utils/slug-db.ts:71`.
- **D-06** Slug dokumen SDM/fitment/transfer-aset berasal dari batang konstan
  (`cuti`, `lembur`, `transfer`, …) bukan identitas dokumen — URL tidak
  membawa nomor dokumen seperti modul lain. `actions/hrm.actions.ts:275`.
- **D-07** Slug rekening koran diturunkan dari field Referensi yang opsional;
  alur buat mengarah ke URL numerik. `actions/finance.actions.ts:71`.

### Kelas E (tombol vs guard)

- **E-05** Lembur: "+ Ajukan Lembur" terpental untuk karyawan (perlu
  keputusan: beri izin buat atau sembunyikan). `sdm/lembur/page.tsx:79`.
- **E-06** Perintah Kerja & Perintah Produksi: tombol Buat tanpa gate;
  karyawan view-only terpental diam. `produksi/perintah-kerja/page.tsx:81`.
- **E-07** Pesanan Penjualan & Pembelian: tombol Buat terpental untuk
  warehouse/finance view-only. `penjualan/pesanan/page.tsx:70`.
- **E-08** Penerimaan Barang: tombol Buat terpental untuk purchasing yang
  memang disengaja view-only. `pembelian/penerimaan/page.tsx:58`.
- **E-09** Penawaran & Permintaan Pembelian: tombol Buat terpental untuk
  finance view-only. `penjualan/penawaran/page.tsx:92`.
- **E-10** Penjualan (faktur/retur/surat-jalan): tombol Buat tanpa gate,
  menyimpang dari saudara se-modul (tukar-faktur) yang memakai `CanCreate`.
  `penjualan/faktur/page.tsx:96`.
- **E-11** Keuangan: 7 daftar tanpa gate (jurnal, kas-kecil, pengeluaran,
  pusat-biaya, pusat-laba, rekonsiliasi-bank, laporan-bank), menyimpang dari
  2 saudara yang di-gate. `keuangan/jurnal/page.tsx:78`.
- **E-12** Inventaris: tombol Buat tanpa gate (rak, penyesuaian, transfer,
  pengeluaran-material, baris-rak) + izin tujuan tak sebangun (tambah rak
  menuntut izin gudang). `inventaris/rak/page.tsx:56`.
- **E-13** Aset grup/transfer & CRM tickets: tanpa gate, menyimpang dari
  saudara se-modul yang memakai `CanCreate`. `aset/grup/page.tsx:50`.

---

## P3 — Konvensi & catatan

- **B-04/B-05/B-06** Prefill rantai penjualan/pembelian/produksi masih query
  (`?salesOrderId=`, `?poId=`, `?billId=`, `?workOrderId=`, …). Semua terbaca
  konsumennya dan beberapa memberi peringatan bila id tak valid — berfungsi,
  hanya menyimpang dari pola path yang sudah ada (pembayaran
  `faktur/<slug>`, pesanan `tambah/<prId>`).
- **B-07** Prefill gudang/perintah-kerja dibaca client-side
  (`useSearchParams`) tanpa deklarasi `searchParams` di halaman — kontrak
  URL-nya tak terlihat penjaga statis bergaya `report-url-convention`.
- **D-05** Lima rute ubah `[id]` numerik (absensi, harga-pemasok,
  kalender-kerja) adalah satu-satunya keluarga non-slug; modelnya memang tak
  punya kolom slug (perlu keputusan: migrasi slug atau nyatakan pengecualian
  kanonis).
- **D-08** Nilai filter laporan terbit dalam dua bentuk (slug atau id)
  tergantung slug baris kosong — 22 kemunculan pola `slug ?? String(id)` di
  `laporan/**`.
- **D-09** Tautan Barang di detail mutasi-stok memakai `itemId` mentah
  padahal slug barang sudah termuat. `inventaris/mutasi-stok/[slug]/page.tsx:57`.
- **D-10** Tautan kendaraan-pelanggan bersarang merakit fallback slug/id
  manual di lima tempat, melewati `entityHref`.
- **E-14** Kelompok Pajak: tombol Tambah tanpa gate di modul master yang
  mayoritas di-gate (dampak kini laten). `master/kelompok-pajak/page.tsx:62`.

## Terverifikasi disengaja / bersih (bukan cacat)

- **C-06** Penawaran: Setujui generik (approval internal) vs alur pelanggan
  memang dipisah disengaja; `approved` adalah gerbang hilir resmi.
- **C-07** Pesanan penjualan: `approved` sebagai gerbang Surat Jalan/Faktur
  disengaja (DELIVERABLE_ORDER_STATUSES). Catatan kecil: SO `rejected` tanpa
  workflow tak punya jalan Buka Ulang dari detail (perlu keputusan).
- **C-08** Permintaan pembelian: `approved` gerbang Buat Pesanan terverifikasi,
  tanpa tombol tandingan.
- **C-09/C-10** Cuti & Lembur: StatusActions adalah satu-satunya gerbang dan
  statusnya benar-benar dikonsumsi hilir (lembur menjalankan efek domain).
- **C-11** Semua halaman ProcessButton lain saling eksklusif per status;
  tidak ditemukan dua tombol untuk transisi yang sama.
- Kelas A: rantai SO→Surat Jalan, Tukar Faktur, stok-minimum, Perintah
  Produksi, Model Kendaraan, Rak terbukti selaras tiga lapis.
- Kelas B: kelompok redirect lama NIHIL temuan — setiap bentuk lama yang
  dipindah ke path punya `redirect()` atau tetap dibaca; tidak ada URL lama
  yang langsung 404.
- Kelas D: 71 halaman `[slug]` + 72 halaman `[slug]/ubah` semuanya memakai
  resolver slug-atau-id; tidak ada tautan yang 404 hanya karena bentuk id.

## Keterbatasan

- Read-only dari kode sumber + server action; tanpa eksekusi browser/DB.
  Temuan bertanda "perlu keputusan" membutuhkan pilihan produk sebelum
  diperbaiki (mis. apakah PO jasa wajib GR, apakah PR draft boleh dipesan
  lewat URL, apakah karyawan boleh mengajukan lembur).
- Kelas E memakai sampel sistematis 128 halaman daftar + pembukaan badan
  kandidat; angka "~57 dari 63 halaman detail" (E-02) berasal dari pencocokan
  pola yang kemudian diverifikasi pada contoh per modul.

## Urutan perbaikan yang disarankan

1. **C-01** (kunci tagihan permanen) — cabut/gate StatusActions di tagihan.
2. **Gerbang status tiga lapis satu daftar bersama** untuk rantai buat-dari:
   A-01, A-02, A-05/C-02, A-12, C-03/A-03, C-05 — asal, tujuan, dan action
   membaca daftar status yang sama, dokumen yang diminta selalu dimuat
   kembali + penjelasan bila tak memenuhi syarat (pola `prefillNotice`).
3. **Gate tombol UI sistemik**: E-02/E-03/E-01/E-04 dulu (P1), lalu sapu
   E-05 s.d. E-14 dengan `CanCreate`/prop izin + ratchet test.
4. **Keputusan gerbang server**: C-04/A-11/A-15 — tegakkan status di action
   atau nyatakan URL sebagai jalur resmi.
5. **URL**: B-01 (migrasi path + redirect), lalu B-02/B-03; pola prefill
   query (B-04 s.d. B-07) diseragamkan bertahap mengikuti pola pembayaran.
6. **Slug kanonis**: D-01/D-09 (perbaikan titik), lalu D-02/D-03 (kontrak
   helper), D-04/D-06/D-07 (penulisan slug), D-05/D-08 (keputusan/backfill).

## Status penutupan (21 Oktober 2026)

Seluruh temuan P1/P2/P3 di atas sudah ditindaklanjuti dalam empat batch
kerja sesudah laporan ini terbit:

- **Batch 1 (rantai penjualan/pembelian inti)**: C-01 StatusActions dicabut
  dari detail tagihan vendor; E-04 StatusActions menerima prop `canAct`;
  A-01/A-02 daftar status bersama (`RETURNABLE_INVOICE_STATUSES`,
  `DELIVERABLE_ORDER_STATUSES`) dibaca tombol asal, halaman tujuan, dan
  server action; A-03/C-03 uang muka SO; A-10 faktur dari perintah kerja;
  A-06 tagihan dari PO menarik baris PO; E-01 satuan; B-01 transfer
  pemasok bermigrasi ke path `bulan/<YYYY-MM>` + redirect query lama.
- **Batch 2 (rantai P2)**: A-04, A-05/C-02, A-07, A-08, A-09/C-05,
  A-11/C-04, A-12, A-13, A-14, A-15, B-02 saldo cuti path `tahun/<YYYY>`,
  B-03 sesi opname menjadi halaman detail `[slug]`.
- **Batch 3 (gerbang tombol UI)**: sapuan `CanCreate`/prop izin di seluruh
  modul + ratchet `button-permission-gating.test.ts` agar kelas cacat ini
  tidak kembali.
- **Batch 4 (slug kanonis)**: D-01, D-09, D-04 (semua situs `stockMove.create`
  menulis slug), D-06, D-07, D-02 (`referenceHref(..., refSlug)`), D-03
  (`resolveActivityReferenceSlugs`), D-10 (`entityNestedHref`).

Keputusan yang diambil saat penutupan (bukan temuan terbuka):

- **A-06**: PO jasa tidak wajib GR; three-way match memakai plafon total PO.
- **A-14**: checklist QC harus sejenis dengan `inspectionType`; ditolak di
  UI dan server.
- **C-04/A-11/A-15**: gerbang status ditegakkan di server action, bukan
  hanya disembunyikan di UI.
- **D-05**: model tanpa kolom slug tetap memakai rute numerik `[id]`
  sebagai pengecualian kanonis; tidak dipaksakan migrasi slug.
- **D-08**: nilai filter laporan `slug ?? String(id)` dipertahankan
  sebagai jembatan baris lama; resolver laporan menerima kedua bentuk
  dan baris baru selalu menulis slug (D-04/D-06/D-07 + backfill).

Bukti gerbang akhir pada working tree penutupan: unit test penuh
5.416 lolos / 7 skipped / 0 gagal, `tsc --noEmit` bersih, ESLint bersih,
build produksi sukses, dan E2E terkait (RBAC per-role 15/15, rantai
penjualan/pembelian, posting faktur, keuangan, inventaris, kalender
kerja, bengkel, dasbor, penggajian, permukaan operasional, laporan)
seluruhnya lolos pada bundle standalone hasil build tersebut.
