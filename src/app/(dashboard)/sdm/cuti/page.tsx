export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { LeaveTable } from "./_components/leave-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Cuti" }

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_leave_requests")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const leaves = await prisma.leaveRequest.findMany({
    where,
    include: { employee: { select: { name: true } } },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const data = JSON.parse(JSON.stringify(leaves))

  const statusChips = ["", "pending", "approved", "rejected"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/sdm/cuti${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Permintaan Cuti</h1>
<Link href="/sdm/cuti/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-leave-btn">
          + Ajukan Cuti
        </Link>
      </div>

      <LeaveTable
        data={data}
        toolbar={<AppSearchField placeholder="Cari nama karyawan..." action="/sdm/cuti" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />
    </div>
  )
}
