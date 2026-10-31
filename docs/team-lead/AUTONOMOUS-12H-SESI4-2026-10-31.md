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
