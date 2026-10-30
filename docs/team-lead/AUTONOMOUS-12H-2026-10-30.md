# Autonomous 12H — 2026-10-30 (sesi kedua)

Misi user: kerja otonom 12 jam tanpa henti, TANPA meminta keputusan.
Kerjakan semua opsi yang direkomendasikan sendiri. Kerahkan agent, skill,
MCP (next-devtools + shadcn), agent-browser bila perlu.

Aturan tetap dari misi sebelumnya:
- Agen paralel hanya pada file tak tumpang-tindih; pekerjaan yang
  menabrak file sama dikerjakan sekuensial.
- Setiap bug fix = regression test (fails-before dibuktikan bila bisa).
- Setiap batch: verifikasi diff + test terdampak + typecheck + lint.
- Commit lokal per batch/domain di `main`. **DILARANG push** tanpa
  perintah eksplisit berikutnya.
- Update file antrean ini tiap batch + Log.
- Setiap migrasi Prisma = migrasi baru, tidak mengedit migrasi lama,
  tidak menjalankan `migrate deploy` ke DB dev (P3005).
- Jalankan pipeline dengan `TZ=Asia/Jakarta` (bug off-by-one-day WIB).
- Jangan menanam demo data ke DB dev yang dirawat tangan. E2E memakai
  bundle standalone; rebuild sebelum E2E bila schema berubah.
- Informasi sensitif/credential tidak diulang di checkpoint.

## Batch A — Unique Holiday selesai (in flight)

Kandidat: `Holiday.date` unique global; `DepartmentHoliday` unique
`[departmentId, date]`. Cek duplikat DB dev dulu (baca saja). Bila
bersih: schema + migrasi baru + admin action (create/update holiday &
dept holiday) pre-check + P2002 mapping; regression test; regression
guard `@@unique` schema; ci:quick penuh sesudah migrasi (rebuild
berdampak ke E2E/standalone). db:check-migrations hanya bila
MIGRATION_CHECK_URL tersedia — jangan karang kredensial.

## Batch B — Round 5 audit (paralel read-only, satu agen per file grup)

Round 5 cari temuan BARU (jangan duplikat round 2/3/4, jangan sekadar
mengulang daftar lama). Domain prioritas belum pernah digali dalam:
1. report builders/loaders: angka/evaluasi stale/NaN/pushdown salah/
   fallback diam-diam/ketidaksejajaran PDF-Excel.
2. inventory FIFO costing + COGS + reservasi + transfer/receive
   partial. Produksi BOM/WO consume/reverse. Purchase/sales siklus
   parsial DP/return/payment.
3. finance: jurnal/reversal/period lock/recurring/close period/
   petty cash chain/expense/reimbursement. HR payroll/loan/THR/BPJS/
   attendance correction. CRM/project/ticket/budget.
4. permission/data-scope/warehouse-scope multi-company?/soft-delete.
Agen laporkan temuan ke file antrean (atau file temuan terpisah) dengan
file:line + bukti + klasifikasi (CONFIRMED/PLAUSIBLE). Main session
verifikasi sendiri sebelum fix apa pun.

## Batch C — Triase + Fix terverifikasi dari B

Urut prioritas: CONFIRMED HIGH (keuangan, stok, uang, scope bocor,
data hilang) dulu. Fix per domain; agen hanya bila file tidak overlap
dengan pekerjaan main. Setiap fix regression test. Commit lokal per
domain. Jangan kerasukan: kandidat audit bukan vonis.

## Batch D — Audit runtime/browser/MCP

next-devtools: get_errors, get_compilation_issues, get_page_metadata,
compile_route; agent-browser sapu halaman yang belum pernah disapu —
halaman list utama, detail by-slug, form edit, laporan multi-periode.
Gunakan DB dev apa adanya; jangan seed demo data. Temuan runtime baru
masuk Batch C.

## Batch E — Audit perf sistematis tersisa

