export const dynamic = "force-dynamic"

import { ClipboardCheck, ListChecks, AlertTriangle } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Quality Control" }

const qcModules: ModuleItem[] = [
  { label: "Checklist QC", href: "/produksi/qc/checklist", icon: ListChecks, desc: "Master checklist inspeksi ber-versi", permission: "view_qc" },
  { label: "Inspeksi", href: "/produksi/qc/inspeksi", icon: ClipboardCheck, desc: "Catatan inspeksi penerimaan/proses/akhir", permission: "view_qc" },
  { label: "Nonconformance (NCR)", href: "/produksi/qc/ncr", icon: AlertTriangle, desc: "Cacat, rework, dan penyelesaian", permission: "view_qc" },
]

export default async function QcPage() {
  const user = await requirePermission("view_qc")
  const isSuperAdmin = user.roles.includes("super_admin")

  const [checklistCount, inspectionCount, openNcrCount] = await Promise.all([
    prisma.qcChecklist.count(),
    prisma.qcInspection.count(),
    prisma.nonconformance.count({ where: { status: { in: ["open", "rework", "rejected"] } } }),
  ])

  const stats = [
    { label: "Checklist", value: checklistCount },
    { label: "Inspeksi", value: inspectionCount },
    { label: "NCR terbuka", value: openNcrCount },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Quality Control" },
        ]}
      />
      <h1 id="qc-heading" className="text-2xl font-bold text-foreground">
        Quality Control
      </h1>
      <p className="text-sm text-muted-foreground -mt-4">
        Checklist inspeksi ber-versi, hasil inspeksi per dokumen, dan nonconformance (NCR) yang memblokir serah terima sampai diselesaikan.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface rounded-xl border border-default shadow-sm p-5">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <ModuleGrid
        ariaLabel="Modul Quality Control"
        headingId="qc-heading"
        items={qcModules}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
