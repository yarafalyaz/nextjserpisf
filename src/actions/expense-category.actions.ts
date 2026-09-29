"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"

export async function createExpenseCategory(formData: FormData) {
  await requirePermission("manage_expense_categories")

  const name = (formData.get("name") as string)?.trim()
  const label = (formData.get("label") as string)?.trim()
  const sortOrder = Number(formData.get("sortOrder")) || 0

  if (!name || !label) return { success: false, error: "Nama dan label wajib diisi" }

  try {
    await prisma.expenseCategory.create({ data: { name, label, sortOrder } })
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

  const name = (formData.get("name") as string)?.trim()
  const label = (formData.get("label") as string)?.trim()
  const sortOrder = Number(formData.get("sortOrder")) || 0
  const isActive = formData.get("isActive") === "on"

  if (!name || !label) return { success: false, error: "Nama dan label wajib diisi" }

  try {
    await prisma.expenseCategory.update({
      where: { id },
      data: { name, label, sortOrder, isActive },
    })
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

  try {
    await prisma.expenseCategory.delete({ where: { id } })
    revalidatePath("/master/kategori-pengeluaran")
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Gagal menghapus" }
  }
}
