"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/services/activity-log.service"
import { nextSlug } from "@/lib/utils/slug-db"
import { parseFormData } from "@/lib/validations/parse-form"
import { expenseCategorySchema } from "@/lib/validations/finance.schemas"

export async function createExpenseCategory(formData: FormData) {
  await requirePermission("manage_expense_categories")

  const parsed = parseFormData(expenseCategorySchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const { name, label, sortOrder } = parsed.data

  try {
    const created = await prisma.expenseCategory.create({ data: { name, label, sortOrder, slug: await nextSlug("expenseCategory", name) } })
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
    await prisma.expenseCategory.update({
      where: { id },
      data: { name, label, sortOrder, isActive, slug: await nextSlug("expenseCategory", name, { excludeId: id }) },
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

  // Check if any expenses use this category
  const count = await prisma.expense.count({ where: { categoryId: id } })
  if (count > 0) {
    return { success: false, error: `Kategori ini digunakan oleh ${count} pengeluaran. Nonaktifkan saja.` }
  }

  // ExpenseCategory juga dirujuk PettyCash.categoryId (relasi opsional tanpa
  // onDelete eksplisit di skema -> SetNull): hapus mentah diam-diam melepas
  // kategori dari transaksi kas kecil, mengaburkan atribusi HPP proyek/laporan
  // kas kecil per kategori. Tolak selama masih dipakai kas kecil.
  const pettyCount = await prisma.pettyCash.count({ where: { categoryId: id } })
  if (pettyCount > 0) {
    return { success: false, error: `Kategori ini digunakan oleh ${pettyCount} transaksi kas kecil. Nonaktifkan saja.` }
  }

  try {
    await prisma.expenseCategory.delete({ where: { id } })
    await logActivity("delete", "ExpenseCategory", id, `Menghapus kategori pengeluaran #${id}`)
    revalidatePath("/master/kategori-pengeluaran")
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Gagal menghapus" }
  }
}