Kandidat perf round sebelumnya yang belum diambil + audit round ini.
Hanya ubah yang ekuivalensi terbukti (snapshot test identik bila
memungkinkan). Paralelkan hanya loader independen; pushdown hanya
bila filter lama terbukti ekuivalen. Sisanya catat sebagai ditunda
dengan alasan.

## Batch F — Verifikasi berat final

- npm run ci:quick penuh (TZ=Asia/Jakarta).
- E2E subset terdampak hanya bila DB memungkinkan tanpa seed demo data.
- db:check-migrations bila MIGRATION_CHECK_URL ada.
- Sapu bila perlu halaman runtime kunci sesudah build.
- Update checkpoint akhir di file ini; commit docs lokal.

## Urutan

A -> B (peluncuran agen read-only paralel saat A main) -> C -> D -> E ->
F -> (ulang B/C dengan domain round berikutnya bila masih ada jam).

## Log
- 2026-10-30: sesi 12 jam dimulai. HEAD fcec5fd32 (ci:quick LULUS
  penuh). Tree bersih. 92 commit lokal di atas origin/main, belum push.
- MCP next-devtools: dev server terdeteksi di port 3005.
- Mulai: Batch A (Holiday unique) di main session; 4 agen audit
  round 5 Batch B meluncur paralel (read-only).
- Batch A selesai: `ec4b07fb` Holiday unique (schema+migrasi+4 action).
  Runtime migrasi belum terverifikasi (tak ada MIGRATION_CHECK_URL).
- Batch B selesai: ROUND5-FINHR (8), ROUND5-REPORTS (3),
  ROUND5-SCOPE (4+2 PLAUSIBLE), ROUND5-STOCK (20) — semua file di
  docs/team-lead/, belum di-commit.
- Batch C progres (semua commit lokal, belum push):
  - FINHR: `83853436` (deleteJournal lock, rantai kas kecil void,
    lock RAB), `d4579f26` (convertLead recheck, plafon disiplin in-tx).
  - REPORTS: `87f87f7f2` (subledger utang completed, paritas arus kas
    PDF), `729f4d9cc` (stok minimum posisi kini).
  - STOCK: `2fead3f00` STOK-02, `cabb66f01` STOK-03, `b8e774436`
    STOK-01/04/11, `db50ca0ae` STOK-05/07/09/18, `441cda67f` test
    STOK-09/18, `a898a042` STOK-06, `1737bc84` STOK-12, `dc75b736`
    STOK-17, `a8331e85` STOK-10, `646136d4` STOK-08.
  - SCOPE: `05d57e48` setting per gudang, `771d5c7e` apresiasi
    individual-only, `df372956` 6 halaman daftar, `4cb84496` 5 laporan
    stok web+PDF. Temuan SCOPE CONFIRMED habis.
- Sisa antrean C: PLAUSIBLE FINHR 3 (payroll self-heal negatif, PKWT
  closing negatif, reimbursement account), SCOPE 2 (competency gaps,
  succession overview), STOK-13/14/15/16/19/20 (PLAUSIBLE), jalur
  opname tanpa lot (catatan STOK-12).
- Berikutnya: triase PLAUSIBLE -> Batch D runtime -> E perf -> F final.
- Batch C lanjutan (commit lokal, belum push):
  - FINHR PLAUSIBLE habis: `214c3d45f` (self-heal payroll fail-closed
    kaki negatif, PKWT closing negatif ditolak, akun klaim approve
    fail-closed EXPENSE aktif).
  - SCOPE: `9cf987d25` getCompetencyGaps scope HR. Succession overview
    DITUNDA by-design: menyaring incumbent/kandidat per scope mengubah
    angka coverage organisasi tanpa vonis kebijakan Lead.
  - STOK: `f84ac7aa5` STOK-13 (batal WO ditolak bila MI completed /
    order produksi anak aktif), `b16e63a17` STOK-15 (biaya jasa PO
    dibobotkan qty order, bukan bagi rata), `4d74ff236` STOK-19
    (cek+create penutupan selisih transfer atomik, lock baris),
    `f22bfaa45` STOK-20 (lock baris dokumen sebelum delete item pada
    update adjustment/transfer).
  - STOK-14 DITUNDA: biaya non-material sesudah release parsial masuk
    release berikutnya adalah perilaku akuntansi biaya aktual yang
    dapat dipertahankan; tidak ada spec alokasi ulang — mengubahnya
    butuh keputusan bisnis, bukan fix.
  - STOK-16 DITUNDA (keputusan user 2026-10-30): tautan
    goodsReceiptItemId eksplisit per baris retur beli butuh migrasi +
    payload/form + validasi + hook; antrean terpisah, jangan dikerjakan
    sebagai drive-by. Fallback receipt terbaru per item tetap berlaku
    untuk data legacy.
