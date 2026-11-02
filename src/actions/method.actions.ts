"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import type { PermissionName } from "@/lib/setup/base-data"
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
import { nextSlugWithClient } from "@/lib/utils/slug-db"

// Payment dan shipping method berbagi alur CRUD yang sama; bit yang berbeda
// (permission, schema, model, awalan kode, pesan log, path) jadi konfigurasi.
interface MethodConfig {
  model: any
  table: "payment_methods" | "shipping_methods"
  slugModel: "paymentMethod" | "shippingMethod"
  entity: string
  permissions: { create: PermissionName; edit: PermissionName; delete: PermissionName }
  schemas: { create: typeof createPaymentMethodSchema; update: typeof updatePaymentMethodSchema }
  autoCodeFlag: "enableAutoPaymentMethodCode" | "enableAutoShippingMethodCode"
  codePrefix: "MTP" | "MTK"
  listPath: string
  messages: { create: string; update: string; delete: string }
  actionName: { create: string; update: string; delete: string }
  /** Penghitung dokumen yang menyimpan `code` sebagai string polos. */
  countCodeUsers: (code: string) => Promise<number>
}

/**
 * Dokumen menyimpan kode metode sebagai string polos (tanpa FK): resolusi
 * nama berjalan lewat map code->name (`method.service`) dan print route
 * `findUnique({ where: { code } })`. Hapus baris master atau ganti `code`
 * memutus resolusi itu diam-diam — dokumen lama jatuh ke label statis/kode
 * mentah. Guard sama seperti `deleteUom`: tolak selama kode masih dirujuk.
 */
async function assertMethodCodeUnused(cfg: MethodConfig, code: string): Promise<string | null> {
  const used = await cfg.countCodeUsers(code)
  if (used === 0) return null
  return `${cfg.entity === "PaymentMethod" ? "Metode pembayaran" : "Metode pengiriman"} masih dipakai ${used} dokumen — tidak dapat dihapus atau diganti kodenya. Nonaktifkan saja bila tidak dipakai lagi.`
}

function normalizeMethodKey(value: string): string {
  return value.trim().toLowerCase()
}

