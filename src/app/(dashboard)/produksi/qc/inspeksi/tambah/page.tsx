export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { QcInspectionForm } from "../_components/qc-inspection-form"
import { prisma } from "@/lib/db/prisma"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Catat Inspeksi QC" }

export default async function CreateQcInspectionPage() {
  await requirePermission("manage_qc_inspections")

  const checklists = await prisma.qcChecklist.findMany({
    where: { status: "released", isActive: true },
    select: {
      id: true,
      name: true,
      checklistType: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, itemName: true, method: true, spec: true, isRequired: true },
      },
    },
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
          { label: "Inspeksi", href: "/produksi/qc/inspeksi" },
          { label: "Catat" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Catat Inspeksi QC</h1>
      </div>

      {checklists.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada checklist yang dirilis. Rilis checklist terlebih dahulu di menu Checklist QC.
        </p>
      ) : (
        <QcInspectionForm checklists={checklists} />
      )}
    </div>
  )
}
