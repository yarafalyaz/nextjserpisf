# Autonomous Sesi 5 — 2026-10-31

Perintah user: kerja tanpa henti, TANPA tanya. Pilih sendiri opsi
recommended. DILARANG ubah config permissions/bypass. DILARANG push.
Satu-satunya pengecualian pertanyaan: gerbang consent tertulis dari
tool itu sendiri (Prisma db push) — sudah terjadi sesi ini, user
menjawab "Ya, terapkan ke DB dev".

Aturan tetap: verifikasi main session sebelum fix; bug fix =
regression test; diff + test terdampak + tsc + lint per batch; commit
lokal per domain di `main`; jangan `migrate deploy` ke DB dev;
`TZ=Asia/Jakarta`; jangan seed demo ke DB dev (scratch disposable
boleh); jangan materialisasi cookie/kredensial.

## Fokus sesi

1. Round 8 tuntas (sudah commit di sesi 4 lanjut): Pajak 12/12,
   Keuangan 10/10, Jual-Beli 10/10 (JB-09 dueDate snapshot penuh,
   JB-03/04 balanceDue + VendorCredit), SDM-01..06.
2. Task #7: E2E data-dependent hijau via scratch DB terseed.
3. Triase 9 kegagalan unit pasca-R8-JB-09.

## Log

- Task #7 SELESAI. Scratch DB disposable `vc-e2e-db` (sudah dihentikan
  + dihapus), seed baseline + `scripts/seed-remaining-e2e.ts`.
  Suite chromium penuh hijau berulang: 722–726 passed per run,
  8–9 skipped sah; sapuan konfirmasi 721 passed / 9 skipped,
  2 failed terisolasi-hijau → flake beban paralel (PW_WORKERS 4 di DB
  bersama), bukan bug.
- Dua bug produk ditemukan dari E2E dan sudah difix+commit:
  (a) `463eb1755` ActionDropdown delete tak memanggil
  `router.refresh()` (baris basi sesudah hapus);
  (b) `9ee663bd6` bupot select kolom `SalesPayment.deletedAt` yang tak
  ada → select `status` + filter `!== "reversed"`;
  (c) `71327e8a9` status faktur lunas→partial sesudah retur sebagian —
  `isSettled(grandTotal, paid + returnCredit)`;
  (d) `f230e0d9c` menu Hapus void finansial (uang muka, transfer
  bank, penyetoran pajak) selalu gagal dari UI: aksi server mewajibkan
  alasan, ActionDropdown tak pernah mengumpulkannya. Fix: prop
  `deleteReasonLabel` + guard klien + ReasonField; regression test
  sumber 3/3; bukti E2E baris ter-void (jurnal pembalikan lahir).
- Commit `9c8cc7504`: spec/seed E2E (chains URL path-based + gerbang
  approval VendorPayment via UI persetujuan + SoD retur konteks
  approver kedua; guard retry MariaDB 1020; pickMonth AppMonthPicker;
  locator hidrasi `.first()`/`:visible`; seed blok 11 child-aware).
  Typecheck bersih, lint 0 error, standalone dibangun ulang.

### Triase 9 kegagalan unit

Full suite pasca-E2E: 9 failed / 10889 passed. Rerun terisolasi 4 file
(39 test): 30 passed / 9 failed → NYATA, bukan flake. Vonis per file,
semua TEST BASI (bukan regresi produk):

- `update-invoice-negative-tax` (1): `updateSalesInvoice` kini membaca
  termin pelanggan `tx.customer.findUnique` untuk dueDate R8-JB-09
  (sales.actions.ts:3303); mock tx tak punya delegate `customer`.
- `update-vendor-bill-l3` (3, test jalur-sukses): create/update kini
  membaca termin vendor `tx.vendor.findUnique` (purchase.actions.ts:
  1688, 3366); mock tx `h.tx` tak punya `vendor` → tertangkap catch →
  `success=false`. Test jalur-tolak hijau karena gagal sebelum titik itu.
- `vendor-bill-from-goods-receipt` (4): akar sama (`vendor` hilang di
  txMock); kegagalan :196 "Number of calls: 0" karena create gagal di
  titik termin sebelum tautan GR ditulis.
- `idempotency` expense.hook (1): regex penjaga menandai throw
  `"Pengeluaran sudah diproses atau status tidak valid"` —
  itu guard status-terminal R8-KEU-04/05 sesudah
  `SELECT ... FOR UPDATE` (commit 516e0803b), BUKAN guard duplikat.
  Duplikat kas kecil sejatinya ditangani `return` pada cek
  `pettyCash.findFirst` (expense.hook.ts:82-90); tanpa delegate itu
  tidak ada baris duplikat yang bisa dibuat karena pettyCash.create
  terjadi di dalam tx yang sama. Kode produksi TIDAK diubah.

Fix hanya di test (commit `e8d56645`): mock
`vendor.findUnique → { paymentTerm: null }` (2 file),
`customer.findUnique → null` (1 file), regex idempotency mengabaikan
pesan status-terminal di expense.hook.ts dengan komentar alasan.
Sesudah fix: 4 file 39/39; full suite 1119 file — 10898 passed /
22 skipped / 0 failed; tsc clean; lint 0 error (2 warning lama
`e2e/mobile-overflow-guard.spec.ts`, bukan dari sesi ini).

## Sisa terbuka

- Task #8: rewrite 8 commit lama author tak terverifikasi + force-push
  ke `main` — DESTUKTIF, menunggu konfirmasi eksplisit spesifik user.
  Perintah generik autonomous bukan konfirmasi itu. `main` ahead 209+
  dari origin, belum push (tidak ada perintah).
- DB dev: 4 baris `bank_transfers` BTF-0005..BTF-0008 nominal 777888
  status `posted`, `deletedAt` null, sisa run sesi yang sempat salah
  target DB. SENGAJA tidak dihapus (DB dev dirawat tangan; tidak ada
  instruksi eksplisit; hapus = destruktif). Tercatat di sini.
- Migrasi R8-JB-09 (`customer_payment_term`): diterapkan ke DB dev via
  SQL manual sesudah gerbang consent user; drift 0 terbukti lewat
  scratch. Jangan `prisma migrate deploy` ke DB dev (P3005 bersih).

## Bukti penutup

- Unit: 10920 test — 10898 passed, 22 skipped, 0 failed.
- tsc: clean. Lint: 0 error.
- E2E chromium scratch terseed: hijau berulang (722–726 passed).
- Commit sesi: `f230e0d9c`, `9c8cc7504`, `e8d56645`. Tree bersih.
