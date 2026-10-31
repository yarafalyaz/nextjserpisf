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
