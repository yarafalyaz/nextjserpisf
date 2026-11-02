"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { nextSlugWithClient } from "@/lib/utils/slug-db"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { parseFormData } from "@/lib/validations/parse-form"
import { expenseCategorySchema } from "@/lib/validations/finance.schemas"

export async function createExpenseCategory(formData: FormData) {
  const user = await requirePermission("manage_expense_categories")

  const parsed = parseFormData(expenseCategorySchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { name, label, sortOrder } = parsed.data

  try {
    // Putaran 70: key + klaim nama ternormalisasi di bawah gap-lock tabel
    // (MariaDB tidak punya partial-unique): retry identik tidak lagi
    // melahirkan kategori kembar atau meledak P2002 mentah.
    const created = await prisma.$transaction(async (tx) => {
      await checkIdempotency(formData.get("idempotencyKey") as string | null, tx, user.id)
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM expense_categories FOR UPDATE`
      }
      const key = name.trim().toLowerCase()
      const siblings = await tx.expenseCategory.findMany({ select: { id: true, name: true } })
      if (siblings.some((row) => row.name.trim().toLowerCase() === key)) {
        throw new Error("Nama kategori sudah ada")
      }
      return tx.expenseCategory.create({
        data: { name, label, sortOrder, slug: await nextSlugWithClient(tx as never, "expenseCategory", name) },
      })
    })
    await logActivity("create", "ExpenseCategory", created.id, `Membuat kategori pengeluaran ${label}`)
    revalidatePath("/master/kategori-pengeluaran")
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan"
    if (msg.includes("Unique constraint")) return { success: false, error: "Nama kategori sudah ada" }
    return { success: false, error: msg }
  }
}

export async function updateExpenseCategory(id: number, formData: FormData) {
  await requirePermission("manage_expense_categories")

  const parsed = parseFormData(expenseCategorySchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { name, label, sortOrder, isActive } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      // Putaran 70: klaim nama ternormalisasi + slug lewat delegate tx
      // (pola updateMethod); versi lama menghitung slug global lalu update
      // polos, sehingga rename konkuren bertabrakan di name/slug @unique.
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM expense_categories FOR UPDATE`
      }
      const key = name.trim().toLowerCase()
      const siblings = await tx.expenseCategory.findMany({ select: { id: true, name: true } })
      if (siblings.some((row) => row.id !== id && row.name.trim().toLowerCase() === key)) {
        throw new Error("Nama kategori sudah ada")
      }
      await tx.expenseCategory.update({
        where: { id },
        data: { name, label, sortOrder, isActive, slug: await nextSlugWithClient(tx as never, "expenseCategory", name, { excludeId: id }) },
      })
    })
    await logActivity("update", "ExpenseCategory", id, `Memperbarui kategori pengeluaran ${label}`)
    revalidatePath("/master/kategori-pengeluaran")
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan"
    if (msg.includes("Unique constraint")) return { success: false, error: "Nama kategori sudah ada" }
    return { success: false, error: msg }
  }
}

export async function deleteExpenseCategory(id: number) {
  await requirePermission("manage_expense_categories")

  try {
    // Guard + delete dalam SATU tx berkunci baris kategori (pola
    // deleteCostCenter AUD-COSTCENTER-01): hitung di luar tx lalu delete
    // membiarkan dokumen yang mengaitkan diri di antara dua fase lolos —
    // relasi opsional SetNull lalu melepas kategori dari dokumen baru itu
    // diam-diam. Kunci baris kategori menahan penulis baru (FK writers
    // mengambil shared lock baris induk) sampai hitung+delete selesai.
    const outcome = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM expense_categories WHERE id = ${id} FOR UPDATE`
      }
      // Check if any expenses use this category
      const count = await tx.expense.count({ where: { categoryId: id } })
      if (count > 0) {
        return { usedBy: `Kategori ini digunakan oleh ${count} pengeluaran. Nonaktifkan saja.` }
      }

      // ExpenseCategory juga dirujuk PettyCash.categoryId (relasi opsional tanpa
      // onDelete eksplisit di skema -> SetNull): hapus mentah diam-diam melepas
      // kategori dari transaksi kas kecil, mengaburkan atribusi HPP proyek/laporan
      // kas kecil per kategori. Tolak selama masih dipakai kas kecil.
      const pettyCount = await tx.pettyCash.count({ where: { categoryId: id } })
      if (pettyCount > 0) {
        return { usedBy: `Kategori ini digunakan oleh ${pettyCount} transaksi kas kecil. Nonaktifkan saja.` }
      }

      await tx.expenseCategory.delete({ where: { id } })
      return { deleted: true as const }
    })
    if ("usedBy" in outcome) {
      return { success: false, error: outcome.usedBy }
    }
    await logActivity("delete", "ExpenseCategory", id, `Menghapus kategori pengeluaran #${id}`)
    revalidatePath("/master/kategori-pengeluaran")
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Gagal menghapus" }
  }
}
