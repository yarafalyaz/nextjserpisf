export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { DownPaymentTable } from "./_components/down-payment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function DownPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_down_payments")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { quotation: { customer: { name: { contains: params.cari } } } },
        { quotation: { documentNo: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const rawDps = await prisma.downPayment.findMany({
    where,
    include: { quotation: { include: { customer: true } } },
    orderBy: { createdAt: "desc" },
  })

  const dps = rawDps.map((dp) => ({
    id: dp.id,
    quotation: dp.quotation,
    amount: Number(dp.amount),
    status: dp.status,
    createdAt: dp.createdAt,
  }))

  const tableData = JSON.parse(JSON.stringify(dps))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Uang Muka"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Uang Muka</h1>
      </div>

      <DownPaymentTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari pelanggan atau penawaran..." action="/penjualan/uang-muka" />}
        filters={
          <div className="flex gap-1.5 flex-wrap">
            {["", "pending", "confirmed", "cancelled"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link
                  key={dbStatus}
                  href={`/penjualan/uang-muka${urlStatus ? `?status=${urlStatus}` : ""}`}
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
