# Rencana: Rapikan Struktur Data Modul Kendaraan

## Tujuan

Menjadikan **Kendaraan (`Vehicle`) sebagai MASTER tipe katalog**, dengan
`CustomerVehicle` sebagai unit konkret milik pelanggan yang merujuk ke master
tersebut. Saat ini kedua konsep tercampur (form `/kendaraan/tambah` bahkan
menyimpan `customerId` padahal tabel `vehicles` tidak punya kolom itu).

## Keputusan (dikonfirmasi user)

1. **`Vehicle` = tipe katalog**, bukan unit fisik unik.
2. **Data boleh direset** — migrasi tidak butuh backfill.
3. Isi `Vehicle`: `vehicleVariantId` + `year` (+ `name` opsional). Atribut fisik
   (plat, warna, rangka, mesin) **pindah ke `CustomerVehicle`**.
4. Penjualan (Quotation/SalesOrder/SalesInvoice), WorkOrder, Project **tetap
   menunjuk `CustomerVehicle`** — tidak berubah.

## Hierarki target

```
VehicleBrand   (Merek)
  └ VehicleModel    (Model)
      └ VehicleVariant   (Varian: drivetrain, transmission)
           └ Vehicle       (Tipe katalog: vehicleVariantId + year)   ← MASTER
                └ CustomerVehicle  (Unit pelanggan: plat, warna, rangka, mesin)
                     └ Quotation / SalesOrder / SalesInvoice / WorkOrder / Project
```

## Perubahan schema (`prisma/schema.prisma`)

### `Vehicle` (master tipe katalog)
- `vehicleVariantId Int` → **NOT NULL** (tipe wajib punya varian)
- `name String?` (label tipe, opsional; mis. "Fortuner 2.4 VRZ 2023")
- `year Int?` (tahun model/acuan)
- **Hapus** `plateNumber`, `color` (pindah ke CustomerVehicle)
- Tambah `deletedAt DateTime?` (soft delete)
- Relasi: `variant VehicleVariant @relation(..., onDelete: Restrict)`
  (tipe yang menempel ke varian; hapus varian yang masih dipakai tipe → ditolak)

### `CustomerVehicle` (unit milik pelanggan)
- Tambah `plateNumber String?`, `color String?` (dipindah dari Vehicle)
- **Hapus** `vehicleType String?` dan `transmission String?` (string bebas →
  sumber kebenaran adalah rantai Vehicle→Variant)
- Tambah `deletedAt DateTime?` (soft delete)
- `vehicleId` tetap (FK ke `Vehicle`). `onDelete`: tetap `Cascade` untuk
  `customer→vehicle`? → ubah jadi **Restrict** supaya unit pelanggan tak
  terhapus diam-diam saat master Vehicle dihapus.

### Guard integritas
- `Vehicle.deleteVehicle` → cek ada `CustomerVehicle` aktif yang memakai →
  tolak (kecuali soft delete).
- Semua hapus brand/model/variant/vehicle pakai **soft delete** (`deletedAt`)
  supaya penjualan lama tetap utuh; konsisten dengan pola Customer/Vendor/Item.

## Perubahan kode

- `src/actions/vehicle.actions.ts`: schema Zod `createVehicle`/`updateVehicle`
  → buang `plateNo`/`color`/`customerId`; tambah `name`/`year`; `variantId`
  wajib. Tambah guard hapus. Soft-delete filter di semua query.
- `src/actions/vehicle.actions.ts` (bagian CustomerVehicle): terima
  `plateNumber`/`color`; buang `vehicleType`/`transmission`.
- `src/components/forms/vehicle-form.tsx`: buang field Pelanggan + Warna + Plat;
  tambah Nama tipe; Varian wajib; Tahun tetap.
- `src/components/forms/customer-vehicle-form.tsx`: tambah Plat + Warna; buang
  Tipe/Transmisi bebas.
- Halaman `/kendaraan` (master): kolom → Merek/Model/Varian/Tahun/Nama.
- Halaman `/kendaraan/pelanggan`: kolom → Pelanggan/Plat/Merek-Model/Tahun.
- `src/lib/validations/vehicle.schemas.ts`: selaraskan.
- `src/actions/vehicle.actions.ts` soft-delete filter di `findMany`/`count`.

## Migrasi

- Migrasi baru `prisma migrate dev` (data boleh reset):
  - `vehicles`: drop `plate_number`, `color`; alter `vehicle_variant_id` →
    NOT NULL; add `name`, `deleted_at`.
  - `customer_vehicles`: add `plate_number`, `color`, `deleted_at`;
    drop `vehicle_type`, `transmission`.
  - Perbaiki FK `customer_vehicles.vehicle_id` → `ON DELETE RESTRICT`.

## Verifikasi

- `npx tsc --noEmit`, `eslint src`, `vitest run`, `next build`.
- Prisma migrate ke dev DB + regenerate client.
- E2E: `vehicle-crud`, `customer-vehicle-registry`, `master-crud-batch`
  (Kendaraan), `sales-crud`, `project-crud` (semua sentuh CustomerVehicle).
- Regresi: unit test `vehicle.actions.test.ts`.

## Urutan kerja & commit (bertahap)

1. **Schema + migrasi** — hanya schema.prisma + migrasi; regenerate. Commit.
2. **Aksi + validasi** — vehicle.actions.ts + vehicle.schemas.ts + unit test. Commit.
3. **Form & halaman master** — vehicle-form, /kendaraan, /kendaraan/[id]. Commit.
4. **Form & halaman unit pelanggan** — customer-vehicle-form, /kendaraan/pelanggan,
   master/pelanggan/[id]/kendaraan. Commit.
5. **Verifikasi penuh + E2E**. Commit final (docs).

## Risiko

- `Vehicle.vehicleVariantId` NOT NULL: aman karena boleh reset.
- Penjualan pakai `CustomerVehicle` yang menyimpan `vehicleId` → tidak berubah;
  yang berubah hanya atribut yang berpindah.
- `transmission`/`vehicleType` di CustomerVehicle dihapus — cek pemakaian di
  `sales.actions.ts` (baris 42, 480) agar tak ada referensi tersisa.
