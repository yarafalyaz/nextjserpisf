export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { GoodsReceiptTable } from "./_components/goods-receipt-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penerimaan Barang" }

export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_goods_receipts")

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

  const receipts = await prisma.goodsReceipt.findMany({
    where,
    include: { purchaseOrder: { include: { vendor: true } }, warehouse: true, items: true },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(receipts))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Penerimaan Barang"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penerimaan Barang</h1>
        <Link href="/pembelian/penerimaan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-gr-btn">
          + Buat Penerimaan
        </Link>
      </div>

      <GoodsReceiptTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari no. dokumen..." action="/pembelian/penerimaan" />}
        filters={
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "verified"].map((dbStatus) => {
              const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
              return (
                <Link
                  key={dbStatus}
                  href={`/pembelian/penerimaan${urlStatus ? `?status=${urlStatus}` : ""}`}
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
