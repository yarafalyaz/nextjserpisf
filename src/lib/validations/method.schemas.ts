import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

// ==================== PAYMENT METHOD ====================

export const createPaymentMethodSchema = z.object({
  code: optionalString(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  isActive: z.boolean().optional().default(false),
})

export const updatePaymentMethodSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi").max(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  isActive: z.boolean().optional().default(false),
})

// ==================== SHIPPING METHOD ====================

export const createShippingMethodSchema = z.object({
  code: optionalString(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  isActive: z.boolean().optional().default(false),
})

export const updateShippingMethodSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi").max(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  isActive: z.boolean().optional().default(false),
})
