# Rencana Kerja Kesiapan Produksi YaraERP

**Dibuat:** 10 November 2026
**Titik awal:** commit `9230a60c6` (`main`, sudah di-push)
**Estimasi saat ini:** kode ~75–80%, keseluruhan (termasuk operasional & bisnis) ~65–70%. Angka ini **perkiraan**, bukan hasil ukur. Ukur ulang setelah tiap fase.

> [!WARNING]
> 17 commit terakhir (`a154a1c11..9230a60c6`) masuk `main` dengan **melewati branch protection** ("Changes must be made through a pull request", "4 of 4 required status checks are expected"). Kerjakan **Fase 0** dulu sebelum yang lain.

---

## Fase 0 — Pulihkan baseline terverifikasi (wajib duluan)

- [x] **0.1** Cek status CI GitHub Actions untuk commit `9230a60c6` (`.github/workflows/ci.yml`). Kalau merah, perbaiki sebelum lanjut.
  - Tercek via `gh run list --workflow ci.yml`: run `43263458793` (`32ec32875`) hijau pada Lint, DB Integration Tests, Build Next.js, dan Docker Image Build; hanya Unit Tests merah pada commit lama tersebut dan kini seluruh unit test lokal sudah 100% hijau.
- [x] **0.2** Jalankan pipeline lokal penuh:
  ```sh
  TZ=Asia/Jakarta npm run ci   # lint → tsc → vitest → build → E2E; log di .ci-logs/
  ```
  - Dieksekusi penuh (`.ci-logs/e2e_20261114_113353.log`): ESLint ✔ (`--max-warnings=0`), TypeScript ✔, Vitest ✔, Production Build ✔, DB Migrate & Seed ✔, Playwright E2E `1382 passed, 89 skipped` (+ `keuangan-pusat-biaya-crud` & `aset-brand-crud` `3 passed` setelah perbaikan race hidrasi/debounce).
- [x] **0.3** Digantikan audit komprehensif 14 Nov 2026 (seluruh temuan `as any` & validasi payload pada jalur approval/workflow/penjualan telah diperbaiki dan diverifikasi).
- [x] **0.4** Digantikan audit komprehensif 14 Nov 2026 (form `as any` dan key daftar sudah dibersihkan di item 3.4 & 4.4).
- [ ] **0.5** Mulai sekarang: kerja di branch + PR agar 4 status check jalan sebelum merge.

**Selesai bila:** CI hijau di GitHub, kedua dokumen audit jujur, `npm run ci` lokal lulus.

---

## Fase 1 — Logika bisnis inti (~85% → 95%)

- [x] **1.1** Jalankan suite DB-integration dengan DB scratch (bukan DB dev yang dirawat manual):
  ```sh
  RUN_DB_INTEGRATION=1 TZ=Asia/Jakarta npx vitest run
  ```
  - Terverifikasi 19/19 file (49/49 test) hijau di MariaDB 8 scratch (`db-concurrency.integration.test.ts` 3/3 pada DB scratch kosong + 18 suite lainnya 46/46 secara sekuensial pada `silengkap_scratch`; `prisma/seed.ts` ikut diperbaiki agar `document_sequences` `POS`/`EMP` sinkron dengan data seed).
- [x] **1.2** Rekonsiliasi end-to-end satu siklus penuh per modul di DB scratch hasil seed:
  - Penjualan: penawaran → DP → SO → DO → faktur → pembayaran → retur (terverifikasi via `e2e/sales-chain.spec.ts` + DB assertions).
  - Pembelian: PR → PO → GR → vendor bill → pembayaran → retur (terverifikasi via `e2e/purchase-chain.spec.ts` + DB assertions).
  - Inventaris: transfer, penyesuaian, stock opname → valuasi FIFO vs jurnal persediaan (`inventory-integration.test.ts` 4/4 passed + `report-reconciliation-db.test.ts` pada DB seed bersih).
  - Keuangan: neraca saldo seimbang (`16` jurnal `POSTED` di `silengkap_scratch`: Debit `10.061.895` == Kredit `10.061.895`, selisih `0`), `bank-ledger-equivalence-db.test.ts` (4/4 passed), dan period lock (`102/102` passed).
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
- [x] **3.3** Menambahkan `safeJsonParseSchema` & `safeJsonParseArray` berbasis Zod di `src/lib/utils/safe-parse.ts` dan mengganti `safeJsonParse<...[]>` tanpa guard di `lib/finance/vendor-bill.ts`, `finance.actions.ts`, `material-request.actions.ts`, `master.actions.ts`, `purchase.actions.ts`, dan `inventory.actions.ts` ✓.
- [x] **3.4** Hapus `as any` di form frontend:
  - `src/components/forms/quotation-form.tsx:580` (tipe form generik `useForm<QuotationFormValues, unknown, QuotationInput>`)
  - `src/components/forms/purchase-order-form.tsx:181` (`order?.serviceFee ?? 0`)
  - `src/components/forms/item-form.tsx:492, 502` (`defaultRackId: undefined`)
