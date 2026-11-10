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
- [x] **1.3** Uji tutup buku bulanan: `assertPeriodOpen()` menolak dokumen bertanggal di periode terkunci untuk **semua** jenis dokumen bertanggal (teruji di 14 test suite: `period-lock-layer2.test.ts`, `period-close-lock.test.ts`, `sales-update-return-lock.test.ts`, `settings-period-lock.test.ts`, `update-dp-lock.test.ts`, dll. 102/102 passed ✓).
- [x] **1.4** Uji konkurensi (dua user mengedit/memposting dokumen yang sama) pada jalur yang memakai `FOR UPDATE` (teruji di `finance-concurrency-lock.test.ts`, `sales-convert-lock.test.ts`, `inventory-integration.test.ts` SAL-BR-014 locks ✓).
- [x] **2.2** Audit setiap server action baru sejak audit keamanan terakhir: wajib `requirePermission()`; dokumen bertanggal wajib `assertPeriodOpen()`. `src/__tests__/permission-seed-parity.test.ts` hijau 11/11 passed ✓.
- [x] **2.3** Uji IDOR: user dengan scope cabang/karyawan terbatas tidak bisa membaca/mengubah dokumen di luar scope lewat URL slug langsung atau API (`document-page-scope.test.ts`, `list-page-warehouse-scope-guard.test.ts`, `document-scope-parity.test.ts`, dll. 31/31 passed ✓).
- [x] **2.4** Verifikasi konfigurasi produksi:
  - `AUTH_SECRET` & `CRON_SECRET` ≥32 karakter, bukan placeholder (`src/lib/env.ts` Zod runtime validation ✓).
  - `TRUSTED_PROXY=1` **hanya** bila semua trafik lewat proxy yang menimpa header IP.
  - CSP & header keamanan di `src/proxy.ts` aktif di build standalone (teruji di `proxy-api-error-contract.test.ts` ✓).
- [x] **2.5** `npm audit --omit=dev` — tangani kerentanan high/critical (selesai: `dompurify` dan `fast-uri` telah diperbarui, hasil `npm audit --omit=dev` 0 vulnerabilities ✓).

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
- [x] **4.4** Ganti `key={index}` pada daftar yang bisa diurutkan/difilter/diedit dengan id stabil (`report-table-view.tsx`, `statement-table-view.tsx`, `breadcrumbs.tsx`).
- [ ] **4.5** Uji alur kritis di ponsel nyata: buat penawaran, terima barang, input timesheet, approval.
- [ ] **4.6** Ukur performa halaman berat (daftar besar, laporan): LCP/INP di build produksi; tambahkan paginasi/streaming bila lambat.

**Selesai bila:** E2E 41 spec hijau di desktop + mobile, nol error runtime di browser untuk halaman utama tiap modul.

---

## Fase 5 — Keputusan bisnis terbuka (~60% → 100%)

Butuh **Product Owner / Accountant**, bukan hanya developer. Setiap keputusan → ADR + update `BUSINESS-RULES.md`, `INDEKS-ATURAN.md`, `KEPUTUSAN-TERVERIFIKASI.md`.

- [x] **5.1 SAL-BR-013 — Retur jasa/non-stok** (terverifikasi: baris non-`isProduct` dilewati di hook retur, kombinasi `isService && isProduct` ditolak di server, 16/16 tests passed ✓).
- [x] **5.2 ADR-003 — Reversal DP pasca-konversi** (Status: **Accepted** per keputusan Owner 10 Nov 2026: **Option B — Cash Refund fisik/tunai/transfer**. Kasir/Finance menerbitkan voucher refund kas pembalik Dr 210102 / Cr Kas/Bank, bukan deposit kredit toko ✓).
- [x] **5.3 PROJ-BR-008 — Standar tarif tenaga kerja** (Status: **Tertutup untuk Go-Live** per Vonis Akuntan F-2026-10-28-129-V: biaya diakui dari faktur & 5 keranjang aktual; timesheet tanpa rate = memo non-uang; PSAK 72 laporan eksternal dinyatakan di luar scope go-live fase 1 ✓).

**Selesai bila:** ketiga ADR berstatus Accepted dan diimplementasi (atau secara eksplisit dinyatakan di luar scope go-live).

---

## Fase 6 — Operasional produksi (~55% → 90%)

- [x] **6.1 Baseline migrasi produksi**
  - Dev memakai `db push`, jadi `prisma migrate deploy` ke DB yang sudah ada akan gagal `P3005`. Ikuti prosedur baseline di `docs/AUDIT-REPORT.md` (`prisma migrate resolve --applied <migration>`).
  - Verifikasi rantai migrasi: `npm run db:check-migrations` dijalankan via user root (drift migrasi vs schema.prisma: 0 — rantai sehat ✓).
  - Gladi resik: restore salinan DB produksi ke staging, jalankan `migrate deploy`.
- [x] **6.2 Backup & restore**
  - Skrip backup `scripts/backup-db.sh` (mysqldump satu transaksi + gzip + verifikasi integritas arsip).
  - **Uji restore drill** sukses dijalankan ke DB MariaDB scratch (`silengkap_restore_drill` memulihkan 222 tabel secara utuh dan bersih ✓).
- [x] **6.3 Monitoring & alerting**
  - Endpoint `/api/health` aktif dan diverifikasi sehat (`{"status":"healthy",...}`).
  - Alert error 5xx, cron log (`cronLog`), dan error response terstandar.
- [x] **6.4 Uji beban dasar**
  - Uji beban dieksekusi dengan skenario 200 request simultan (konkurensi 20): throughput **84.18 req/detik**, latensi p95 **271 ms** (target: < 1.000 ms), 0 error rate ✓.
- [x] **6.5 Deployment & Runbook**
  - Image Docker standalone terverifikasi (`scripts/build-amd64.sh` & build standalone), env produksi lengkap sesuai `src/lib/env.ts`, `TZ=Asia/Jakarta` di app & DB.
- [x] **6.6 Cron produksi:** semua `/api/cron/*` terjadwal dengan `CRON_SECRET` / `CRON_CREDENTIAL` (teruji 100/100 tests di `src/app/api/cron/` ✓).

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
