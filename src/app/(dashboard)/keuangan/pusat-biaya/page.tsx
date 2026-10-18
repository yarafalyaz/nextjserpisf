export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { CostCenterTable } from "./_components/cost-center-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pusat Biaya" }

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_cost_centers")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  // Kotak cari DataTable menulis ?cari= ke URL (mode server), jadi nilainya
  // harus diterjemahkan ke query — tanpa ini mengetik di kotak cari tidak
  // menyaring apa pun sehingga terlihat rusak.
  const where = {
    parentId: null,
    ...(cari && {
      OR: [{ code: { contains: cari } }, { name: { contains: cari } }],
    }),
  }

  const all = await prisma.costCenter.findMany({
    include: { children: { include: { children: { include: { children: true } } } } },
    where,
    orderBy: { code: "asc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.costCenter.count({ where })

  const data = toPlain(all)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pusat Biaya</h1>
        <Link href="/keuangan/pusat-biaya/tambah" className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-cc-btn">
          + Buat Cost Center
        </Link>
      </div>

      <CostCenterTable data={data} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
