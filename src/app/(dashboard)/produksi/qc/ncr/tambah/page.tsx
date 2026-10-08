export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { NonconformanceForm } from "../_components/nonconformance-form"
import { prisma } from "@/lib/db/prisma"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Buat NCR" }

export default async function CreateNonconformancePage() {
  await requirePermission("manage_nonconformances")

  const inspections = await prisma.qcInspection.findMany({
    where: { status: "failed" },
    select: { id: true, documentNo: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "NCR", href: "/produksi/qc/ncr" },
          { label: "Buat" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Nonconformance (NCR)</h1>
      </div>

      <NonconformanceForm inspections={inspections} />
    </div>
  )
}
