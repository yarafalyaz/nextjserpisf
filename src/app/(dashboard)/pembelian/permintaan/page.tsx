export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { PurchaseRequestTable } from "./_components/purchase-request-table"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_purchase_requests")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
      ],
    }),
    ...(params.status && { status: params.status }),
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
          + Buat PR
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen..." action="/pembelian/permintaan" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "pending", "approved", "rejected"].map((s) => (
              <Link key={s} href={`/pembelian/permintaan?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <PurchaseRequestTable data={tableData} />
      </div>
    </div>
  )
}
