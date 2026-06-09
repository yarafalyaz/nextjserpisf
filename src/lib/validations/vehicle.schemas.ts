import { z } from "zod"

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.number().int().positive().optional()

const optionalNum = (min?: number) => {
  const base = min !== undefined ? z.number().min(min) : z.number()
  return base.optional()
}

const optionalBool = z.boolean().optional()

// ==================== Vehicle Brand ====================

export const vehicleBrandSchema = z.object({
  name: requiredStr("Nama merek wajib diisi"),
})

// ==================== Vehicle Model ====================

export const vehicleModelSchema = z.object({
  name: requiredStr("Nama model wajib diisi"),
  brandId: requiredId("Merek kendaraan"),
})

// ==================== Vehicle Variant ====================

export const vehicleVariantSchema = z.object({
  name: requiredStr("Nama varian wajib diisi"),
  modelId: requiredId("Model kendaraan"),
  drivetrain: optionalStr(100),
  transmission: optionalStr(100),
})

// ==================== Vehicle ====================

export const vehicleSchema = z.object({
  plateNo: requiredStr("Nomor plat wajib diisi", 20),
  variantId: optionalId,
  modelId: optionalId,
  year: optionalNum(1900),
  color: optionalStr(50),
  customerId: optionalId,
})

// ==================== Customer Vehicle ====================

export const customerVehicleSchema = z.object({
  customerId: requiredId("Pelanggan"),
  variantId: optionalId,
  vehicleId: optionalId,
  kendaraanId: optionalId,
  licensePlate: optionalStr(20),
  year: optionalNum(1900),
  color: optionalStr(50),
  vehicleType: optionalStr(100),
  transmission: optionalStr(100),
  chassisNumber: optionalStr(100),
  engineNumber: optionalStr(100),
  isActive: optionalBool,
  notes: optionalStr(1000),
})