async function createMethod(cfg: MethodConfig, formData: FormData, skipPermission = false) {
  try {
    if (!skipPermission) await requirePermission(cfg.permissions.create)

    const parsed = parseFormData(cfg.schemas.create, formData)
    if (!parsed.success) return { success: false, error: parsed.error }

    const settings = await getSystemSettings()
    let code = parsed.data.code || null
    if (settings[cfg.autoCodeFlag] !== false || !code) {
      code = await generateDocumentNumber(cfg.codePrefix, "simple")
    }

    // Nama tanpa @unique DB (code memang @unique): cek findFirst pra-parse
    // di luar tx kalah balapan — dua create konkuren melahirkan dua metode
    // bernama sama (slug bersuffix, bukan blokir) dan kode manual bentrok
    // hanya muncul sebagai P2002 mentah. Cek+create dalam tx bergap-lock
    // (pola createTax putaran 53): nama sama reuse aktif / tolak nonaktif;
    // kode manual bentrok -> tolak menyebut kode tersimpan; kode auto tidak
    // di-cek (lane sekuens atomik DocumentSequence, bentrok = kegagalan
    // nyata yang tak boleh disamarkan jadi reuse). Tabel dari cfg karena
    // raw SQL tak bisa parameter nama tabel; keduanya literal internal.
    const name = parsed.data.name
    const label = cfg.entity === "PaymentMethod" ? "Metode pembayaran" : "Metode pengiriman"
    const manualCode = Boolean(parsed.data.code)
    const result = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        if (cfg.table === "payment_methods") {
          await tx.$executeRaw`SELECT id FROM payment_methods FOR UPDATE`
        } else {
          await tx.$executeRaw`SELECT id FROM shipping_methods FOR UPDATE`
        }
      }
      // cfg.model adalah any; model tx dipilih dengan tipe longgar yang sama
      // supaya union delegate Prisma tak mengunci findMany/create.
      const txModel: any = cfg.table === "payment_methods" ? tx.paymentMethod : tx.shippingMethod
      const candidates: { id: number; name: string; code: string; slug: string | null; isActive: boolean }[] =
        await txModel.findMany({
          select: { id: true, name: true, code: true, slug: true, isActive: true },
        })
      const nameKey = normalizeMethodKey(name)
      const byName = candidates.find((row) => normalizeMethodKey(row.name) === nameKey)
      if (byName) {
        // Reuse idempoten hanya untuk metode AKTIF (putaran 50): metode
        // nonaktif bernama sama tidak boleh terpilih diam-diam oleh
        // quick-add — resolver aktif (method.service) tidak menawarkannya.
        if (!byName.isActive) {
          return { kind: "inactive" as const, name: byName.name }
        }
        return { kind: "reuse" as const, id: byName.id, slug: byName.slug as string | null }
      }
      if (manualCode && code) {
        const codeKey = normalizeMethodKey(code)
        const byCode = candidates.find((row) => normalizeMethodKey(row.code) === codeKey)
        if (byCode) {
          throw new Error(
            `Kode ${label.toLowerCase()} ${byCode.code} sudah dipakai ${label.toLowerCase()} "${byCode.name}"; pakai kode lain.`,
          )
        }
      }
      const row = await txModel.create({
        data: {
          code,
          name,
          slug: await nextSlugWithClient(tx as never, cfg.slugModel, name),
          isActive: parsed.data.isActive ?? false,
        },
      })
      return { kind: "created" as const, id: row.id, slug: row.slug as string | null }
    })
    if (result.kind === "inactive") {
      return { success: false, error: `${label} "${result.name}" sudah ada tetapi nonaktif — aktifkan kembali dari master metode, jangan buat duplikat.` }
    }
    if (result.kind === "reuse") {
      return { success: true, id: result.id, slug: result.slug ?? undefined }
    }
    await logActivity("create", cfg.entity, result.id, cfg.messages.create)
    revalidatePath(cfg.listPath)
    return { success: true, id: result.id, slug: result.slug }
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

    // Putaran 67: klaim nama/kode ternormalisasi homolog createMethod —
    // kontrak putaran 53 menolak duplicate normalized nama di file Metode.
    // Jalur update kini juga harus menolak rename ke namespace file lain;
    // nama dirinya sendiri tidak memblokir. Nilai ulang + guard kode dipakai
    // + update satu transaksi bergap-lock supaya create/update konkuren tak
    // sama-sama lewat (pola tx create putaran 53 baris 80-94).
    const name = parsed.data.name
    const label = cfg.entity === "PaymentMethod" ? "Metode pembayaran" : "Metode pengiriman"
    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        if (cfg.table === "payment_methods") {
          await tx.$executeRaw`SELECT id FROM payment_methods FOR UPDATE`
        } else {
          await tx.$executeRaw`SELECT id FROM shipping_methods FOR UPDATE`
        }
      }
      const txModel: any = cfg.table === "payment_methods" ? tx.paymentMethod : tx.shippingMethod
      const candidates: { id: number; name: string; code: string; slug: string | null; isActive: boolean }[] =
        await txModel.findMany({
          select: { id: true, name: true, code: true, slug: true, isActive: true },
        })
      const nameKey = normalizeMethodKey(name)
      const ownName = candidates.find((row) => row.id !== id && normalizeMethodKey(row.name) === nameKey)
      if (ownName) {
        throw new Error(
          `${label} "${ownName.name}" sudah memakai nama ${JSON.stringify(name.trim())}; pakai nama lain.`,
        )
      }
      const codeKey = normalizeMethodKey(parsed.data.code)
      const ownCode = candidates.find((row) => row.id !== id && normalizeMethodKey(row.code) === codeKey)
      if (ownCode) {
        throw new Error(
          `Kode ${label.toLowerCase()} ${ownCode.code} sudah dipakai ${label.toLowerCase()} "${ownCode.name}"; pakai kode lain.`,
        )
      }

      // Ganti `code` = memutus rujukan string dokumen lama (lihat
      // assertMethodCodeUnused). Rename `name` aman: resolusi membaca nama
      // berjalan dari master. Kode tak berubah -> guard dilewati.
      const existing = await txModel.findUnique({ where: { id }, select: { code: true } })
      if (existing && parsed.data.code !== existing.code) {
        const blocked = await assertMethodCodeUnused(cfg, existing.code)
        if (blocked) throw new Error(blocked)
      }

      return txModel.update({
        where: { id },
        data: {
          updatedBy: Number(user.id),
          code: parsed.data.code,
          name,
          slug: await nextSlugWithClient(tx as never, cfg.slugModel, name, { excludeId: id }),
          isActive: parsed.data.isActive ?? false,
        },
      })
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
    const existing = await cfg.model.findUnique({ where: { id }, select: { code: true } })
    if (existing) {
      const blocked = await assertMethodCodeUnused(cfg, existing.code)
      if (blocked) return { success: false, error: blocked }
    }
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
  table: "payment_methods",
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
  countCodeUsers: async (code) => {
    const [quotations, downPayments, salesPayments, lateFeePayments, vendorPayments] = await Promise.all([
      prisma.quotation.count({ where: { paymentMethod: code } }),
      prisma.downPayment.count({ where: { paymentMethod: code } }),
      prisma.salesPayment.count({ where: { paymentMethod: code } }),
      prisma.salesLateFeePayment.count({ where: { paymentMethod: code } }),
      prisma.vendorPayment.count({ where: { paymentMethod: code } }),
    ])
    return quotations + downPayments + salesPayments + lateFeePayments + vendorPayments
  },
}

const shippingMethodConfig: MethodConfig = {
  model: prisma.shippingMethod,
  table: "shipping_methods",
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
  countCodeUsers: async (code) =>
    prisma.quotation.count({ where: { shippingMethod: code } }),
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
