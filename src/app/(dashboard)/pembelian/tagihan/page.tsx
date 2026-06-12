export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { VendorBillTable } from "./_components/vendor-bill-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tagihan" }

export default async function VendorBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_vendor_bills")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { vendor: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const rawBills = await prisma.vendorBill.findMany({
    where,
    include: { vendor: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const bills = rawBills.map((b) => ({
    ...b,
    grandTotal: Number(b.grandTotal),
  }))

  const tableData = toPlain(bills)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Tagihan"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tagihan Vendor</h1>
<Link href="/pembelian/tagihan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-bill-btn">
          + Buat Tagihan
        </Link>
      </div>

      <VendorBillTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari no. dokumen atau vendor..." action="/pembelian/tagihan" />}
        filters={
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "approved", "paid"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link
                  key={dbStatus}
                  href={`/pembelian/tagihan${urlStatus ? `?status=${urlStatus}` : ""}`}
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
