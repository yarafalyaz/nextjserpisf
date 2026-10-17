import { z } from "zod"

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

const optionalDate = z.string().optional()

const requiredDate = (field: string) =>
  z.string().min(1, `${field} wajib diisi`)

// ==================== Asset Category ====================

export const assetCategorySchema = z.object({
  name: requiredStr("Nama kategori wajib diisi"),
  code: optionalStr(50),
  depreciationRate: optionalNum(0),
  usefulLife: optionalNum(0),
  taxDepreciationRate: optionalNum(0),
  taxUsefulLife: optionalNum(0),
  assetAccountId: optionalRefId,
  accumulatedDepreciationAccountId: optionalRefId,
  depreciationExpenseAccountId: optionalRefId,
  gainLossAccountId: optionalRefId,
})

// ==================== Asset Brand ====================

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
  purchaseDate: optionalDate,
  purchasePrice: optionalNum(0),
  residualValue: optionalNum(0),
  depreciationMethod: optionalStr(50),
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
