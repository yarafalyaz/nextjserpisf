# Silengkap ERP — Next.js App Router

Sistem ERP terintegrasi yang dibangun dengan Next.js 16 App Router, Prisma 7, dan MySQL.

## Tumpukan Teknologi

- **Kerangka**: Next.js 16 (App Router + Turbopack)
- **Bahasa**: TypeScript 5
- **ORM**: Prisma 7 (MySQL via @prisma/adapter-mariadb)
- **Otentikasi**: NextAuth v5 (Kredensial + JWT)
- **Antarmuka**: TailwindCSS 4 + shadcn/ui (CVA)
- **Formulir**: React Hook Form + Zod
- **Status**: Zustand + TanStack Query
- **Grafik**: Recharts
- **Pengujian**: Vitest + Playwright

## Mulai Cepat

### Prasyarat

- Node.js 26+ (lihat `engines` di `package.json`; Docker memakai `node:26-alpine`)
- MySQL 8.0+
- npm

### Instalasi

```bash
# Install dependencies
npm install

# Siapkan environment
cp .env.example .env
# Isi .env dengan kredensial basis data

# Bangkitkan klien Prisma
npm run db:generate

# Dorong skema ke basis data
npm run db:push

# Seed basis data (membuat admin, peran, izin, COA)
npm run db:seed

# Jalankan server pengembangan
npm run dev
```

### Penyiapan Awal (Wizard Installer)

Instalasi baru tidak perlu seed manual. Bila database belum berisi
pengguna, membuka aplikasi akan mengarahkan ke wizard `/setup`:

1. **Pemeriksaan Sistem** — wizard memeriksa koneksi (`DATABASE_URL` dari
   konfigurasi server) dan, bila skema masih kosong, membuatnya otomatis
   dari rantai migrasi (`prisma migrate deploy` dijalankan dari dalam
   aplikasi).
2. **Data Perusahaan** — nama, kontak, NPWP, dan alamat; tersimpan sebagai
   identitas kop laporan.
3. **Akun Administrator** — membuat super admin pertama beserta data
   master bawaan: peran & izin RBAC, bagan akun (COA) yang sudah
   terpetakan otomatis, gudang utama, departemen/jabatan, satuan, metode
   pembayaran/pengiriman, dan urutan nomor dokumen. Tanpa data demo.

Sesudah terpasang, `/setup` terkunci dan menolak kunjungan berikutnya.

### Masuk Bawaan

- Instalasi wizard: akun administrator yang Anda buat di langkah 3.
- Seed demo (hanya bila `ALLOW_DEMO_SEED=true`): admin
  `admin@erp.yarasoft.net` dengan kata sandi dari `SEED_ADMIN_PASSWORD`,
  plus satu pengguna demo per peran (staff, GA, kepala bengkel, karyawan,
  purchasing, warehouse, finance) dengan kata sandi yang sama.

## Modul (41 Rute)

| #   | Modul         | Deskripsi                                                  |
| --- | ------------- | ---------------------------------------------------------- |
| 1   | Dasbor        | Kartu KPI, Faktur Terkini, Peringatan Stok Rendah          |
| 2   | Data Master   | Pelanggan, Pemasok, Barang, Gudang, Karyawan, Akun         |
| 3   | Penjualan     | Penawaran → DP → SO → Faktur → Pembayaran → Retur          |
| 4   | Pembelian     | PR → PO → Penerimaan Barang → Retur                        |
| 5   | Inventaris    | Mutasi, Penyesuaian, Transfer, Pengeluaran Material        |
| 6   | Produksi      | Perintah Kerja, Perintah Produksi                          |
| 7   | SDM           | Absensi, Cuti, Lembur, Penggajian                          |
| 8   | Keuangan      | Jurnal, Beban, Kas Kecil, Rekonsiliasi Bank                |
| 9   | CRM           | Prospek, Tiket                                             |
| 10  | Aset          | Manajemen Aset                                             |
| 11  | Laporan       | Neraca, Laba Rugi, Neraca Saldo                            |
| 12  | Pengaturan    | Konfigurasi Perusahaan, Pemetaan Akun                      |

## Fitur Utama

- **Biaya Persediaan FIFO** dengan kunci baris
- **Akuntansi Berpasangan** dengan validasi keseimbangan
- **Penomoran Dokumen Atomik** (aman konkurensi)
- **Pola Pengamat** via hook eksplisit (13 hook)
- **RBAC** dengan 70+ izin
- **Desain Responsif** (mobile-first)

## Scripts

```bash
npm run dev          # Jalankan server dev (Turbopack)
npm run build        # Build produksi
npm run db:push      # Dorong skema ke DB
npm run db:seed      # Seed basis data
npm run db:studio    # Buka Prisma Studio
npm run db:generate  # Bangkitkan ulang klien Prisma
npm run test         # Jalankan tes unit (280+ tes)
npm run test:e2e     # Jalankan tes E2E (Playwright)
```

## CI/CD

GitHub Actions jalan tiap push/PR ke `main`, tanpa E2E browser:

- **Lint**: ESLint + TypeScript
- **Unit**: tes unit (Vitest)
- **Build**: build produksi Next.js dengan layanan MySQL 8 (`migrate deploy`, tanpa seed)
- **DB integration**: tes integrasi DB di MySQL

E2E Playwright adalah gate lokal pra-merge (tidak ada job E2E GitHub,
tidak ada shard). Prasyarat: MySQL 8 dengan database khusus tes yang
boleh di-reset (jangan pakai DB dev/prod), dan `DATABASE_URL` diset
eksplisit di environment — skrip tidak membaca `.env` untuk dirinya:

```bash
DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DB_TES' npm run ci
# atau: DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DB_TES' ./scripts/ci-local.sh
```

Satu perintah `playwright test` menjalankan auth setup lalu project
`chromium` + `mobile-chrome`. Log tersimpan di `.ci-logs/`; skrip
mencatat commit SHA (`git rev-parse --short HEAD`) dan status dirty
(`git status --porcelain`) di awal dan summary — lampirkan ke PR
sebagai bukti gate. Tree bersih tidak diwajibkan, tetapi statusnya
selalu dilaporkan. Tanpa E2E: `./scripts/ci-local.sh --skip-e2e`.

## Kualitas Kode

- 280+ tes unit (Vitest), cakupan pernyataan 82%+
- Tes E2E mencakup semua modul terautentikasi
- Nol dependensi sirkular
- Nol `console.log` di kode klien
- Validasi env runtime (Zod)
- Header keamanan via proxy (CSP, HSTS, X-Frame-Options)
- Pembatasan laju di rute otentikasi, unggah, dan API
