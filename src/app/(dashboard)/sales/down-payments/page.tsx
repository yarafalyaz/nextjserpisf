export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { DownPaymentTable } from "./_components/down-payment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function DownPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  await requirePermission("view_down_payments")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { quotation: { customer: { name: { contains: params.search } } } },
        { quotation: { documentNo: { contains: params.search } } },
      ],
    }),
    ...(params.status && { status: params.status }),
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
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/sales"},{label:"Uang Muka"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Uang Muka</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari customer atau quotation..." action="/sales/down-payments" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "pending", "confirmed", "cancelled"].map((s) => (
              <Link
                key={s}
                href={`/sales/down-payments?status=${s}`}
                className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}
              >
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <DownPaymentTable data={tableData} />
      </div>
    </div>
  )
}
