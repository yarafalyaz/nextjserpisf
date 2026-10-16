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

export async function createWithholdingTaxType(formData: FormData) {
  try {
    const user = await requirePermission("manage_withholding_tax")

    const parsed = parseFormData(withholdingTaxTypeSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

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
