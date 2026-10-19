# Hermes Review Fix Report — `hermes/ironsmith-audit`

**Reviewed commit:** `706a580f` · **Branch HEAD saat laporan:** `aea6241c`
**Base:** `main` · **DB produksi:** tidak disentuh (semua bukti dari DB disposable/E2E).

## P0-1 Alokasi DP ke invoice — FIXED (`aea6241c`)

Review CONFIRMED: invoice lahir hanya mencatat SalesPayment DP pemicu;
verified DP sebelumnya (di bawah ambang) hilang dari paidAmount.
Perbaikan: loop alokasi SEMUA verified DP belum teralokasi (marker notes
per nomor DP, idempoten via contains); paidAmount = total teralokasi;
paymentDate = tanggal tiap DP; kelebihan > grandTotal → notes kredit
pelanggan. Tes `down-payment-review` 4/4 (terfalsifikasi: cabut guard →
1 MERAH → pulihkan HIJAU).

## P0-2 Posting invoice via konfirmasi DP — FIXED (`aea6241c`)

Review CONFIRMED: existingInv menulis status lifecycle + retry memanggil
onSalesInvoicePosted tanpa gate. Perbaikan: confirmation hanya sentuh
paidAmount+paymentStatus; retry = return murni; impor hook dibuang.
Pemanggil tersisa (postInvoice, edit-posted, quotation-sync) semua bergate.
Invoice konversi tetap draft → posting manual.

## P0-3 Kredensial migrasi Compose — FIXED (`aea6241c` + `9a7a904f`)

Review menduga password tak masuk URL migrate — TIDAK TERBUKTI: URL
interpolasi DB_USER/DB_PASSWORD/DB_NAME utuh (single source .env).
Ditambah: `docs/RILIS-PRODUKSI.md` (pola + URL-encode + urutan rilis),
audit kolom pra-migrate (`9a7a904f`). Bukti: migrate deploy sukses di DB
disposable via env path produksi; kredensial salah → P1000 jelas.

## Disposisi DROP kolom — MITIGATED, bukan FIXED

Nol rujukan kode ≠ bukti DB prod kosong. `pre-migrate-column-audit.sh`
baca-only jalan sebelum migrate (gagal = rilis gagal); lulus di E2E +
falsifikasi ZZProbe → GAGAL. Disposisi per kolom + backup/restore prod
BUTUH Yara — tanpa itu status tetap MITIGATED.

## Rekomendasi merge: NOT READY

Alasan: disposisi DROP + backup/restore + UAT + angka payroll 2026 butuh
pemilik. Kode + tes siap review; jangan merge sebelum itu.
