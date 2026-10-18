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

- Node.js 20+
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

### Masuk Bawaan

- **Email**: admin@yaraerp.app
- **Password**: password123

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

Pipeline GitHub Actions jalan tiap push ke `main`:

- **Job verifikasi**: cek TypeScript, ESLint, tes unit
- **Job E2E**: layanan MySQL, migrasi DB, Playwright (4 shard)

## Kualitas Kode

- 280+ tes unit (Vitest), cakupan pernyataan 82%+
- Tes E2E mencakup semua modul terautentikasi
- Nol dependensi sirkular
- Nol `console.log` di kode klien
- Validasi env runtime (Zod)
- Header keamanan via proxy (CSP, HSTS, X-Frame-Options)
- Pembatasan laju di rute otentikasi, unggah, dan API
