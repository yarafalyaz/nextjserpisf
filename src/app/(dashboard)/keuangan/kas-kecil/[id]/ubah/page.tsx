export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PettyCashForm } from "@/components/forms/petty-cash-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Kas Kecil" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_petty_cash")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.pettyCash.findUnique({
    where: { id: numId },
  })

  if (!data) notFound()

  const [accounts, projects, vendors, categories] = await Promise.all([
    prisma.account.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } }),
    prisma.project.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, documentNo: true } }),
    prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, label: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan/kas-kecil" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <PettyCashForm pettyCash={{ id: data.id, date: data.date.toISOString().split('T')[0], type: data.type, description: data.description, amount: Number(data.amount), accountId: data.accountId ?? 0, projectId: data.projectId, vendorId: data.vendorId, categoryId: data.categoryId }} accounts={accounts} projects={projects} vendors={vendors} categories={categories} />
    </div>
  )
}
