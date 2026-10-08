import {
  Palmtree, Timer, Banknote, PiggyBank, Gift, Clock
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "SDM" }

const hrmModules: ModuleItem[] = [
  { label: "Cuti", href: "/sdm/cuti", icon: Palmtree, desc: "Cuti karyawan", permission: "view_leave_requests" },
  { label: "Lembur", href: "/sdm/lembur", icon: Timer, desc: "Lembur", permission: "view_overtime" },
  { label: "Penggajian", href: "/sdm/penggajian", icon: Banknote, desc: "Penggajian", permission: "view_payroll" },
  { label: "Lembar Waktu", href: "/sdm/lembar-waktu", icon: Clock, desc: "Lembar waktu", permission: "view_timesheets" },
  { label: "Pinjaman", href: "/sdm/pinjaman", icon: PiggyBank, desc: "Pinjaman karyawan", permission: "view_employee_loans" },
  { label: "Apresiasi", href: "/sdm/apresiasi", icon: Gift, desc: "Apresiasi karyawan", permission: "view_appreciations" },
]

const HRM_PERMISSIONS = [
  "view_leave_requests",
  "view_overtime",
  "view_payroll",
  "view_timesheets",
  "view_employee_loans",
  "view_appreciations",
]

export default async function HrmPage() {
  const user = await requireAnyPermission(HRM_PERMISSIONS)
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "SDM" }]} />
      <h1 id="sdm-heading" className="text-2xl font-bold text-foreground">
        SDM
      </h1>
      <ModuleGrid
        ariaLabel="Modul SDM"
        headingId="sdm-heading"
        items={hrmModules}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
