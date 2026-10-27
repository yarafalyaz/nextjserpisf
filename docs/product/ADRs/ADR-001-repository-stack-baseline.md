# ADR-001: Verifikasi Stack Repository Sebelum Perubahan

-   **Status:** Accepted — terverifikasi 28 Oktober 2026 dari repo
-   **Tanggal:** 27 Oktober 2026 (diterima 28 Oktober 2026)
-   **Konteks:** Stack ERP pernah berubah selama pengembangan. Dokumen
    produk tidak boleh memaksa stack baru tanpa audit terhadap kode
    aktif.
-   **Keputusan:** Stack yang sudah aktif di repo dipertahankan.
    Sebelum refactor atau implementasi lintas modul, lakukan audit
    terhadap package manifests, lockfile, app structure, ORM/schema,
    migrations, auth, CI scripts, deployment config, dan test setup.
    Jangan mengganti framework/ORM/auth hanya berdasarkan dokumen
    konseptual.
-   **Konsekuensi:** Menghindari migrasi framework/ORM tidak perlu dan
    mengurangi konflik agent.
-   **Alternatif:** Mengganti stack langsung berdasarkan preferensi
    terbaru; ditolak karena berisiko mengganggu pekerjaan dan
    kompatibilitas yang sudah ada.
-   **Tindak lanjut:** Selesai untuk baseline stack. Package manager
    yang terbukti dari repo adalah npm (`package-lock.json` di root;
    tidak diaudit baris per baris di sini). Layout bukan monorepo:
    satu aplikasi Next.js di root repo.

## Bukti verifikasi (28 Oktober 2026)

Basis: `origin/main` `327ae39258b4cce6dfd27492d02aae2cfc6f3a65`.
Bukti `path:baris` relatif ke root repo:

- Next.js `^16.4.2` — `package.json:54`; React `^19.3.1` —
  `package.json:58`; App Router — direktori `src/app/`.
- Prisma `7.10.1` — `package.json:41`, `package.json:79`; provider
  datasource MySQL — `prisma/schema.prisma:5`; adapter MariaDB —
  `src/lib/db/prisma.ts:2`.
- NextAuth v5 `5.0.0-beta.31` — `package.json:55`; konfigurasi
  Credentials + session JWT — `src/lib/auth/auth.ts:24`,
  `src/lib/auth/auth.ts:25`.
- Tailwind CSS `^4.3.0` — `package.json:80`,
  `src/app/globals.css:1`.
- Standalone output — `next.config.ts:28`; port `3001` —
  `package.json:9`, `package.json:13`.
- Server actions `src/actions/*.actions.ts`, hooks
  `src/lib/hooks/*.hook.ts`, services `src/lib/services/*.service.ts`
  — struktur direktori repo.
- CI — `.github/workflows/ci.yml:1`; zona waktu CI `Asia/Jakarta` —
  `.github/workflows/ci.yml:25`.

Detail tabel stack: lihat `../ARCHITECTURE.md` bagian 2.
Lockfile dan isi migration tidak diaudit baris per baris; ADR ini
tidak mengklaim audit keamanan atau performa.
