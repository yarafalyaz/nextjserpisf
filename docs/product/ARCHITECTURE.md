# ARCHITECTURE --- ERP ISF

**Status:** Baseline konseptual; bagian Stack (bagian 2) dan ADR-001 sudah diverifikasi terhadap repository pada 28 Oktober 2026. Bagian lain tetap harus diverifikasi sebelum implementasi.\
**Prinsip:** jangan mengganti framework, ORM, auth, atau pola deployment
yang sudah aktif tanpa audit dan ADR.

## 1. Tujuan arsitektur

-   Menjaga batas domain bisnis.
-   Menjamin semua perubahan stok dan saldo keuangan melalui jalur
    terkontrol.
-   Menghindari duplikasi business logic antara frontend, API, laporan,
    dan agent.
-   Mendukung pengujian otomatis, observability, dan perubahan bertahap.

## 2. Stack

**Stack aktual terverifikasi 28 Oktober 2026** dari repo Silengkap
(basis `origin/main` `327ae39258`). Baris di bawah menggantikan bahasa
"belum boleh diasumsikan" pada baseline sumber. Bukti ditulis sebagai
`path:baris` relatif ke root repo.

| Lapisan | Aktual | Bukti |
| --- | --- | --- |
| Framework web | Next.js `^16.4.2`, App Router (`src/app/`) | `package.json:54`; direktori `src/app/` |
| UI runtime | React `^19.3.1` / React DOM `^19.3.1` | `package.json:58`, `package.json:59` |
| Bahasa | TypeScript `^6.0.3` | `package.json:82` |
| ORM | Prisma `7.10.1` (`@prisma/client` + CLI `prisma`) | `package.json:41`, `package.json:79` |
| Database | MySQL provider Prisma; runtime MariaDB lewat `@prisma/adapter-mariadb` `^7.10.1` + driver `mariadb` | `prisma/schema.prisma:5` (`provider = "mysql"`), `package.json` (`@prisma/adapter-mariadb`), `src/lib/db/prisma.ts:2` (`PrismaMariaDb`) |
| Auth/session | NextAuth v5 `5.0.0-beta.31` (`next-auth`), Credentials, session JWT, hash `bcryptjs` | `package.json:55`, `src/lib/auth/auth.ts:24`, `src/lib/auth/auth.ts:25`, `src/lib/auth/auth.ts:4` |
| Authorization | `requirePermission()` backend di server actions/halaman | `src/lib/auth/permissions.ts:21` |
| Styling | Tailwind CSS `^4.3.0` (`@import "tailwindcss"`) + PostCSS v4 | `package.json:80`, `src/app/globals.css:1` |
| Validasi | Zod `^4.6.7` | `package.json:67` |
| Halaman | App Router: `src/app/(dashboard)/<modul>/`, `(auth)`, `src/app/api/` | direktori `src/app/` |
| Server actions | `src/actions/*.actions.ts` (`"use server"`, satu file per modul) | direktori `src/actions/` |
| Hooks (efek domain) | `src/lib/hooks/*.hook.ts`, menerima `txClient` opsional | direktori `src/lib/hooks/` |
| Services (mesin backend) | `src/lib/services/*.service.ts` + helper domain di `src/lib/services/` | direktori `src/lib/services/` |
| Proxy (pengganti middleware) | `src/proxy.ts` (rate limit, header keamanan) | `src/proxy.ts:5` |
| Output/build | `output: "standalone"`, `next start` tidak dipakai; serve `node .next/standalone/server.js` | `next.config.ts:28`, `package.json:13` |
| Port | `3001` (dev `--turbopack -p 3001`; start `PORT=3001`) | `package.json:9`, `package.json:13` |
| Skema/migrasi | `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts` | direktori `prisma/` |
| Test | Vitest (unit), Playwright (E2E, standalone) | `package.json` scripts `test`; `vitest.config.ts`, `playwright.config.ts` |
| CI | GitHub Actions lint → typecheck → unit → build → E2E, `TZ=Asia/Jakarta` | `.github/workflows/ci.yml:1`, `.github/workflows/ci.yml:25` |

Catatan kejujuran verifikasi:

- Versi di atas adalah rentang `package.json`, bukan versi lockfile
  yang terpasang persis; lockfile tidak diaudit baris per baris di
  penyesuaian ini.
- NestJS tidak dipakai di repo aktif; jangan mengikuti kandidat stack
  lama pada baseline sumber.
