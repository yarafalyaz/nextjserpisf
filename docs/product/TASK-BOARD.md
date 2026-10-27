# TASK BOARD --- ERP ISF

**Tujuan:** sumber status kerja untuk tim/AI agent. Bagian 3 sudah disesuaikan dengan fakta repo pada 28 Oktober 2026; status `SELESAI-dasar` hanya berarti fondasinya terbukti ada, bukan fitur selesai.

## 1. Aturan board

Setiap task wajib memiliki ID, requirement IDs, owner tunggal, status,
priority, dependency, acceptance criteria, branch/PR, test result, dan
blocker. Status yang disarankan: `BACKLOG`, `READY`, `IN_PROGRESS`,
`BLOCKED`, `IN_REVIEW`, `QA`, `DONE`. Hanya task berstatus READY yang
boleh mulai dikerjakan. Task BLOCKED tidak boleh diselesaikan dengan
asumsi bisnis.

## 2. Template task

  Field                 Isi
  --------------------- -------------------------------------------------------
  Task ID               `ISF-XXX`
  Judul                 Ringkas dan spesifik
  Requirement IDs       Contoh `INV-BR-005`, `AC-INV-009`
  Owner                 Satu agent/person accountable
  Status                READY / IN_PROGRESS / BLOCKED / IN_REVIEW / QA / DONE
  Priority              P0 / P1 / P2
  Dependencies          Task/kontrak yang harus selesai lebih dulu
  Scope files           Direktori/file yang boleh diubah
  Acceptance criteria   Kondisi yang dapat diverifikasi
  Tests                 Test yang wajib dijalankan
  Blocker/decision      Keputusan yang belum ada
  PR/commit             Link/referensi aktual
  Result                Ringkasan perubahan dan hasil test

## 3. Backlog fase awal

Penyesuaian 28 Oktober 2026 terhadap repo Silengkap (`origin/main`
`327ae39258`). Status di bawah hanya menyatakan fondasi yang terbukti
ada (jalur file), bukan bahwa seluruh modul/fitur selesai. Task
keputusan bisnis yang masih terbuka tetap `BLOCKED`/`OPEN`.

