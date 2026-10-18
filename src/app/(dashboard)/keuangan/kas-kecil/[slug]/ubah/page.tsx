export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PettyCashForm } from "@/components/forms/petty-cash-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Kas Kecil" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_petty_cash")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.pettyCash.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.pettyCash.findUnique({ where: { id } }),
    },
  )

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
  { label: "Kas Kecil", href: "/keuangan/kas-kecil" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <PettyCashForm pettyCash={{ id: data.id, date: data.date.toISOString().split('T')[0], type: data.type, description: data.description, amount: Number(data.amount), accountId: data.accountId ?? 0, projectId: data.projectId, vendorId: data.vendorId, categoryId: data.categoryId }} accounts={accounts} projects={projects} vendors={vendors} categories={categories} />
    </div>
  )
}
