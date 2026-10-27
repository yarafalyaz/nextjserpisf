export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requireAnyPermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  HrPendingApprovalCard,
  HR_PENDING_APPROVAL_TITLE,
} from "@/components/reports/hr-pending-approval-card"
import { loadHrPendingApprovalQueue } from "@/lib/reports/hr-pending-approval-data"

export const metadata: Metadata = { title: HR_PENDING_APPROVAL_TITLE }

/**
 * F-2026-10-25-007-S: permukaan kerja approver HR (spec §4/BR-HP-03).
 * Gerbang ganda per jenis ditegakkan di sini sebelum loader dipanggil:
 * cuti hanya untuk pemegang view+approve cuti, lembur hanya untuk
 * view+approve lembur, pinjaman hanya untuk view+approve pinjaman
 * (F-2026-10-25-018-S, syarat LOLOS-BERSYARAT audit PR #876). Pemegang
 * satu jenis saja melihat baris jenis itu; tanpa ketiganya halaman
 * ditolak. Scope HR fail-closed dari loader.
 * Keputusan tetap lewat aksi existing per dokumen di halaman detail
 * (BR-HP-06) — halaman ini tidak memutuskan apa pun.
 */
export default async function HrPendingApprovalPage() {
  const user = await requireAnyPermission([
    "approve_leave_requests",
    "approve_overtime_requests",
    "approve_loans",
  ])

  const isSuperAdmin = user.roles.includes("super_admin")
  const perms: string[] = user.permissions ?? []
  const canLeave =
    isSuperAdmin ||
    (perms.includes("view_leave_requests") &&
      perms.includes("approve_leave_requests"))
  const canOvertime =
    isSuperAdmin ||
    (perms.includes("view_overtime") &&
      perms.includes("approve_overtime_requests"))
  const canLoan =
    isSuperAdmin ||
    (perms.includes("view_employee_loans") && perms.includes("approve_loans"))

  const scope = await getHrScope(user)

  const allRows = await loadHrPendingApprovalQueue(scope)
  const rows = allRows.filter((row) =>
    row.kind === "leave" ? canLeave : row.kind === "loan" ? canLoan : canOvertime,
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Antrean Persetujuan HR" },
        ]}
      />
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">
        {HR_PENDING_APPROVAL_TITLE}
      </h1>
      <HrPendingApprovalCard rows={rows} />
    </div>
  )
}