| Task ID | Task | Priority | Dependency | Status (disesuaikan) | Bukti / catatan |
| --- | --- | --- | --- | --- | --- |
| ISF-001 | Audit repository, stack, migrations, auth, test scripts | P0 | — | SELESAI-dasar | Stack terverifikasi di `ARCHITECTURE.md` bagian 2 dan ADR-001 Accepted; auth `src/lib/auth/auth.ts:24`; migrations `prisma/migrations/`; test scripts `package.json` (`test`, `lint`, `typecheck`). Audit lockfile/migration baris per baris belum dilakukan. |
| ISF-002 | Inventarisasi business rules dan keputusan terbuka | P0 | ISF-001 | SELESAI-dasar | Indeks aturan di `BUSINESS-RULES.md`; peta status implementasi di `INDEKS-ATURAN.md`. Keputusan terbuka belum tertutup; lihat ISF-005/ISF-006. |
| ISF-003 | Review domain boundaries dan ownership | P0 | ISF-001 | SELESAI-dasar | Batas domain konseptual di `ARCHITECTURE.md`; struktur aktual `src/actions/`, `src/lib/hooks/`, `src/lib/services/`. Review ownership per modul (siapa pemilik tiap service) belum didokumentasikan. |
| ISF-004 | Tetapkan permission matrix | P0 | ISF-002 | SELESAI-dasar | `src/lib/auth/permissions.ts:21` (`requirePermission`), `src/lib/auth/permission-matrix.ts:4`, seed permission `prisma/seed.ts:72`, guard paritas `src/__tests__/permission-seed-parity.test.ts`. Matriks final per role tetap perlu review Product Owner. |
| ISF-005 | Tetapkan model costing stok dan negative-stock policy | P0 | ISF-002 | BLOCKED | Keputusan bisnis belum tertutup. Fakta repo: resolver costing terpusat `src/lib/services/costing-method.service.ts:4` (default FIFO, opsi average) — itu fakta implementasi, bukan keputusan policy yang disetujui di dokumen ini. Policy negative stock: OPEN (`INV-BR-007`). |
| ISF-006 | Putuskan scope accounting dan perilaku faktur pada ambang DP (persen kategori pelanggan tersnapshot pada quotation) | P0 | ISF-002 | BLOCKED | Sisa keputusan terbuka tunggal DP: reversal/pembatalan pembayaran DP setelah konversi (ADR-003 Proposed). Tertutup-terverifikasi: model akunting DP (SAL-BR-004 — Dr kas/bank / Cr 210102 saat DP terverifikasi, reklas Dr 210102 / Cr Piutang saat alokasi), ambang persen kategori pelanggan tersnapshot pada quotation dengan 50% hanya fallback fail-closed bila snapshot tak sah (`src/lib/sales/invoice-threshold.ts:17`), dan faktur penuh DRAFT (SAL-BR-005/SAL-BR-015, ADR-007). Scope double-entry ada (`prisma/schema.prisma:4221`); status FIN-BR-010 di luar sisa DP ini tidak diubah di baris ini. |
| ISF-007 | Review konseptual data model dan ERD aktual | P0 | ISF-001, ISF-005, ISF-006 | OPEN | Pemetaan konseptual ke model Prisma aktual sudah ditambahkan di `DATA-MODEL.md` bagian 13. ERD final dan penutupan selisih bergantung ISF-005/ISF-006. |
| ISF-008 | Tetapkan API contracts lintas domain | P0 | ISF-003, ISF-007 | OPEN | Kontrak aktual repo adalah server actions (`src/actions/*.actions.ts`) + route handlers `src/app/api/`, bukan REST konseptual di `API-CONTRACTS.md`. Penyamaan kontrak tertulis belum dilakukan. |
| ISF-009 | Susun test strategy dan CI quality gates | P0 | ISF-001 | SELESAI-dasar | CI ada di `.github/workflows/ci.yml:1` (lint, typecheck, unit, build, E2E); Vitest `vitest.config.ts`, Playwright `playwright.config.ts`. Kesesuaian gate dengan `TEST-STRATEGY.md` (mis. migration/security check) belum diaudit penuh. |
| ISF-010 | Buat dependency graph dan pembagian task per agent | P0 | ISF-003, ISF-008 | OPEN | Ownership disarankan ada di bagian 4; dependency graph formal belum dibuat. Bergantung ISF-008. |

Arti `SELESAI-dasar`: fondasi faktualnya ada dan terbukti jalur
filenya. Bukan klaim fitur selesai, bukan klaim sesuai acceptance
criteria. Verifikasi per aturan ada di `INDEKS-ATURAN.md`.

## 4. Pembagian ownership yang disarankan

-   Lead/Integrator: arsitektur, kontrak, dependency, merge, konflik
    lintas domain.
-   Inventory: stock movements, ledger, adjustment, remnant/scrap.
-   Purchasing: PO, receipt orchestration, vendor bill/AP.
-   Sales: quotation, DP, invoice/AR.
-   Projects/Work Orders: project lifecycle, work order, material
    issue/return orchestration.
-   Finance/HR: payments, accounting scope, payroll.
-   QA: acceptance criteria, tests, regression, release gates. Pembagian
    final harus sesuai agent/profil yang benar-benar tersedia. Hindari
    dua agent mengubah file inti yang sama tanpa ownership dan
    koordinasi.

## 5. Definition of Done

Task hanya DONE jika requirement terpenuhi, acceptance criteria diuji,
test result aktual dicatat, dokumentasi/kontrak diperbarui, review
selesai, dan tidak ada keputusan bisnis terbuka yang diam-diam
diasumsikan.
