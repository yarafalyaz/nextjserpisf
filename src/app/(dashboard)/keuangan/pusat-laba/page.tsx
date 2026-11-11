import { Plus } from "@/components/ui/fontawesome-icons";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Pusat Laba (Profit Center)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Unit bisnis pertanggungjawaban laba-rugi terpisah dan evaluasi profitabilitas segmen.
          </p>
        </div>
        <CanCreate permission="create_profit_centers">
          <Link
            href="/keuangan/pusat-laba/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Pusat Laba</span>
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
