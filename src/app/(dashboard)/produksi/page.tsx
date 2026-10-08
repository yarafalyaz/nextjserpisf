import {
  Package, Wrench, Hammer, GitBranch, ShieldCheck
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Manufaktur" }

const manufacturingModules: ModuleItem[] = [
  { label: "Produk (BOM)", href: "/produksi/products", icon: Package, desc: "Rincian kebutuhan material (BOM)", permission: "view_production" },
  { label: "Revisi BOM", href: "/produksi/bom-revisi", icon: GitBranch, desc: "Snapshot BOM ber-versi", permission: "view_bom_revisions" },
  { label: "Perintah Kerja", href: "/produksi/perintah-kerja", icon: Wrench, desc: "Perintah kerja", permission: "view_work_orders" },
  { label: "Perintah Produksi", href: "/produksi/production-orders", icon: Hammer, desc: "Perintah produksi", permission: "view_production" },
  { label: "Quality Control", href: "/produksi/qc", icon: ShieldCheck, desc: "Checklist, inspeksi, dan NCR", permission: "view_qc" },
]

const MANUFACTURING_PERMISSIONS = [
  "view_production",
  "view_work_orders",
  "view_bom_revisions",
  "view_qc",
]

export default async function ManufacturingPage() {
  const user = await requireAnyPermission(MANUFACTURING_PERMISSIONS)
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Manufaktur" }]} />
      <h1 id="manufaktur-heading" className="text-2xl font-bold text-foreground">
        Manufaktur
      </h1>
      <ModuleGrid
        ariaLabel="Modul Manufaktur"
        headingId="manufaktur-heading"
        items={manufacturingModules}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
