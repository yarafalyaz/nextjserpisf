export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { ProfitCenterTable } from "./_components/profit-center-table"
import { CanCreate } from "@/components/auth/can-create"

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pusat Laba</h1>
        <CanCreate permission="create_profit_centers">
          <Link
            href="/keuangan/pusat-laba/tambah"
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
          >
            + Buat Pusat Laba
          </Link>
        </CanCreate>
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
