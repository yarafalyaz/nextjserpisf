export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { LeaveTable } from "./_components/leave-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  await requirePermission("view_leave_requests")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { employee: { name: { contains: params.search } } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const leaves = await prisma.leaveRequest.findMany({
    where,
    include: { employee: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })

  const data = JSON.parse(JSON.stringify(leaves))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Leave Requests</h1>
<Link href="/hrm/leave/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-leave-btn">
          + Ajukan Cuti
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama karyawan..." action="/hrm/leave" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "pending", "approved", "rejected"].map((s) => (
              <Link key={s} href={`/hrm/leave?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <LeaveTable data={data} />
      </div>
    </div>
  )
}
