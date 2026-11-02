"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { withholdingTaxTypeSchema } from "@/lib/validations/withholding.schemas"
import { nextSlugWithClient } from "@/lib/utils/slug-db"
import { checkIdempotency } from "@/lib/utils/idempotency"

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
}, db: Pick<typeof prisma, "account"> = prisma): Promise<string | null> {
  if (v.liabilityAccountId != null) {
    const account = await db.account.findFirst({
      where: { id: v.liabilityAccountId, deletedAt: null, isActive: true },
      select: { id: true },
    })
    if (!account) return "Akun Hutang PPh tidak ditemukan atau tidak aktif"
  }
  if (v.receivableAccountId != null) {
    const account = await db.account.findFirst({
      where: { id: v.receivableAccountId, deletedAt: null, isActive: true },
      select: { id: true },
    })
    if (!account) return "Akun PPh dibayar dimuka tidak ditemukan atau tidak aktif"
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

    // Putaran 70: key + klaim kode ternormalisasi di bawah gap-lock tabel.
    // Versi lama create polos di luar tx: retry meledak P2002 mentah, dan
    // duplikat kode beda-kapital lolos dari pengecekan aplikasi.
    const taxType = await prisma.$transaction(async (tx) => {
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id)
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM withholding_tax_types FOR UPDATE`
      }
      const codeKey = v.code.trim().toLowerCase()
      const siblings = await tx.withholdingTaxType.findMany({ select: { id: true, code: true } })
      if (siblings.some((row) => row.code.trim().toLowerCase() === codeKey)) {
        throw new Error("Kode PPh sudah dipakai jenis potongan lain; pakai kode lain.")
      }
      // Putaran 72: akun PPh dinilai ulang lewat delegate tx.
      const inTxAccountError = await withholdingAccountError(v, tx as never)
      if (inTxAccountError) throw new Error(inTxAccountError)
      return tx.withholdingTaxType.create({
        data: {
          code: v.code.trim(),
          name: v.name.trim(),
          slug: await nextSlugWithClient(tx as never, "withholdingTaxType", v.name.trim()),
          rate: v.rate,
          article: v.article ?? null,
          objectCode: v.objectCode || null,
          liabilityAccountId: v.liabilityAccountId ?? null,
          receivableAccountId: v.receivableAccountId ?? null,
          isActive: v.isActive ?? true,
          createdBy: Number(user.id),
        },
      })
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

    // Putaran 70: klaim kode + slug lewat delegate tx (pola updateMethod);
    // versi lama update polos dengan slug global.
    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM withholding_tax_types FOR UPDATE`
      }
      const codeKey = v.code.trim().toLowerCase()
      const siblings = await tx.withholdingTaxType.findMany({ select: { id: true, code: true } })
      if (siblings.some((row) => row.id !== id && row.code.trim().toLowerCase() === codeKey)) {
        throw new Error("Kode PPh sudah dipakai jenis potongan lain; pakai kode lain.")
      }
      // Putaran 72: akun PPh dinilai ulang lewat delegate tx.
      const inTxAccountError = await withholdingAccountError(v, tx as never)
      if (inTxAccountError) throw new Error(inTxAccountError)
      await tx.withholdingTaxType.update({
        where: { id },
        data: {
          code: v.code.trim(),
          name: v.name.trim(),
          slug: await nextSlugWithClient(tx as never, "withholdingTaxType", v.name.trim(), { excludeId: id }),
          rate: v.rate,
          article: v.article ?? null,
          objectCode: v.objectCode || null,
          liabilityAccountId: v.liabilityAccountId ?? null,
          receivableAccountId: v.receivableAccountId ?? null,
          isActive: v.isActive ?? true,
        },
      })
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
