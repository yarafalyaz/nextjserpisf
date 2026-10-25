# Antrean Merge

Merge queue bawaan GitHub tidak tersedia untuk repo ini (opsi "Require merge
queue" tidak tampil di UI branch protection maupun ruleset; pembuatan rule
lewat REST API ditolak 422 dan skema GraphQL tidak memiliki field-nya —
diverifikasi 25 Oktober 2026). Sebagai penggantinya repo memakai antrean
lokal `scripts/antrean-merge.sh` yang dijalankan Lead dengan login `gh`
pemilik. Workflow `.github/workflows/antrean-merge.yml` adalah versi
Actions-nya; ia hanya bekerja bila secret `ANTREAN_MERGE_TOKEN` (PAT
pemilik) dipasang, karena update-branch oleh token bawaan Actions tidak
memicu CI `pull_request` dan check hasil `workflow_dispatch` tidak masuk
rollup PR — keduanya terbukti membuat syarat protection tidak pernah
terpenuhi. Tanpa secret, workflow itu selesai wajar tanpa memproses apa pun.

## Cara pakai

1. Pastikan PR siap: tidak draft, tidak konflik.
2. Beri label **`antrean-merge`** — hanya sesudah verdict manusia/QA
   tercatat di PR. Label ini adalah izin merge de-facto: siapa pun yang
   bisa memasang label (izin triage/write) bisa memicu merge.
3. Selesai — Lead menjalankan `scripts/antrean-merge.sh` (atau panggil
   dengan nomor PR: `scripts/antrean-merge.sh 780`). Jangan merge manual
   selama PR berlabel.

## Yang dilakukan antrean

PR berlabel diproses satu per satu menurut urutan pembuatan (FIFO):

1. `update-branch` **sebagai pemilik** menyamakan branch PR dengan `main`
   terbaru — karena aktornya pemilik, event `pull_request` terbit dan CI
   berjalan pada head termutakhir (syarat *strict* branch protection).
2. Antrean menunggu gerbang hijau di head yang terikat sesudah update:
   4 check wajib protection (Lint, Unit Tests, Build Next.js, DB
   Integration Tests) masing-masing lulus — atau ter-skip hanya bila diff
   PR terbukti docs-only (semua berkas `.md` dari merge-base) — ditambah
   SonarCloud lulus, dan Docker Image Build lulus bila diff menyentuh
   jalur Docker yang sama dengan gating Detect Changes di `ci.yml`
   (batas tunggu 40 menit per PR). Penilaian per nama check; head yang
   bergerak di tengah penantian membatalkan putaran itu.
3. Antrean memverifikasi ulang head sama dengan SHA yang lolos, lalu
   squash merge + hapus branch dengan `--admin --match-head-commit` —
   pola merge Lead selama ini: penulis PR dan pemilik adalah akun yang
   sama, jadi syarat 1 approval memang hanya bisa dipenuhi lewat bypass
   admin, dan itu hanya dilakukan sesudah check pada head termutakhir
   hijau. `--match-head-commit` mengunci SHA yang benar-benar dicek.
4. Lanjut ke PR berikutnya.

Bila check gagal/timeout atau merge ditolak protection, label dicabut dan
antrean meninggalkan komentar berisi alasannya. Perbaiki, lalu beri label lagi
untuk masuk antrean ulang.

## Pemicu

- Lead menjalankan `scripts/antrean-merge.sh` (tanpa argumen = semua PR
  berlabel; dengan argumen = nomor PR tertentu).
- Versi Actions (bila `ANTREAN_MERGE_TOKEN` kelak dipasang): label
  `antrean-merge` ditambahkan, dispatch manual, atau cron 15 menit sebagai
  penyapu. Grup concurrency `antrean-merge-main` menjamin satu proses
  antrean Actions pada satu waktu.

## Batasan

- Merge sesudah check hijau tetap memakai bypass admin (syarat approval
  tidak bisa dipenuhi akun yang sama). Antrean menjamin urutan dan
  kehijauan check pada head termutakhir, bukan menambah peninjau manusia.
- Bila `main` bergerak lagi di tengah penantian check, PR di-update ulang
  pada putaran antrean berikutnya; jangan merge manual di tengah antrean.
- Merge darurat tetap bisa lewat jalur admin seperti biasa; antrean ini
  bukan satu-satunya pintu.
