export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { TransferTable } from "./_components/transfer-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function InventoryTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  await requirePermission("view_inventory_transfers")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const transfers = await prisma.inventoryTransfer.findMany({
    where,
    include: { sourceWarehouse: true, destinationWarehouse: true },
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(transfers))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Inventory", href: "/inventory" },
  { label: "Transfers" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transfer Inventaris</h1>
        <Link href="/inventory/transfers/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-transfer-btn">
          + Buat Transfer
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen..." action="/inventory/transfers" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "in_transit", "completed"].map((s) => (
              <Link key={s} href={`/inventory/transfers?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <TransferTable data={tableData} />
      </div>
    </div>
  )
}
