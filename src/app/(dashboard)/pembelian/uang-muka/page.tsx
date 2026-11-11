import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { PurchaseAdvanceTable } from "./_components/purchase-advance-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Uang Muka Pembelian" }

export default async function PurchaseAdvancesPage() {
  await requirePermission("view_purchase_advances")

  const advances = await prisma.purchaseAdvance.findMany({
    where: { deletedAt: null },
    orderBy: { date: "desc" },
    take: 200,
    include: { vendor: { select: { name: true } } },
  })

  const rows = advances.map((advance) => ({
    id: advance.id,
    documentNo: advance.documentNo,
    date: advance.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    vendorName: advance.vendor.name,
    description: advance.description,
    amount: Number(advance.amount),
    journalId: advance.journalId,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Uang Muka Pembelian" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Uang Muka Pembelian</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pembayaran di muka ke pemasok. Setiap dokumen membuat satu jurnal: uang muka bertambah
            (aset), kas/bank berkurang.
          </p>
        </div>
        <CanCreate permission="create_purchase_advances">
          <Link
            href="/pembelian/uang-muka/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-purchase-advance-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Uang Muka</span>
          </Link>
        </CanCreate>
      </div>

      <PurchaseAdvanceTable data={rows} />
    </div>
  )
}
