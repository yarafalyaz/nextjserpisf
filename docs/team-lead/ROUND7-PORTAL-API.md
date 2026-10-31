# ROUND 7 — Audit Portal/Publik + API Non-Cron

Tanggal: 2026-10-31. Audit read-only (tiga agent paralel); fix dieksekusi main session
satu per satu dengan regression test, diff terkecil, tsc+lint bersih, commit lokal per domain.
Semua entri di bawah SELESAI kecuali dinyatakan lain. Hash merujuk commit lokal di `main` (belum push).

---

## R7PB-01 — MEDIUM · CONFIRMED — SELESAI `75fdd5e6`

- Bukti: driver lokal `uploadToStorage` menulis semua kategori ke `public/uploads/`
  (`src/lib/storage/storage.ts`); proxy mem-bypass auth untuk ekstensi gambar, jadi URL
  avatar pengguna & scan tanda tangan jabatan yang bocor bisa diunduh anonim permanen.
  27 berkas unggahan ter-commit ke git.
- Fix: kategori `avatars`+`signatures` kini privat — selalu lokal (tidak pernah R2/CDN
  publik), ditulis ke `private/uploads/`, URL kembalian `/api/uploads/<category>/<filename>`.
  Route baru: sesi aktif wajib; `signatures` tambahan wajib `manage_settings`; nama berkas
  whitelist fail-closed. `items`/`logos` tetap publik (aset katalog/cetak, dimaksudkan publik).
  14 berkas avatar ter-track dikeluarkan dari index (`git rm --cached`), disalin lokal ke
  `private/uploads/avatars/`; `/public/uploads/` + `/private/uploads/` masuk `.gitignore`.
- CATATAN DEPLOY: berkas avatar lama di disk produksi tetap di `public/uploads/avatars/`
  dan URL lama yang sudah bocor TIDAK tercabut oleh perubahan kode — pindahkan/rotasi
  berkas fisik saat deploy. Nilai `User.avatar` warisan `/uploads/avatars/...` tetap
  dirender apa adanya sampai dimigrasikan.

## R7PB-02 — MEDIUM · PLAUSIBLE→CONFIRMED — SELESAI `eab92aa6e`

- Bukti: tiga route presence-only (`notifications`, `notifications/[id]/read`,
  `upload/avatar`) menerima JWT basi sesudah user dinonaktifkan/ganti password —
  proxy hanya men-decode JWT, callback `isActive` tidak berjalan untuk handler sendiri.
- Fix: ketiga handler menolak `session.user.isActive === false` dengan 401.

## R7PB-03 — LOW · CONFIRMED — SELESAI `4bff76802`

- Bukti: `/api/cron/*`, `/api/health`, `/api/address` lolos total dari rate-limit proxy.
  Cron tetap fail-closed secret timing-safe; celah murni DoS-protection.
- Fix: ketiga branch allowlist menjalankan limit generik bila `mayBlockOnIp`
  (pola anti-DoS bucket-bersama yang sudah ada), tanpa IP tepercaya tidak memblokir.

## R7PB-04 — LOW · CONFIRMED — SELESAI `f7995c67d`

- Bukti: `CRON_SECRET`/`CRON_CREDENTIAL` tanpa validasi kekuatan; string placeholder
  dari `.env.example` diterima harfiah, pemegang string contoh publik bisa memicu
  `POST /api/cron?task=cleanup`/`lock-period`.
- Fix: kedua nama kini `.min(32)` + tolak placeholder di `src/lib/env.ts` (satu gerbang
  konfigurasi), pola sama `AUTH_SECRET`.

## R7PB-05 — LOW · PLAUSIBLE — SELESAI `9fbf91389`

- Bukti: `getSetupStatus` publik memaparkan `tableCount` pra-instalasi.
- Fix: tipe publik `PublicSetupChecks = Omit<SetupChecks, "tableCount">`, strip sebelum
  keluar; form men-strip hasil provision sebelum simpan state.
- Sisa DITUTUP 2026-10-31: `provisionSetupSchema()` kini juga mengembalikan
  `PublicSetupChecks` lewat helper `toPublicChecks` yang sama (form tidak lagi
  men-strip sendiri). `getSetupChecks` internal tetap menghitung `tableCount`
  untuk pemakaian internal.

## R7PB-06 — LOW · CONFIRMED — SELESAI `cbc32d49a`

