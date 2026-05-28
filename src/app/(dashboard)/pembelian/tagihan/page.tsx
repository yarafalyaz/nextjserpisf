export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { VendorBillTable } from "./_components/vendor-bill-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function VendorBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  await requirePermission("view_vendor_bills")

  const params = await searchParams

  const where = {
    ...(params.search && {
      OR: [
        { documentNo: { contains: params.search } },
        { vendor: { name: { contains: params.search } } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const rawBills = await prisma.vendorBill.findMany({
    where,
    include: { vendor: true },
    orderBy: { createdAt: "desc" },
  })

  const bills = rawBills.map((b) => ({
    ...b,
    grandTotal: Number(b.grandTotal),
  }))

  const tableData = JSON.parse(JSON.stringify(bills))


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Tagihan"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tagihan Vendor</h1>
<Link href="/pembelian/tagihan/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-bill-btn">
          + Buat Bill
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari no. dokumen atau vendor..." action="/pembelian/tagihan" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "approved", "paid"].map((s) => (
              <Link key={s} href={`/purchase/bills?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <VendorBillTable data={tableData} />
      </div>
    </div>
  )
}
