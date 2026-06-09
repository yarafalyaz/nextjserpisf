import { z } from "zod"

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()

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
})

// ==================== Asset Brand ====================

export const assetBrandSchema = z.object({
  name: requiredStr("Nama merek wajib diisi"),
})

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
