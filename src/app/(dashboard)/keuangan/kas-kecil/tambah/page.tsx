export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PettyCashForm } from "@/components/forms/petty-cash-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Kas Kecil" }

export default async function CreatePettyCashPage() {
  await requirePermission("create_petty_cash")

  const [accounts, projects, vendors, categories] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, documentNo: true },
    }),
    prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, label: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Transaksi Kas Kecil</h1>
      </div>
      <PettyCashForm accounts={accounts} projects={projects} vendors={vendors} categories={categories} />
    </div>
  )
}
