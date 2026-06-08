export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { PurchaseRequestTable } from "./_components/purchase-request-table"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_purchase_requests")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const requests = await prisma.purchaseRequest.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(requests))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Permintaan"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Permintaan Pembelian</h1>
        <Link href="/pembelian/permintaan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-pr-btn">
          + Buat Permintaan
        </Link>
      </div>

      <PurchaseRequestTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari no. dokumen..." action="/pembelian/permintaan" />}
        filters={
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "pending", "approved", "rejected"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link
                  key={dbStatus}
                  href={`/pembelian/permintaan${urlStatus ? `?status=${urlStatus}` : ""}`}
                  className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
                >
                  {dbStatus ? statusLabel(dbStatus) : "Semua"}
                </Link>
              )
            })}
          </div>
        }
      />
    </div>
  )
}
