export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { ProfitCenterTable } from "./_components/profit-center-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pusat Laba" }

/**
 * Master pusat laba.
 *
 * Sebelum ini `profit_centers` tidak punya jalur tulis sama sekali (hanya skrip
 * seed), padahal laporan pusat laba membacanya — jadi laporan selalu menumpuk di
 * "Tanpa Pusat Laba".
 */
export default async function ProfitCentersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_profit_centers")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  // Kotak cari DataTable menulis ?cari= ke URL (mode server), jadi nilainya harus
  // diterjemahkan ke query — tanpa ini mengetik di kotak cari tidak menyaring apa pun.
  const where = cari
    ? { OR: [{ code: { contains: cari } }, { name: { contains: cari } }] }
    : {}

  const centers = await prisma.profitCenter.findMany({
    where,
    orderBy: { code: "asc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.profitCenter.count({ where })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pusat Laba</h1>
        <Link
          href="/keuangan/pusat-laba/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
        >
          + Buat Pusat Laba
        </Link>
      </div>

      <ProfitCenterTable
        data={toPlain(centers)}
        total={total}
        page={page}
        pageSize={pageSize}
      />
    </div>
  )
}
