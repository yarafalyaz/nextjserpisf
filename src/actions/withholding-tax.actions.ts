"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { withholdingTaxTypeSchema } from "@/lib/validations/withholding.schemas"
import { nextSlug } from "@/lib/utils/slug-db"

/**
 * Jenis potongan PPh (Pengaturan → Pajak Potong).
 *
 * Dulu aksi ini menumpang di `fob.actions.ts` — berkas yang isinya soal FOB/Incoterm —
 * sehingga saat modul FOB dihapus, PPh ikut hilang. Sekarang berdiri sendiri sesuai
 * namanya: satu berkas, satu tanggung jawab.
 */

/**
 * Akun PPh adalah Int polos tanpa FK DB — ID fiktif lolos simpan lalu hook
 * akuntansi gagal berisik saat posting pembayaran/tagihan ber-PPh. Cek ada
 * (dan belum terhapus) pra-tulis, pola master.actions createBank.
 */
async function withholdingAccountError(v: {
  liabilityAccountId?: number
  receivableAccountId?: number
}): Promise<string | null> {
  if (v.liabilityAccountId != null) {
    const account = await prisma.account.findFirst({
      where: { id: v.liabilityAccountId, deletedAt: null },
      select: { id: true },
    })
    if (!account) return "Akun Hutang PPh tidak ditemukan"
  }
  if (v.receivableAccountId != null) {
    const account = await prisma.account.findFirst({
      where: { id: v.receivableAccountId, deletedAt: null },
      select: { id: true },
    })
    if (!account) return "Akun PPh dibayar dimuka tidak ditemukan"
  }
  return null
}

export async function createWithholdingTaxType(formData: FormData) {
  try {
    const user = await requirePermission("manage_withholding_tax")

    const parsed = parseFormData(withholdingTaxTypeSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const accountError = await withholdingAccountError(v)
    if (accountError) return { success: false, error: accountError }

    const taxType = await prisma.withholdingTaxType.create({
      data: {
        code: v.code.trim(),
        name: v.name.trim(),
        slug: await nextSlug("withholdingTaxType", v.name.trim()),
        rate: v.rate,
        liabilityAccountId: v.liabilityAccountId ?? null,
        receivableAccountId: v.receivableAccountId ?? null,
        isActive: v.isActive ?? true,
        createdBy: Number(user.id),
      },
    })

    revalidatePath("/pengaturan/pajak-potong")
    await logActivity("create", "WithholdingTaxType", taxType.id, "Membuat jenis potongan PPh")
    return { success: true, id: taxType.id }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    console.error("[createWithholdingTaxType]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e) }
  }
}

export async function updateWithholdingTaxType(id: number, formData: FormData) {
  try {
    await requirePermission("manage_withholding_tax")

    const parsed = parseFormData(withholdingTaxTypeSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    const accountError = await withholdingAccountError(v)
    if (accountError) return { success: false, error: accountError }

    await prisma.withholdingTaxType.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: v.name.trim(),
        slug: await nextSlug("withholdingTaxType", v.name.trim(), { excludeId: id }),
        rate: v.rate,
        liabilityAccountId: v.liabilityAccountId ?? null,
        receivableAccountId: v.receivableAccountId ?? null,
        isActive: v.isActive ?? true,
      },
    })

    revalidatePath("/pengaturan/pajak-potong")
    await logActivity("update", "WithholdingTaxType", id, "Memperbarui jenis potongan PPh")
    return { success: true, id }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateWithholdingTaxType]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e) }
  }
}
