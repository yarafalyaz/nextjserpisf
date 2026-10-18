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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Uang Muka Pembelian</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pembayaran di muka ke pemasok. Setiap dokumen membuat satu jurnal: uang muka bertambah
            (aset), kas/bank berkurang. Penerapan ke tagihan pemasok dilakukan manual.
          </p>
        </div>
        <CanCreate permission="create_purchase_advances">
          <Link
            href="/pembelian/uang-muka/tambah"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
            id="create-purchase-advance-btn"
          >
            + Tambah Uang Muka
          </Link>
        </CanCreate>
      </div>

      <PurchaseAdvanceTable data={rows} />
    </div>
  )
}
