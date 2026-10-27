import { z } from "zod"
import "./zod-locale";

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()

const optionalBool = z.boolean().optional()

// Vehicle production year: bounded both sides. The previous `optionalNum(1900)`
// had no upper bound, so a tampered/typo'd year like 99999 was accepted and
// then fed nonsense into age / warranty-expiry math. Cap at next calendar year
// (new model-year vehicles are sold slightly ahead of the calendar).
const yearField = z.coerce
  .number()
  .int()
  .min(1900, "Tahun tidak valid")
  .max(new Date().getFullYear() + 1, "Tahun tidak valid")
  .optional()

// ==================== Vehicle Brand ====================

export const vehicleBrandSchema = z.object({
  name: requiredStr("Nama merek wajib diisi"),
})

// ==================== Vehicle Model ====================

export const vehicleModelSchema = z.object({
  name: requiredStr("Nama model wajib diisi"),
  vehicleBrandId: requiredId("Merek kendaraan"),
})

// ==================== Vehicle Variant ====================

export const vehicleVariantSchema = z.object({
  name: requiredStr("Nama varian wajib diisi"),
  vehicleModelId: requiredId("Model kendaraan"),
  drivetrain: optionalStr(100),
  transmission: optionalStr(100),
})

// ==================== Vehicle (tipe katalog) ====================
//
// `Vehicle` is now the CATALOG TYPE master, sitting under `VehicleVariant`.
// Physical-unit attributes (plate, color, chassis, engine) live on
// `CustomerVehicle`, not here. A type must always reference a variant, plus an
// optional human label and model year.

export const vehicleSchema = z.object({
  variantId: requiredId("Varian kendaraan"),
  name: optionalStr(150),
  year: yearField,
})

// ==================== Customer Vehicle (unit milik pelanggan) ====================

export const customerVehicleSchema = z.object({
  customerId: requiredId("Pelanggan"),
  variantId: optionalId,
  vehicleId: optionalId,
  kendaraanId: optionalId,
  plateNumber: optionalStr(20),
  color: optionalStr(50),
  year: yearField,
  chassisNumber: optionalStr(100),
  engineNumber: optionalStr(100),
  isActive: optionalBool,
  notes: optionalStr(1000),
})

// ==================== Jadwal Servis Berikutnya (F-2026-10-25-021-S) ====================
//
// Pencatatan manual staf berizin (BR-SV-08): tanggal dan/atau km target,
// keduanya boleh kosong = kosongkan jadwal. Tanggal bentuk YYYY-MM-DD
// (hari kalender WIB, dikonversi aksi via wibDateToUtcMidnight).
// Km target <= odometer terakhir BUKAN ditolak skema: aksi membandingkan
// dengan lastOdometerKm tersimpan dan menolak berisik (AC-SV-F3) supaya
// pesan menyebut angka odometer nyata.

const optionalServiceDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal servis berikutnya tidak valid")
  .optional()
  .or(z.literal("").transform(() => undefined))

const optionalServiceKm = z.coerce
  .number()
  .int("Km servis berikutnya harus bilangan bulat")
  .positive("Km servis berikutnya harus lebih dari 0")
  .optional()

export const serviceScheduleSchema = z.object({
  nextServiceDate: optionalServiceDate,
  nextServiceKm: optionalServiceKm,
  nextServiceNote: optionalStr(1000),
})
