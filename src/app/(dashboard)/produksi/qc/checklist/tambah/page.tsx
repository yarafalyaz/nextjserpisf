export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { QcChecklistForm } from "../_components/qc-checklist-form"
import { prisma } from "@/lib/db/prisma"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Buat Checklist QC" }

export default async function CreateQcChecklistPage() {
  await requirePermission("manage_qc_checklists")

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
          { label: "Buat" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Checklist QC</h1>
      </div>

      <QcChecklistForm products={products} />
    </div>
  )
}
