# Antrean Merge

Merge queue bawaan GitHub tidak tersedia untuk repo ini (opsi "Require merge
queue" tidak tampil di UI branch protection maupun ruleset; pembuatan rule
lewat REST API ditolak 422 dan skema GraphQL tidak memiliki field-nya —
diverifikasi 25 Oktober 2026). Sebagai penggantinya repo memakai workflow
`.github/workflows/antrean-merge.yml`.

## Cara pakai

1. Pastikan PR siap: tidak draft, tidak konflik.
2. Beri label **`antrean-merge`**.
3. Selesai — antrean yang bekerja. Jangan merge manual.

## Yang dilakukan antrean

PR berlabel diproses satu per satu menurut urutan pembuatan (FIFO):

1. `update-branch` menyamakan branch PR dengan `main` terbaru.
2. Bila head berubah, CI dipicu ulang manual pada branch itu (push oleh token
   GitHub Actions tidak memicu workflow, jadi antrean memicunya lewat
   `workflow_dispatch`).
3. Antrean menunggu 4 check wajib hijau: Lint, Unit Tests, Build Next.js,
   DB Integration Tests (batas tunggu 40 menit per PR).
4. `github-actions[bot]` memberi approve — sah karena aktornya berbeda dari
   penulis PR, dan approve diberikan sesudah update terakhir sehingga tidak
   gugur oleh aturan dismiss-stale.
5. Squash merge + hapus branch, lalu lanjut ke PR berikutnya.

Bila check gagal/timeout atau merge ditolak protection, label dicabut dan
antrean meninggalkan komentar berisi alasannya. Perbaiki, lalu beri label lagi
untuk masuk antrean ulang.

## Pemicu

- Label `antrean-merge` ditambahkan (langsung jalan).
- Dispatch manual dari tab Actions.
- Cron tiap 15 menit sebagai penyapu, karena trigger label bisa tertelan
  batas concurrency Actions (1 berjalan + 1 menunggu).

Satu grup concurrency `antrean-merge-main` menjamin tidak ada dua proses
antrean berjalan bersamaan, dan yang berjalan tidak pernah dibatalkan.

## Batasan

- Hanya berlaku untuk branch yang dibuat dari `main` sesudah workflow ini
  merged (branch lama tidak punya trigger `workflow_dispatch` di CI-nya,
  jadi pemicuan ulang CI bisa gagal dan PR ke-timeout).
- Antrean memproses maksimal ±170 menit per run; sisanya diteruskan run
  berikutnya (cron/dispatch).
- Merge darurat tetap bisa lewat jalur admin seperti biasa; antrean ini
  bukan satu-satunya pintu.