- Keputusan mempertahankan stack ini dicatat di
  [ADRs/ADR-001-repository-stack-baseline.md](ADRs/ADR-001-repository-stack-baseline.md)
  (Accepted).

## 3. Logical domains

-   Identity & Access
-   Company Settings
-   Master Data
-   Inventory
-   Purchasing
-   Sales
-   Finance/Accounting
-   Projects
-   Work Orders
-   HR/Payroll
-   Reporting
-   Approvals
-   Audit

## 4. Batas domain

-   Inventory adalah pemilik aturan saldo stok, movement, ledger,
    lokasi, adjustment, remnant, dan scrap.
-   Purchasing meminta receipt/movement melalui kontrak Inventory; tidak
    menulis saldo langsung.
-   Sales memicu issue stock saat invoice diposting melalui kontrak
    Inventory.
-   Projects/Work Orders meminta material issue/return melalui
    Inventory.
-   Finance memiliki aturan tagihan, pembayaran, alokasi, outstanding,
    dan jika disetujui, journal/ledger accounting.
-   Reporting membaca model/query yang konsisten dengan domain sumber
    dan tidak mengimplementasikan aturan saldo sendiri.
-   Audit/Approval menyediakan kemampuan bersama, tetapi domain tetap
    menentukan kapan approval diperlukan.

## 5. Alur posting lintas domain

Contoh posting faktur: 1. Backend memeriksa permission dan status
dokumen. 2. Validasi customer, baris, kuantitas, harga, dan kebijakan.
3. Dalam transaksi database, amankan nomor/status dan stok yang relevan.
4. Buat invoice posting record/stock movement dan update saldo/cache
yang diperlukan. 5. Buat efek finansial sesuai model accounting yang
disetujui. 6. Tulis audit record dan idempotency key. 7. Commit; jika
langkah kritis gagal, rollback seluruh perubahan database. 8. Side
effect eksternal dijalankan setelah commit dengan pola yang aman (mis.
outbox) jika dibutuhkan.

Detail implementasi locking, outbox, isolation, dan journal harus
dijabarkan di technical design sebelum production.

## 6. Status dan lifecycle

Setiap dokumen harus memiliki state machine yang terdokumentasi.
Validasi transisi dilakukan di backend. Hindari menerima status
arbitrary dari client. Approval tidak sama dengan posting kecuali
workflow secara eksplisit menyatakan demikian.

## 7. Database dan integritas

-   Foreign key dan unique constraint untuk invariant yang relevan.
-   Decimal/fixed precision untuk uang.
-   Strategi quantity precision berdasarkan unit.
-   Transaksi DB untuk perubahan yang saling terkait.
-   Idempotency/deduplication untuk posting dan retry.
-   Strategi locking untuk stok, nomor dokumen, dan alokasi pembayaran.
-   Soft delete/archive untuk master data yang sudah direferensikan.
-   Ledger historis tidak dihapus melalui operasi normal.
-   Migrations harus direview dan diuji pada salinan data.

## 8. API conventions

-   Validasi semua input server-side.
-   Kontrak request/response dan error konsisten.
-   Endpoint posting eksplisit dan memvalidasi lifecycle.
-   Pagination, filtering, sorting dilakukan server-side.
-   Permission dan audit pada endpoint sensitif.
-   Perubahan API harus dikoordinasikan dengan consumer dan test
    terkait.
-   Jangan mengekspos internal stack trace atau data rahasia.

## 9. Frontend

-   UI berbahasa Indonesia, IDR, dan WIB.
-   Komponen dan pola interaksi konsisten.
-   Frontend boleh membantu validasi, tetapi backend adalah otoritas.
-   Loading, empty, error, forbidden, dan success states wajib ada.
-   Aksi posting/cancel/reversal harus menunjukkan konsekuensi.
-   Data tabel besar menggunakan pagination/filter server-side.

## 10. Observability dan operasional

-   Structured logs tanpa secret/PII berlebihan.
-   Request/correlation ID.
-   Audit trail untuk aksi bisnis berbeda dari application logs.
-   Health checks dan monitoring error.
-   Backup/restore diuji.
-   RPO/RTO, retention, dan alert thresholds perlu keputusan.

## 11. Keputusan arsitektur yang wajib dicatat sebagai ADR

-   Stack aktual dan alasan dipertahankan/diubah.
-   ORM/database.
-   Auth/session strategy.
-   Stock costing dan locking.
-   Accounting model.
-   Event/outbox jika digunakan.
-   File storage/export access.
-   Deployment, backup, dan recovery.