- Sisa antrean C: succession overview (vonis Lead), STOK-14 (keputusan
  bisnis), STOK-16 (antrean terpisah), jalur opname tanpa lot.
- Berikutnya: Batch D runtime -> E perf -> F final.
- Batch D (sebagian): MCP next-devtools port 3005 sehat,
  get_compilation_issues kosong, 11 route target Batch C semua 307 ke
  login (route terdaftar, auth guard benar). Sweep DOM terautentikasi
  BELUM terverifikasi: sesi browser sah tidak tersedia dan materialisasi
  cookie sesi ke file temp dilarang — tidak di-workaround.
- Batch F: ci:quick pertama GAGAL unit (6 file, 18 test). Bisect:
  customer-credit hijau di 2fead3f00~1, merah di 2fead3f00 (STOK-02).
  Akar gabungan: mock tx tulisan tangan kekurangan delegate baru —
  STOK-02 salesReturn/journal.findMany, STOK-07
  stockReservation.findMany, STOK-01 stockMove/inventoryLayer.findMany.
  Bukan bug produk. Fix kontrak mock `a6c6f5c3d` (delegate default kosong
  = perilaku lama fixture); 6 file 62/62 hijau; ci:quick ulang LULUS
  PENUH (lint, tsc, unit, build) di a6c6f5c3d.
- Batch F belum bisa: E2E subset (DB dev dirawat tangan; spec kunci
  butuh demo data — dilarang seed), db:check-migrations (tidak ada
  MIGRATION_CHECK_URL sah — jangan karang kredensial). Runtime migrasi
  Holiday + STOK-08 juga masih menunggu scratch DB sah.
- Triase opname-tanpa-lot: CONFIRMED (verifikasi main session).
  StocktakeLine tanpa kolom lot; surplus item trackBatch dari opname
  selalu gugur di hook penyesuaian SESUDAH sesi posted + draft ADJ
  lahir. Fix `81ba9fe84`: posting sesi ditolak dini di dalam tx (basis
  live) dengan pesan tertindak; sesi tetap approved. Lot penuh opname
  (kolom + form hitung + jalur cepat OpnameForm) = antrean terpisah.
  Komentar STOK-10 diluruskan `23448f58`.
- Batch E selesai `9581f7cb`: lead-funnel paralel, vehicle-margin memo
  sejajar blok plat (urutan panggilan dipertahankan), validasi akun
  kategori aset 7 findFirst -> 1 findMany, daftar pelanggan paralel +
  select 6 kolom, dasbor karyawan select sempit + cuti paralel.
  DITUNDA: buku-bank (page tanpa harness test).
- Verifikasi berat final: ci:quick ulang sesudah Batch E + opname
  LULUS PENUH di 9581f7cb5 (lint, tsc, unit, build). E2E/
  db:check-migrations tetap terblokir prasyarat sah (bukan kegagalan
  kode).
- SESI DITUTUP pada checkpoint ini. Sisa antrean eksplisit: STOK-16
  (keputusan user: antrean terpisah), STOK-14 (keputusan bisnis),
  succession overview (vonis Lead), lot penuh opname (kolom
  StocktakeLine + form hitung + jalur cepat), buku-bank perf (butuh
  harness test page), sweep DOM terautentikasi (butuh sesi browser
  sah), runtime migrasi Holiday/STOK-08 + E2E subset (butuh scratch
  DB / MIGRATION_CHECK_URL sah). Semua commit lokal di main, BELUM
  push.
