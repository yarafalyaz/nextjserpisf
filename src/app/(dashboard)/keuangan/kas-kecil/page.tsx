export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { PettyCashTable } from "./_components/petty-cash-table"

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; tipe?: string }>
}) {
  await requirePermission("view_petty_cash")

  const params = await searchParams

  const where = {
    ...(params.tipe && { tipe: params.tipe }),
  }

  const records = await prisma.pettyCash.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const data = records.map((r) => ({
    id: r.id,
    documentNo: r.documentNo,
    date: r.date.toISOString(),
    type: r.type,
    description: r.description,
    amount: Number(r.amount),
    balanceAfter: Number(r.balanceAfter),
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Petty Cash</h1>
        <Link href="/keuangan/kas-kecil/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-pc-btn">
          + Buat Transaksi
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari petty cash..." action="/keuangan/kas-kecil" />
          <div className="flex gap-1.5 flex-wrap">
            <Link href="/keuangan/kas-kecil" className={`filter-chip ${!params.tipe ? "active" : ""}`}>Semua</Link>
            <Link href="/keuangan/kas-kecil?tipe=IN" className={`filter-chip ${params.tipe === "IN" ? "active" : ""}`}>Masuk</Link>
            <Link href="/keuangan/kas-kecil?tipe=OUT" className={`filter-chip ${params.tipe === "OUT" ? "active" : ""}`}>Keluar</Link>
          </div>
        </div>

        <PettyCashTable data={data} />
      </div>
    </div>
  )
}
