"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
  createShippingMethodSchema,
  updateShippingMethodSchema,
} from "@/lib/validations/method.schemas"
import { nextSlug } from "@/lib/utils/slug-db"

// Payment dan shipping method berbagi alur CRUD yang sama; bit yang berbeda
// (permission, schema, model, awalan kode, pesan log, path) jadi konfigurasi.
interface MethodConfig {
  model: any
  slugModel: "paymentMethod" | "shippingMethod"
  entity: string
  permissions: { create: string; edit: string; delete: string }
  schemas: { create: typeof createPaymentMethodSchema; update: typeof updatePaymentMethodSchema }
  autoCodeFlag: "enableAutoPaymentMethodCode" | "enableAutoShippingMethodCode"
  codePrefix: "MTP" | "MTK"
  listPath: string
  messages: { create: string; update: string; delete: string }
  actionName: { create: string; update: string; delete: string }
}

async function createMethod(cfg: MethodConfig, formData: FormData, skipPermission = false) {
  try {
    if (!skipPermission) await requirePermission(cfg.permissions.create)

    const rawName = (formData.get("name") as string | null)?.trim()
    if (rawName) {
      const existing = await cfg.model.findFirst({ where: { name: rawName }, select: { id: true, slug: true } })
      if (existing) return { success: true, id: existing.id, slug: existing.slug ?? undefined }
    }

    const parsed = parseFormData(cfg.schemas.create, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const settings = await getSystemSettings()
    let code = parsed.data.code || null
    if (settings[cfg.autoCodeFlag] !== false || !code) {
      code = await generateDocumentNumber(cfg.codePrefix, "simple")
    }
    const row = await cfg.model.create({
      data: {
        code,
        name: parsed.data.name,
        slug: await nextSlug(cfg.slugModel, parsed.data.name),
        isActive: parsed.data.isActive ?? false,
      },
    })
    await logActivity("create", cfg.entity, row.id, cfg.messages.create)
    revalidatePath(cfg.listPath)
    return { success: true, id: row.id, slug: row.slug }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error(`[${cfg.actionName.create}]`, getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

async function updateMethod(cfg: MethodConfig, id: number, formData: FormData, user: { id: string | number }) {
  try {

    const parsed = parseFormData(cfg.schemas.update, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    await cfg.model.update({
      where: { id },
      data: {
        updatedBy: Number(user.id),
        code: parsed.data.code,
        name: parsed.data.name,
        slug: await nextSlug(cfg.slugModel, parsed.data.name, { excludeId: id }),
        isActive: parsed.data.isActive ?? false,
      },
    })
    await logActivity("update", cfg.entity, id, cfg.messages.update)
    revalidatePath(cfg.listPath)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error(`[${cfg.actionName.update}]`, getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

async function deleteMethod(cfg: MethodConfig, id: number, skipPermission = false) {
  try {
    if (!skipPermission) await requirePermission(cfg.permissions.delete)
    await cfg.model.delete({ where: { id } })
    await logActivity("delete", cfg.entity, id, cfg.messages.delete)
    revalidatePath(cfg.listPath)
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error(`[${cfg.actionName.delete}]`, getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

const paymentMethodConfig: MethodConfig = {
  model: prisma.paymentMethod,
  slugModel: "paymentMethod",
  entity: "PaymentMethod",
  permissions: {
    create: "create_payment_methods",
    edit: "edit_payment_methods",
    delete: "delete_payment_methods",
  },
  schemas: { create: createPaymentMethodSchema, update: updatePaymentMethodSchema },
  autoCodeFlag: "enableAutoPaymentMethodCode",
  codePrefix: "MTP",
  listPath: "/master/metode-pembayaran",
  messages: {
    create: "Membuat metode pembayaran",
    update: "Memperbarui metode pembayaran",
    delete: "Menghapus metode pembayaran",
  },
  actionName: {
    create: "createPaymentMethod",
    update: "updatePaymentMethod",
    delete: "deletePaymentMethod",
  },
}

const shippingMethodConfig: MethodConfig = {
  model: prisma.shippingMethod,
  slugModel: "shippingMethod",
  entity: "ShippingMethod",
  permissions: {
    create: "create_shipping_methods",
    edit: "edit_shipping_methods",
    delete: "delete_shipping_methods",
  },
  schemas: { create: createShippingMethodSchema, update: updateShippingMethodSchema },
  autoCodeFlag: "enableAutoShippingMethodCode",
  codePrefix: "MTK",
  listPath: "/master/metode-pengiriman",
  messages: {
    create: "Membuat metode pengiriman",
    update: "Memperbarui metode pengiriman",
    delete: "Menghapus metode pengiriman",
  },
  actionName: {
    create: "createShippingMethod",
    update: "updateShippingMethod",
    delete: "deleteShippingMethod",
  },
}

// ==================== PAYMENT METHOD ====================

export async function createPaymentMethod(formData: FormData) {
  try {
    await requirePermission("create_payment_methods")
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPaymentMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
  return createMethod(paymentMethodConfig, formData, true)
}

export async function updatePaymentMethod(id: number, formData: FormData) {
  let user: { id: string | number }
  try {
    user = await requirePermission("edit_payment_methods")
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePaymentMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
  return updateMethod(paymentMethodConfig, id, formData, user)
}

export async function deletePaymentMethod(id: number) {
  try {
    await requirePermission("delete_payment_methods")
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePaymentMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
  return deleteMethod(paymentMethodConfig, id, true)
}

// ==================== SHIPPING METHOD ====================

export async function createShippingMethod(formData: FormData) {
  try {
    await requirePermission("create_shipping_methods")
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createShippingMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
  return createMethod(shippingMethodConfig, formData, true)
}

export async function updateShippingMethod(id: number, formData: FormData) {
  let user: { id: string | number }
  try {
    user = await requirePermission("edit_shipping_methods")
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateShippingMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
  return updateMethod(shippingMethodConfig, id, formData, user)
}

export async function deleteShippingMethod(id: number) {
  try {
    await requirePermission("delete_shipping_methods")
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteShippingMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
  return deleteMethod(shippingMethodConfig, id, true)
}
