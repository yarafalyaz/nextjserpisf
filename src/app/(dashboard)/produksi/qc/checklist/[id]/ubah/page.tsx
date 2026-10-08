export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { QcChecklistForm } from "../../_components/qc-checklist-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Checklist QC" }

export default async function EditQcChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("manage_qc_checklists")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const checklist = await prisma.qcChecklist.findUnique({
    where: { id: numId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  })
  if (!checklist) notFound()
  if (checklist.status !== "draft") notFound()

  const products = await prisma.product.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "Checklist", href: "/produksi/qc/checklist" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Checklist QC</h1>
      </div>

      <QcChecklistForm
        products={products}
        checklist={{
          id: checklist.id,
          code: checklist.code,
          name: checklist.name,
          checklistType: checklist.checklistType,
          productId: checklist.productId,
          items: checklist.items.map((it) => ({
            itemName: it.itemName,
            method: it.method,
            spec: it.spec,
            isRequired: it.isRequired,
          })),
        }}
      />
    </div>
  )
}
