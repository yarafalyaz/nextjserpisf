# Rencana Kerja Kesiapan Produksi YaraERP

**Dibuat:** 10 November 2026
**Titik awal:** commit `9230a60c6` (`main`, sudah di-push)
**Estimasi saat ini:** kode ~75–80%, keseluruhan (termasuk operasional & bisnis) ~65–70%. Angka ini **perkiraan**, bukan hasil ukur. Ukur ulang setelah tiap fase.

> [!WARNING]
> 17 commit terakhir (`a154a1c11..9230a60c6`) masuk `main` dengan **melewati branch protection** ("Changes must be made through a pull request", "4 of 4 required status checks are expected"). Kerjakan **Fase 0** dulu sebelum yang lain.

---

## Fase 0 — Pulihkan baseline terverifikasi (wajib duluan)

- [ ] **0.1** Cek status CI GitHub Actions untuk commit `9230a60c6` (`.github/workflows/ci.yml`). Kalau merah, perbaiki sebelum lanjut.
- [ ] **0.2** Jalankan pipeline lokal penuh:
  ```sh
  TZ=Asia/Jakarta npm run ci   # lint → tsc → vitest → build → E2E; log di .ci-logs/
  ```
- [ ] **0.3** Revisi `docs/AUDIT-BUG-SISTEM-2026-11-10.md` — klaim yang **salah/berlebihan**:
  - "Validasi payload penjualan terverifikasi aman" → yang benar: hanya tanggal yang divalidasi Zod; `safeJsonParse(raw) as any` masih ada (`src/actions/sales.actions.ts:318`, `:836`).
  - Kembalikan temuan `as any` yang hilang: `approval.actions.ts`, `bulk.actions.ts`, `api/workflow/[...path]/route.ts` (status: **belum diperbaiki**).
  - Fallback cron: tulis apa adanya (hanya ganti 3000→3001, port produksi belum diverifikasi).
- [ ] **0.4** Revisi `docs/AUDIT-BUG-FRONTEND-2026-11-10.md`:
  - Hapus klaim "semua `useEffect` punya dependency lengkap & cleanup" (tidak diperiksa).
  - Hapus klaim "dependencies lengkap" (tidak diperiksa).
  - Catat bahwa `get_errors` Next.js MCP **timeout** (tidak ada browser tersambung) dan `browser_eval` tidak dipakai.
  - Tambahkan temuan: `as any` di `quotation-form.tsx:580`, `purchase-order-form.tsx:181`, `item-form.tsx:492,502`; index sebagai `key` di `report-table-view.tsx`, `statement-table-view.tsx`, `breadcrumbs.tsx`.
- [ ] **0.5** Mulai sekarang: kerja di branch + PR agar 4 status check jalan sebelum merge.

**Selesai bila:** CI hijau di GitHub, kedua dokumen audit jujur, `npm run ci` lokal lulus.

---

## Fase 1 — Logika bisnis inti (~85% → 95%)

- [ ] **1.1** Jalankan suite DB-integration dengan DB scratch (bukan DB dev yang dirawat manual):
  ```sh
  RUN_DB_INTEGRATION=1 TZ=Asia/Jakarta npx vitest run
  ```
- [ ] **1.2** Rekonsiliasi end-to-end satu siklus penuh per modul di DB scratch hasil seed:
  - Penjualan: penawaran → DP → SO → DO → faktur → pembayaran → retur.
  - Pembelian: PR → PO → GR → vendor bill → pembayaran → retur.
  - Inventaris: transfer, penyesuaian, stock opname → cocokkan valuasi FIFO vs jurnal persediaan.
  - Keuangan: neraca saldo seimbang, laba rugi = selisih neraca, tutup periode.
- [ ] **1.3** Uji tutup buku bulanan: `assertPeriodOpen()` menolak dokumen bertanggal di periode terkunci untuk **semua** jenis dokumen bertanggal.
- [ ] **1.4** Uji konkurensi (dua user mengedit/memposting dokumen yang sama) pada jalur yang memakai `FOR UPDATE`.

**Selesai bila:** semua siklus di atas menghasilkan jurnal & saldo yang cocok dengan hitungan manual, terdokumentasi sebagai skenario UAT.

---

## Fase 2 — Keamanan & otorisasi (~80% → 95%)

- [ ] **2.1** Ganti delegasi Prisma dinamis `as any` dengan helper bertipe + allowlist model:
  - `src/actions/approval.actions.ts:365, 381, 601, 699, 752`
  - `src/actions/bulk.actions.ts:142`
  - `src/app/api/workflow/[...path]/route.ts:142, 168, 196, 218, 223, 248, 383`
  - Tambah tes: nama model di luar allowlist ditolak.
