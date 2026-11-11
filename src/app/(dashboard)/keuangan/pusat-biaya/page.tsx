import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { CostCenterTable } from "./_components/cost-center-table"
import { CanCreate } from "@/components/auth/can-create"

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Pusat Biaya (Cost Center)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Struktur hierarki pembebanan anggaran operasional dan kontrol alokasi biaya per departemen.
          </p>
        </div>
        <CanCreate permission="create_cost_centers">
          <Link
            href="/keuangan/pusat-biaya/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-cc-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Cost Center</span>
          </Link>
        </CanCreate>
      </div>

      <CostCenterTable data={data} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