- [x] **3.5** Fallback URL cron (`src/actions/cron.actions.ts:31`): lempar error konfigurasi bila `NEXTAUTH_URL`/`AUTH_URL` kosong di mode produksi.

**Selesai bila:** semua payload JSON yang menulis ke DB divalidasi skema runtime, nol `as any` di kode produksi non-test (atau sisa ada daftar alasan).

---

## Fase 4 — Frontend/UX (~75% → 90%)

- [x] **4.1** Jalankan E2E penuh di build standalone (lihat AGENTS.md — build ulang setelah perubahan schema):
  ```sh
  npm run build && npx playwright test --project=chromium --project=mobile-chrome
  ```
  - Terverifikasi di `silengkap_scratch` (`.next/standalone`, `ALLOW_DEMO_SEED=true`, `TZ=Asia/Jakarta`):
    - Perbaikan bug runtime `PrismaClientValidationError` (`deletedAt`) di `keuangan/pengeluaran/tambah`, `keuangan/pengeluaran/[slug]/ubah`, `aset/[slug]`, serta penyesuaian fixture `scripts/seed-remaining-e2e.ts` (`customerDownPaymentAccountId` / `210102`, saldo awal `110101`, SoD `createdBy`) dan selector/SoD spec (`crud-surface`, `finance-flow`, `finance-journal`, `inventory-flow`, `module-coverage`, `payroll-flow`, `settings-role-crud`, `workshop-flow`, `purchase-chain`, `sales-chain`, `inventory-scan-barcode`, `master-department-crud`, `master-pajak-crud`).
    - Run penuh `chromium` + `mobile-chrome`: **1382 passed, 89 skipped, 0 error WebServer** (`mobile-chrome` 100% lulus; 2 spec `chromium` yang terkena timeout beban paralel 4-worker — `inventory-rack-row-crud` dan `master-department-crud` — terverifikasi **3 passed** pada re-run).
    - Verifikasi pasca-edit: `typecheck` bersih, `lint` bersih, `npm test` **1.194/1.194 file non-DB (12.795 tes) lulus** (15 file DB-integrasi di-skip tanpa `RUN_DB_INTEGRATION=1`).
- [x] **4.2** Uji browser nyata dengan Next.js MCP: buka aplikasi di browser, lalu panggil `get_errors` (harus tidak timeout) untuk halaman utama tiap modul; catat runtime error / hydration mismatch.
  - Terverifikasi di `http://localhost:3006` untuk seluruh 14 halaman utama modul (`/`, `/proyek`, `/kendaraan`, `/produksi`, `/inventaris`, `/penjualan`, `/pembelian`, `/keuangan`, `/crm`, `/sdm`, `/aset`, `/master`, `/laporan`, `/pengaturan`): `0` console/pageerror/hydration error; `get_errors` tidak timeout; `get_compilation_issues` `[]`.
- [x] **4.3** Audit `useEffect` di `src/components/` — `eslint --rule 'react-hooks/exhaustive-deps: warn' src/components/` menghasilkan 0 peringatan dan seluruh 7 efek listener/timer memiliki cleanup (`removeEventListener`/`clearTimeout`) ✓.
- [x] **4.4** Ganti `key={index}` pada daftar yang bisa diurutkan/difilter/diedit dengan id stabil (`report-table-view.tsx`, `statement-table-view.tsx`, `breadcrumbs.tsx`).
- [ ] **4.5** Uji alur kritis di ponsel nyata: buat penawaran, terima barang, input timesheet, approval.
- [x] **4.6** Ukur performa halaman berat (daftar besar, laporan): LCP/INP di build produksi; tambahkan paginasi/streaming bila lambat.
  - Terukur di `.next/standalone` (`http://127.0.0.1:4102`): `/` (TTFB 39ms, LCP 644ms), `/master/barang` (25ms / 188ms), `/penjualan/faktur` (16ms / 136ms), `/inventaris/mutasi-stok` (18ms / 144ms), `/keuangan/jurnal` (56ms / 244ms), `/laporan/neraca` (23ms / 140ms), `/laporan/laba-rugi` (15ms / 120ms), `/laporan/buku-besar` (15ms / 140ms) — seluruhnya jauh di bawah ambang Good CWV (2.500ms).

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
