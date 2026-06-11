export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { PettyCashTable } from "./_components/petty-cash-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Kas Kecil" }

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; tipe?: string; halaman?: string }>
}) {
  await requirePermission("view_petty_cash")

  const params = await searchParams
  const page = Number(params.halaman) || 1
  const perPage = 100

  const where = {
    ...(params.tipe && { type: params.tipe }),
  }

  const [records, total] = await Promise.all([
    prisma.pettyCash.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.pettyCash.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)

  const data = records.map((r) => ({
    id: r.id,
    documentNo: r.documentNo,
    date: r.date.toISOString(),
    type: r.type,
    description: r.description,
    amount: Number(r.amount),
    balanceAfter: Number(r.balanceAfter),
  }))

  const statusChips = (
    <>
      <Link href="/keuangan/kas-kecil" className={`filter-chip ${!params.tipe ? "active" : ""}`}>Semua</Link>
      <Link href="/keuangan/kas-kecil?tipe=IN" className={`filter-chip ${params.tipe === "IN" ? "active" : ""}`}>Masuk</Link>
      <Link href="/keuangan/kas-kecil?tipe=OUT" className={`filter-chip ${params.tipe === "OUT" ? "active" : ""}`}>Keluar</Link>
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kas Kecil</h1>
        <Link href="/keuangan/kas-kecil/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-pc-btn">
          + Buat Transaksi
        </Link>
      </div>

      <PettyCashTable
        data={data}
        toolbar={<AppSearchField placeholder="Cari Kas Kecil..." action="/keuangan/kas-kecil" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 px-5 border-t border-default">
          <span className="text-[0.8125rem] text-muted-foreground">Hal {page} dari {totalPages} ({total} data)</span>
          <div className="flex gap-1">
            {page > 1 && <Link href={`/keuangan/kas-kecil?halaman=${page - 1}`} className="button button--ghost button--sm">← Sebelumnya</Link>}
            {page < totalPages && <Link href={`/keuangan/kas-kecil?halaman=${page + 1}`} className="button button--ghost button--sm">Berikutnya →</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
