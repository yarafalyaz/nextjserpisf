import { z } from "zod"
import { dateOnly } from "@/lib/validations/finance.schemas"
import {
  isFiscalGroupCode,
} from "@/lib/finance/asset-fiscal-groups"
import { DEPRECIATION_METHODS } from "@/lib/finance/asset-depreciation"

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()
// Optional account/relation selector from a <select> that may submit "" when
// nothing is chosen (empty string would coerce to 0 and fail .positive()).
const optionalRefId = z
  .union([z.literal(""), z.coerce.number().int().positive()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v))

const optionalNum = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

// Tanggal dokumen aset wajib YYYY-MM-DD hari kalender WIB yang benar-benar ada:
// `z.string().optional()` menerima "2026-02-30"/bebas dan `new Date(...)` menggulirkannya
// diam-diam ke tanggal lain bergantung zona waktu proses. `dateOnly` menolak tanggal
// tak-kalender; aksi mengonversi via `wibDateToUtcMidnight`.
const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
)

const requiredDate = (_field: string) => dateOnly

// ==================== Asset Category ====================

export const assetCategorySchema = z.object({
  name: requiredStr("Nama kategori wajib diisi"),
  code: optionalStr(50),
  depreciationRate: optionalNum(0),
  usefulLife: optionalNum(0),
  taxDepreciationRate: optionalNum(0),
  taxUsefulLife: optionalNum(0),
  // Kelompok fiskal PMK 72/2023 (vonis F-2026-10-22-062-V Putusan 2): kode di
  // luar daftar statutoris ditolak; kosong = belum dinyatakan (bukan tebakan).
  taxGroupCode: z
    .string()
    .refine((v) => isFiscalGroupCode(v), "Kelompok fiskal tidak dikenal")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // parseFormData sudah mengubah "true"/"false" FormData menjadi boolean dan
  // string kosong menjadi undefined, jadi di sini cukup boolean opsional.
  taxTypeListed: z.boolean().optional(),
  taxDjpDetermination: z.boolean().optional(),
  assetAccountId: optionalRefId,
  accumulatedDepreciationAccountId: optionalRefId,
  depreciationExpenseAccountId: optionalRefId,
  gainLossAccountId: optionalRefId,
})

// ==================== Asset Brand ====================

export const assetGroupSchema = z.object({
  // Model `AssetGroup` hanya punya `name` (tanpa kode/slug/deskripsi), jadi skemanya
  // memang sesederhana ini — bukan disederhanakan supaya cepat.
  name: requiredStr("Nama grup aset wajib diisi"),
})

export const assetBrandSchema = z.object({
  name: requiredStr("Nama merek wajib diisi"),
  // Tipe/model di bawah merek ini, satu per baris (koma juga diterima). Kolom ini
  // adalah satu-satunya jalur tulis `asset_brand_models`: sebelumnya tabel itu tidak
  // punya penulis sama sekali, sehingga tipe aset per merek tidak bisa dicatat.
  models: z
    .string({ error: "Daftar tipe tidak valid" })
    .optional()
    .transform((raw) => parseBrandModelNames(raw)),
})

/**
 * Memecah masukan teks menjadi daftar nama tipe: baris baru atau koma sebagai
 * pemisah, spasi dipangkas, baris kosong dibuang, duplikat (tanpa peduli besar
 * kecil huruf) dibuang, dan panjang tiap nama dibatasi.
 *
 * Dipisah dari skema supaya bisa diuji langsung tanpa lewat FormData.
 */
export function parseBrandModelNames(raw: string | undefined | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[\n,]+/)) {
    const name = part.trim().slice(0, 100)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= 60) break
  }
  return out
}

// ==================== Asset Transfer ====================

export const assetTransferSchema = z.object({
  assetId: requiredId("Aset"),
  fromLocation: optionalStr(200),
  toLocation: requiredStr("Lokasi tujuan wajib diisi", 200),
  fromEmployeeId: optionalId,
  toEmployeeId: optionalId,
  transferDate: requiredDate("Tanggal transfer"),
  notes: optionalStr(1000),
})

// ==================== Asset ====================

export const assetSchema = z.object({
  name: requiredStr("Nama aset wajib diisi"),
  code: optionalStr(100),
  categoryId: optionalId,
  // `assetBrandId` dan `groupId` WAJIB ada di sini: zod membuang kunci yang tidak
  // dideklarasikan, sehingga pilihan "Merek" di form aset selama ini sampai ke
  // aksi lalu DIBUANG DIAM-DIAM — `Asset.assetBrandId` tidak pernah terisi dan
  // halaman aset selalu menampilkan "-" walau pengguna memilih mereknya.
  // Catatan nama: field-nya `assetBrandId` (bukan `brandId`).
  assetBrandId: optionalId,
  // Tipe/model di bawah merek terpilih (`asset_brand_models`). Opsional: merek
  // tanpa tipe tetap sah, dan validasi kecocokan model↔merek ada di aksi
  // (model harus milik merek yang dipilih) karena skema tidak kenal relasinya.
  assetBrandModelId: optionalId,
  groupId: optionalId,
  purchaseDate: optionalDate,
  purchasePrice: optionalNum(0),
  residualValue: optionalNum(0),
  // Parameter terbekukan per aset (vonis F-2026-10-23-118-V Putusan 2a):
  // UOP wajib total estimasi unit + satuan bernama; SYD wajib masa manfaat
  // bulan integer. Kosong pada metode analitis = mesin menolak berisik
  // (missing-parameter), bukan ditebak dari kategori fiskal.
  totalEstimatedUnits: optionalNum(0),
  productionUnitName: optionalStr(50),
  usefulLifeMonths: z.coerce
    .number()
    .int("Masa manfaat harus bilangan bulat bulan")
    .positive("Masa manfaat harus lebih dari 0")
    .optional(),
  // Metode penyusutan hanya dari daftar terdaftar (vonis F-2026-10-22-062-V
  // Putusan 2): string bebas di luar daftar ditolak di sini, dan metode
  // analitis NON-GL ditolak lagi oleh cron saat akan memposting jurnal.
  depreciationMethod: z
    .enum(DEPRECIATION_METHODS, {
      error: "Metode penyusutan tidak dikenal",
    })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  location: optionalStr(200),
  status: optionalStr(50),
  description: optionalStr(1000),
})

// ==================== Asset Disposal ====================

export const assetDisposalSchema = z.object({
  assetId: requiredId("Aset"),
  proceeds: optionalNum(0),
  disposalDate: optionalDate,
  reason: optionalStr(500),
})

// ==================== Asset Usage Record (F-118-V Putusan 2b) ====================

/** Dokumen unit aktual bernama per (aset, masa) untuk metode UOP. */
export const assetUsageRecordSchema = z.object({
  assetId: requiredId("Aset"),
  periodYear: z.coerce
    .number({ error: "Tahun masa wajib diisi" })
    .int("Tahun masa harus bilangan bulat")
    .min(2000, "Tahun masa tidak sah")
    .max(2100, "Tahun masa tidak sah"),
  periodMonth: z.coerce
    .number({ error: "Bulan masa wajib diisi" })
    .int("Bulan masa harus bilangan bulat")
    .min(1, "Bulan masa 1-12")
    .max(12, "Bulan masa 1-12"),
  actualUnits: z.coerce
    .number({ error: "Unit aktual wajib diisi" })
    .min(0, "Unit aktual tidak boleh negatif"),
  sourceName: requiredStr("Nama dokumen sumber wajib diisi", 200),
  sourceRef: optionalStr(200),
})