- [ ] **2.2** Audit setiap server action baru sejak audit keamanan terakhir: wajib `requirePermission()`; dokumen bertanggal wajib `assertPeriodOpen()`. Pastikan `src/__tests__/permission-seed-parity.test.ts` hijau.
- [ ] **2.3** Uji IDOR: user dengan scope cabang/karyawan terbatas tidak bisa membaca/mengubah dokumen di luar scope lewat URL slug langsung atau API.
- [ ] **2.4** Verifikasi konfigurasi produksi:
  - `AUTH_SECRET` & `CRON_SECRET` ≥32 karakter, bukan placeholder (`src/lib/env.ts`).
  - `TRUSTED_PROXY=1` **hanya** bila semua trafik lewat proxy yang menimpa header IP.
  - CSP & header keamanan di `src/proxy.ts` aktif di build standalone.
- [ ] **2.5** `npm audit --omit=dev` — tangani kerentanan high/critical.

**Selesai bila:** nol `as any` pada jalur otorisasi/approval, tes IDOR lulus, checklist env produksi tercentang.

---

## Fase 3 — Type safety & validasi input (~70% → 90%)

- [x] **3.1** Buat skema Zod penuh untuk payload penawaran di `src/lib/validations/sales.schemas.ts` (`quotationPayloadSchema`, `quotationItemPayloadSchema`, `quotationSectionPayloadSchema`), lalu pakai di `createQuotation` / `updateQuotation` menggantikan `safeJsonParse(raw) as any`. Teruji di `sales-quotation.actions.test.ts` dan `sales.actions.test.ts` (268/268 passed).
- [x] **3.2** Ketik ulang `computeQuotationTotals` dan `computeQuotationLine` di `src/lib/sales/quotation-totals.ts` dengan tipe antarmuka murni (`QuotationTotalsInput`, `QuotationLineInput`).
- [ ] **3.3** Tinjau semua `safeJsonParse<T>` yang hanya meng-cast generic tanpa validasi runtime (`inventory.actions.ts`, `purchase.actions.ts`, `finance.actions.ts`, `material-request.actions.ts`, `master.actions.ts`, `lib/finance/vendor-bill.ts`). Prioritaskan yang menulis ke DB.
- [x] **3.4** Hapus `as any` di form frontend:
  - `src/components/forms/quotation-form.tsx:580` (tipe form generik `useForm<QuotationFormValues, unknown, QuotationInput>`)
  - `src/components/forms/purchase-order-form.tsx:181` (`order?.serviceFee ?? 0`)
  - `src/components/forms/item-form.tsx:492, 502` (`defaultRackId: undefined`)
- [x] **3.5** Fallback URL cron (`src/actions/cron.actions.ts:31`): lempar error konfigurasi bila `NEXTAUTH_URL`/`AUTH_URL` kosong di mode produksi.

**Selesai bila:** semua payload JSON yang menulis ke DB divalidasi skema runtime, nol `as any` di kode produksi non-test (atau sisa ada daftar alasan).

---

## Fase 4 — Frontend/UX (~75% → 90%)

- [ ] **4.1** Jalankan E2E penuh di build standalone (lihat AGENTS.md — build ulang setelah perubahan schema):
  ```sh
  npm run build && npx playwright test --project=chromium --project=mobile-chrome
  ```
- [ ] **4.2** Uji browser nyata dengan Next.js MCP: buka aplikasi di browser, lalu panggil `get_errors` (harus tidak timeout) untuk halaman utama tiap modul; catat runtime error / hydration mismatch.
- [ ] **4.3** Periksa manual 49 `useEffect` di `src/components/` — dependency array & cleanup (listener, timer, fetch abort).
- [ ] **4.4** Ganti `key={index}` pada daftar yang bisa diurutkan/difilter/diedit dengan id stabil (`report-table-view.tsx`, `statement-table-view.tsx`, `breadcrumbs.tsx`, `charts.tsx`).
- [ ] **4.5** Uji alur kritis di ponsel nyata: buat penawaran, terima barang, input timesheet, approval.
- [ ] **4.6** Ukur performa halaman berat (daftar besar, laporan): LCP/INP di build produksi; tambahkan paginasi/streaming bila lambat.

**Selesai bila:** E2E 41 spec hijau di desktop + mobile, nol error runtime di browser untuk halaman utama tiap modul.

---

## Fase 5 — Keputusan bisnis terbuka (~60% → 100%)

Butuh **Product Owner / Accountant**, bukan hanya developer. Setiap keputusan → ADR + update `BUSINESS-RULES.md`, `INDEKS-ATURAN.md`, `KEPUTUSAN-TERVERIFIKASI.md`.

- [ ] **5.1 SAL-BR-013 — Retur jasa/non-stok (prioritas tertinggi: merusak akurasi stok)**
  - Masalah: retur jasa/non-stok tetap membuat `StockMove IN` + `qty_on_hand` naik (`src/lib/hooks/sales-return.hook.ts:151,169`); kombinasi `isService+isProduct` belum ditolak server (`src/actions/master.actions.ts:575`).
  - Keputusan yang dibutuhkan: retur non-produk hanya menghasilkan jurnal (tanpa mutasi stok)? Akun/PPN/PPh jasa (vonis Accountant F-2026-10-28-137-V).
  - Implementasi: lewati baris non-`isProduct` di hook retur, tolak `isService && isProduct` di server, regression test + skrip cek data lama yang terlanjur salah.
