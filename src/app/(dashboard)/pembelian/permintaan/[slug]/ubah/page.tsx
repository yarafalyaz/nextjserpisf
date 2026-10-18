export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PurchaseRequestForm } from "@/components/forms/purchase-request-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Permintaan Pembelian" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_purchase_requests")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.purchaseRequest.findFirst({ where: { slug: s, ...where }, include: { items: true } }),
      byId: (id, where) =>
        prisma.purchaseRequest.findUnique({ where: { id, ...where }, include: { items: true } }),
    },
  )

  const [items, employees, vendors] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unitOfMeasure: true },
    }),
    prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pembelian", href: "/pembelian" },
        { label: "Permintaan", href: "/pembelian/permintaan" },
        { label: data.documentNo },
        { label: "Ubah" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Permintaan Pembelian</h1>
      </div>
      <PurchaseRequestForm request={{
        id: data.id,
        title: data.title,
        date: data.date.toISOString().split("T")[0],
        requestedBy: data.requestedBy != null ? String(data.requestedBy) : null,
        vendorId: data.vendorId,
        notes: data.notes,
        requestDate: data.requestDate?.toISOString().split("T")[0] ?? null,
        description: data.description,
        items: data.items.map((item) => ({ itemId: item.itemId, qty: Number(item.qty), notes: item.notes ?? "" })),
      }} items={items} employees={employees} vendors={vendors} />
    </div>
  )
}
