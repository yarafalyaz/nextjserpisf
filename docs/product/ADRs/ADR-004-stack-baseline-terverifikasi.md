# ADR-004: Stack Baseline Terverifikasi dari Repository Aktif

-   **Status:** Diusulkan-terverifikasi-kode — belum diterima owner
    sebagai ADR tersendiri. Audit stack yang diminta
    [ADR-001](ADR-001-repository-stack-baseline.md) sudah selesai dan
    ADR-001 sudah berstatus **Accepted** di branch ini; ADR ini mencatat
    bukti audit pendukungnya.
-   **Tanggal:** 28 Oktober 2026
-   **Konteks:** ADR-001 meminta audit stack sebelum ADR diterima. Audit
    selesai terhadap repo aktif `/Users/yarasoft/Project/silengkap`,
    branch `main`, commit `275b9596038608f7ce4c29fcb82e7c7cecd709f0`.
-   **Keputusan yang diusulkan:** Tetapkan stack berikut sebagai baseline
    resmi ERP ISF, merujuk ADR-001 yang sudah **Accepted** di branch ini.
    Tidak ada migrasi framework/ORM/auth.

## Stack terverifikasi

| Aspek | Nilai terverifikasi | Bukti (file:baris) |
|---|---|---|
| Framework | Next.js `^16.4.2`, App Router, Turbopack untuk dev | `package.json` (dependencies; script `dev`: `next dev --turbopack -p 3001`) |
| UI | React (bawaan Next.js 16), TypeScript, Tailwind CSS `^4.3.0` lewat `@tailwindcss/postcss` | `package.json`; `postcss.config.mjs:3`; `src/app/globals.css:1` (`@import "tailwindcss"`) |
| Layout repo | **Bukan monorepo**: satu `package.json` di root, tanpa field `workspaces`; package manager npm (`package-lock.json`) | `package.json`; `package-lock.json` di root repo |
| ORM | Prisma `^7.10.1` (`prisma`, `@prisma/client`, `@prisma/adapter-mariadb`) | `package.json`; `prisma.config.ts:4-11` |
| Database | MySQL/MariaDB — provider `mysql`, client lewat `PrismaMariaDb` driver adapter | `prisma/schema.prisma:5-7`; `src/lib/db/prisma.ts:2,21` |
| Skema data | 208 model Prisma, 146 folder migrasi | `prisma/schema.prisma`; `prisma/migrations/` |
| Auth | NextAuth v5 (`next-auth ^5.0.0-beta.31`), Credentials provider, sesi JWT, verifikasi password bcrypt | `package.json`; `src/lib/auth/auth.ts:1-2,22-29` |
| Port | Dev dan start lokal `3001`; E2E memakai port terpisah sesuai konfigurasi Playwright repo | `package.json` scripts `dev`, `start` |
| Build/deploy | `output: "standalone"`; produksi dijalankan `node .next/standalone/server.js` (bukan `next start`); dev memakai `distDir: ".next-dev"` | `next.config.ts`; `package.json` script `start` |
| Penomoran dokumen (fakta platform terkait) | Counter atomik di MySQL (`document_sequences`), format kompleks `NNN/PREFIX/KODE/MM/YYYY` reset implisit per bulan, celah nomor tidak dipakai ulang | `src/lib/services/document-sequence.service.ts:20-42`; `src/lib/utils/document-number.ts:131-136,171-202`; `prisma/schema.prisma:352-362` |

## Konsekuensi

-   Semua dokumen produk (`ARCHITECTURE.md`, `DATA-MODEL.md`,
    `API-CONTRACTS.md`) yang masih menulis stack sebagai "belum boleh
    diasumsikan" dapat dirujukkan ke ADR ini oleh peran pembaru salinan
    repo.
-   Kandidat teknologi lain yang pernah dibahas (mis. NestJS sebagai
    backend terpisah) **tidak** dipakai repo aktif dan tidak boleh
    ditulis sebagai stack ERP ISF.
-   Perubahan stack di masa depan wajib ADR baru; ADR ini mencatat
    keadaan, bukan melarang evolusi.

## Alternatif yang ditolak oleh fakta

-   Menyatakan stack masih terbuka: ditolak, `package.json`, konfigurasi
    Prisma, dan kode auth membuktikan satu stack berjalan.
-   Mengganti ORM/database/auth mengikuti preferensi baru: tidak ada
    bukti kebutuhan; 742 file unit test dan 50 spec E2E terikat pada
    stack ini.

## Status penerimaan

ADR ini **belum diterima owner sebagai ADR tersendiri**. Status
`Diusulkan-terverifikasi-kode` di atas berarti isi cocok dengan kode
pada commit di atas; penerimaan formal ADR-004 tetap keputusan owner.
Ini tidak mengubah status ADR-001 di branch ini, yang sudah
**Accepted** dan merujuk audit ini sebagai bukti pendukungnya (lihat
bagian "Bukti verifikasi" di ADR-001): penerimaan ADR-001 bukan berarti
owner sudah menerima ADR-004 sebagai keputusan tersendiri.
