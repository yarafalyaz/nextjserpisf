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

// ==================== PAYMENT METHOD ====================

export async function createPaymentMethod(formData: FormData) {
  try {
    await requirePermission("create_payment_methods")

    const parsed = parseFormData(createPaymentMethodSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const settings = await getSystemSettings()
    let code = parsed.data.code || null
    if (settings.enableAutoPaymentMethodCode !== false || !code) {
      code = await generateDocumentNumber("MTP", "simple")
    }
    const row = await prisma.paymentMethod.create({
      data: {
        code,
        name: parsed.data.name,
        isActive: parsed.data.isActive ?? false,
      },
    })
    await logActivity("create", "PaymentMethod", row.id, "Membuat metode pembayaran")
    revalidatePath("/master/metode-pembayaran")
    return { success: true, id: row.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPaymentMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updatePaymentMethod(id: number, formData: FormData) {
  try {
    await requirePermission("edit_payment_methods")

    const parsed = parseFormData(updatePaymentMethodSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    await prisma.paymentMethod.update({
      where: { id },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        isActive: parsed.data.isActive ?? false,
      },
    })
    await logActivity("update", "PaymentMethod", id, "Memperbarui metode pembayaran")
    revalidatePath("/master/metode-pembayaran")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePaymentMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deletePaymentMethod(id: number) {
  try {
    await requirePermission("delete_payment_methods")
    await prisma.paymentMethod.delete({ where: { id } })
    await logActivity("delete", "PaymentMethod", id, "Menghapus metode pembayaran")
    revalidatePath("/master/metode-pembayaran")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePaymentMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== SHIPPING METHOD ====================

export async function createShippingMethod(formData: FormData) {
  try {
    await requirePermission("create_shipping_methods")

    const parsed = parseFormData(createShippingMethodSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const settings = await getSystemSettings()
    let code = parsed.data.code || null
    if (settings.enableAutoShippingMethodCode !== false || !code) {
      code = await generateDocumentNumber("MTK", "simple")
    }
    const row = await prisma.shippingMethod.create({
      data: {
        code,
        name: parsed.data.name,
        isActive: parsed.data.isActive ?? false,
      },
    })
    await logActivity("create", "ShippingMethod", row.id, "Membuat metode pengiriman")
    revalidatePath("/master/metode-pengiriman")
    return { success: true, id: row.id }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createShippingMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateShippingMethod(id: number, formData: FormData) {
  try {
    await requirePermission("edit_shipping_methods")

    const parsed = parseFormData(updateShippingMethodSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    await prisma.shippingMethod.update({
      where: { id },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        isActive: parsed.data.isActive ?? false,
      },
    })
    await logActivity("update", "ShippingMethod", id, "Memperbarui metode pengiriman")
    revalidatePath("/master/metode-pengiriman")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateShippingMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteShippingMethod(id: number) {
  try {
    await requirePermission("delete_shipping_methods")
    await prisma.shippingMethod.delete({ where: { id } })
    await logActivity("delete", "ShippingMethod", id, "Menghapus metode pengiriman")
    revalidatePath("/master/metode-pengiriman")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteShippingMethod]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