- [ ] **5.2 ADR-003 — Reversal DP pasca-konversi**
  - Masalah: tidak ada jalur reversal/pembatalan DP setelah DP dikonversi ke faktur (`src/lib/hooks/down-payment.hook.ts`).
  - Keputusan yang dibutuhkan: bila faktur pelunasan di-void, DP kembali jadi kewajiban 210102, jadi kredit pelanggan, atau di-refund? Siapa yang boleh, dan apakah butuh approval?
  - Implementasi sesuai keputusan + jurnal balik + tes.
- [ ] **5.3 PROJ-BR-008 — Standar tarif tenaga kerja**
  - Masalah: `rate` diisi manual per baris `ProductionCost`; tidak ada master tarif per peran/jabatan. Sisa lain: pengakuan pendapatan PSAK 72 untuk laporan eksternal.
  - Keputusan yang dibutuhkan: perlu master tarif? Tarif boleh di-override per job? Apakah PSAK 72 masuk scope go-live?

**Selesai bila:** ketiga ADR berstatus Accepted dan diimplementasi (atau secara eksplisit dinyatakan di luar scope go-live).

---

## Fase 6 — Operasional produksi (~55% → 90%)

- [x] **6.1 Baseline migrasi produksi**
  - Dev memakai `db push`, jadi `prisma migrate deploy` ke DB yang sudah ada akan gagal `P3005`. Ikuti prosedur baseline di `docs/AUDIT-REPORT.md` (`prisma migrate resolve --applied <migration>`).
  - Verifikasi rantai migrasi: `npm run db:check-migrations` dijalankan via user root (drift migrasi vs schema.prisma: 0 — rantai sehat ✓).
  - Gladi resik: restore salinan DB produksi ke staging, jalankan `migrate deploy`.
- [ ] **6.2 Backup & restore**
  - Jadwalkan `scripts/backup-db.sh` (harian + retensi), simpan di luar server (R2/S3).
  - **Uji restore** ke DB kosong dan pastikan aplikasi jalan. Catat waktu restore (RTO) dan jarak data hilang maksimum (RPO).
  - Backup juga file upload/lampiran (`STORAGE_DRIVER`).
- [ ] **6.3 Monitoring & alerting**
  - Pantau `/api/health` dengan uptime monitor eksternal.
  - Pasang error tracking (mis. Sentry) — saat ini belum ada di `package.json`.
  - Kumpulkan log terpusat; alert untuk error 5xx, cron gagal (`cronLog`), disk penuh.
- [ ] **6.4 Uji beban dasar**
  - Skenario: N user bersamaan membuka daftar, membuat faktur, menjalankan laporan bulanan (k6/Artillery).
  - Pantau slow query MariaDB; tambahkan index bila perlu.
  - Tetapkan target (mis. p95 < 1 detik untuk halaman daftar).
- [ ] **6.5 Deployment**
  - Image Docker standalone (`scripts/build-amd64.sh`), env produksi lengkap sesuai `src/lib/env.ts`, `TZ=Asia/Jakarta` di app & DB.
  - Pastikan port & `NEXTAUTH_URL` produksi benar (terkait fallback cron 3.5).
  - Tulis runbook: deploy, rollback, restore, rotasi secret.
- [ ] **6.6 Cron produksi:** semua `/api/cron/*` terjadwal dengan `CRON_SECRET`, dan kegagalan memicu alert.

**Selesai bila:** restore teruji dengan RTO/RPO tercatat, monitoring + alert aktif, uji beban memenuhi target, runbook tersedia.

---

## Fase 7 — UAT & go-live

- [ ] **7.1** UAT per modul oleh pengguna nyata (sales, gudang, finance, HR) dengan data mirip produksi. Pakai `docs/product/ACCEPTANCE-CRITERIA.md`.
- [ ] **7.2** Migrasi data awal: master (pelanggan, vendor, barang, COA), saldo awal stok & akun, piutang/hutang terbuka. Rekonsiliasi dengan sistem lama.
- [ ] **7.3** Pelatihan pengguna + panduan singkat per peran.
- [ ] **7.4** Go-live bertahap (paralel dengan sistem lama 1 periode tutup buku), lalu evaluasi.

---

## Urutan yang disarankan

| Minggu | Fokus |
| :--- | :--- |
| 1 | Fase 0, lalu Fase 5 (jadwalkan rapat keputusan dengan PO/Accountant secepatnya, karena ini paling lama menunggu) |
| 2 | Fase 3.1–3.2 + Fase 2.1 (validasi payload & delegasi bertipe) |
| 3 | Fase 6.1–6.3 (migrasi, backup/restore, monitoring) |
| 4 | Fase 1 + Fase 4 (rekonsiliasi siklus & E2E/browser) |
| 5 | Implementasi keputusan Fase 5, Fase 6.4–6.6 |
| 6+ | Fase 7 (UAT, migrasi data, go-live) |

Setiap item selesai: commit lewat PR dengan bukti (`Tests: X -> Y`, tsc clean, lint clean), dan centang di dokumen ini.