- Bukti: `/api/health` memaparkan `redisConfigured`/`degradedDecisions` ke anonim —
  sinyal waktu serangan brute-force multi-replika.
- Fix: respons publik hanya `{status, timestamp, uptime}`.

## Bersih (jangan audit ulang)

Proxy matcher/auth halaman, open redirect (`safeInternalPath`), enumerasi user
(dummy-bcrypt, pesan generik, limit per-email), session fixation, logout CSRF
cookie-clear, webhook (tidak ada), halaman publik legal/metadata, server action
publik (hanya setup ter-gate), upload publik semu (magic-byte, ekstensi dari MIME),
`_next/image` remotePatterns terbatas.

---

## R7API-01 — MEDIUM · CONFIRMED — SELESAI `b11595a4d` (= R7PR-04)

- Bukti: `tax_assessment`/`tax_dispute_step` ada di whitelist route + peta izin + UI
  sengketa pajak, tapi `ATTACHMENT_MODEL` tak memetakannya ke delegate
  `taxAssessment`/`taxDisputeStep` → `canAccessAttachmentWithPermission` balik false
  di `!modelKey`; semua operasi lampiran 403 termasuk super_admin. Kebalikannya,
  `EmployeeDisciplinaryRecord` ada di model+peta izin tapi hilang dari whitelist route.
- Fix: dua pemetaan delegate; `ATTACHMENT_PARENT` generik (`tax_dispute_step` →
  `taxAssessment` via `assessmentId`) karena langkah tak punya `deletedAt` — ketetapan
  induk terhapus menutup lampiran langkahnya (mode R6PA-02); whitelist route ditambah
  `EmployeeDisciplinaryRecord`.

## R7API-02 — MEDIUM · CONFIRMED — SELESAI `182cadb05`

- Bukti: `vendor-payment-form` selalu POST temp `referenceType=vendor_payment`,
  `referenceId=0`; jalur temp wajib `ATTACHMENT_CREATE_PERMISSION` dan peta itu tidak
  memuat `vendor_payment` → unggah bukti dari form buat selalu 403, walau
  `createVendorPayment` sudah mendukung `attachmentIds` + klaim lampiran.
- Fix: `vendor_payment -> create_vendor_payments` di `ATTACHMENT_CREATE_PERMISSION`
  (sudah ter-seed; permission-seed-parity hijau).

## R7API-03 — MEDIUM · CONFIRMED — SELESAI `ea6ac0676`

- Bukti: cabang `rejected` tombol status workflow mereset dokumen ke draft + membuat
  approval baru dengan `requestedBy = aktor`, lalu langsung `approveStep`/`rejectStep` —
  maker-checker menolak aktor memproses pengajuannya sendiri (409), tapi reset +
  approval pending sudah commit. Bukan duplikat R6WN-04 (di sana approval baru tidak lahir).
- Fix: pencetus dihitung sekali (`requestedBy` approval lama → pembuat dokumen →
  aktor fallback), reopen memakai pencetus itu, dan route membalas
  `{success, status: "pending", reopened: true}` TANPA memproses langkah dalam
  request yang sama.

## R7API-04 — LOW · PLAUSIBLE — SELESAI `ea6ac0676`

- Bukti: catch langkah mengirim `stepError.message` mentah sebagai 409;
  `approveStep` melempar ulang error non-domain → fault Prisma/server bocor
  dengan status salah kelas.
- Fix: error bercode string / non-Error → 500 generik + log server; error domain
  polos tetap 409 apa adanya. `ponytail:` heuristik code diganti bila
  approval.actions mengadopsi kelas error domain sendiri.

## R7API-05 — LOW · CONFIRMED — SELESAI `d32e497a8`

- Bukti: `GET /api/address?tipe=villages&kodeInduk=99` → ENOENT berkas desa →
  catch umum 500. Traversal tetap tertahan regex digit.
- Fix: ENOENT di cabang villages → 404; fault FS lain tetap 500.

## Bersih (jangan audit ulang)

activity-logs(+export), backup/download, notifications(+read, dashboard/notifications),
payroll/late-penalty, pdf, print (sisa `findUnique` tanpa `deletedAt` pada model memang
tanpa kolom itu), upload/avatar/items, workflow manual selain R7API-03/04,
vehicle-brands/models, system-settings, health, auth handler; mass-assignment tidak
ditemukan; kandidat pagination `page` raksasa tidak dinaikkan (skip DB belum terbukti).
