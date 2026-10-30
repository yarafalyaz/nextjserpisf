# ROUND 7 — Audit Cetak & Ekspor

Tanggal: 2026-10-31. Audit read-only (agent cetak/ekspor Round 7); fix dieksekusi main
session satu per satu dengan regression test, diff terkecil, tsc+lint bersih, commit lokal
per domain. Semua entri SELESAI. Hash merujuk commit lokal di `main` (belum push).

---

## R7PR-01 — HIGH · CONFIRMED — SELESAI `454548094`

- Bukti: `saveDownPaymentProof` (`src/actions/sales.actions.ts`) menulis bukti bayar ke
  `public/uploads/proofs/proof-dp-<Date.now()>.<ext>`; proxy mem-bypass auth untuk
  ekstensi gambar, jadi timestamp milidetik di sekitar waktu transaksi bisa ditebak →
  bukti transfer (nama pengirim, norek, nominal) terunduh tanpa sesi. Varian `.pdf`
  tidak kena bypass. Jalur privat yang aman untuk tipe sama (`down_payment` di
  attachment maps) sudah ada, tapi form DP mengirim berkas langsung ke server action,
  bukan lewat jalur lampiran.
- Fix (tanpa migrasi skema): berkas pindah ke `private/uploads/proofs/` dengan nama
  UUID; nilai `proofImage` kini nama berkas privat (bukan URL). Route baru
  `/api/down-payment-proof/[id]`: sesi aktif + `view_down_payments`, nama dibaca dari
  DB, whitelist bentuk nama fail-closed, header nosniff/CSP sandbox/`private`.
  Halaman detail DP me-rewrite nilai privat ke route itu saat render.
- CATATAN DEPLOY: berkas publik lama di `public/uploads/proofs/` tidak tercabut oleh
  perubahan kode; nilai warisan tetap dirender apa adanya sampai berkas lama
  dimigrasikan/dihapus saat deploy.

## R7PR-02 — MEDIUM · CONFIRMED — SELESAI `563f9ecbb`

- Bukti: `drawNonFinalWatermark` hanya dipanggil sekali di awal dokumen — halaman 2+
  dokumen draft/pending tampil bersih; `generateWorkOrderPDF` tidak memanggilnya sama
  sekali (hanya badge status 10pt), padahal route cetak sudah mengirim `status`.
- Fix: loop footer yang sudah ada menggambar ulang watermark di setiap halaman
  (`buildTransactionPdf`); `generateWorkOrderPDF` memanggil helper yang sama.
- Keputusan: status `approved` SENGAJA tidak masuk `NON_FINAL_STATUSES` — approved
  adalah status final yang boleh diposting (post diizinkan dari draft ATAU approved);
  men-cap-nya akan salah label dokumen sah.

## R7PR-03 — MEDIUM · CONFIRMED — SELESAI `2d0aeb7d1`

- Bukti: gerbang payroll rekap-borongan tak konsisten — halaman + nav cukup
  `view_reports`, PDF menuntut `view_payroll_reports` (warisan R6PA-03); nama teknisi +
  total upah tampil penuh di layar untuk pemegang izin laporan generik. Efek fungsional:
  tombol CSV mati — `LaborRecapCard` tanpa `data-report-table`, scrape DOM
  `export-buttons.tsx` tak menemukan tabel. Tiga laporan payroll lain konsisten via
  `loadPayrollPageContext`.
- Fix: halaman + entri navigasi memakai `view_payroll_reports`; ketiga tabel kartu
  (utama, Tanpa Teknisi, Tanggal Kerja Belum Terbukti) diberi `data-report-table`.
- CATATAN DEPLOY: user yang hanya memegang `view_reports` kehilangan akses
  menu/halaman ini — memang maksud fix.

## R7PR-04 — LOW · CONFIRMED — SELESAI `b11595a4d`

Duplikat R7API-01 dari sisi cetak/ekspor — lihat `ROUND7-PORTAL-API.md` §R7API-01.

## R7PR-05 — LOW · PLAUSIBLE — SELESAI `d32e497a8`

- Bukti: guard formula CSV ekspor log aktivitas memakai `/^[=+\-@\t\r]/` tanpa `|` dan
  `%` yang ada di pola baku repo (`quotation-followup-export`: `/^[=+\-@\t|%]/`).
- Fix: pola diselaraskan ke baku repo (awalan `'`); `\r` ter-subsumsi kutip.
  Penanda terpotong + gerbang `manage_settings` di route itu sudah benar (R6IE-06).

## Bersih (jangan audit ulang)

Print route selain R7PR-02 (15 tipe blocked-status R6IE-05 + `deletedAt` eksplisit;
9 tipe lain memang tanpa kolom `deletedAt` di schema), pdf route (payroll fail-closed
R6PA-03, 10 key stok + warehouse scope), attachments serve/upload (DB-lookup,
anti-traversal, gerbang induk), backup download (allowlist + audit), serializer CSV
server, ekspor DOM berguard, `pph21-export.ts` laten tanpa caller.
