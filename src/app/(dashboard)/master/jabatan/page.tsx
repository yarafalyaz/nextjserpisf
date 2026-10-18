export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { PositionTable } from "./_components/position-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Jabatan" }

export default async function PositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_positions")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()
  // Kotak cari DataTable menulis ?cari= (mode server) — terjemahkan ke query.
  const where = cari
    ? {
        OR: [
          { name: { contains: cari } },
          { code: { contains: cari } },
          { department: { name: { contains: cari } } },
        ],
      }
    : {}

  const positions = await prisma.position.findMany({
    where,
    include: { department: true },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.position.count({ where })

  const tableData = toPlain(positions)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Jabatan" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Jabatan</h1>
        <CanCreate permission="create_positions">
          <Link href="/master/jabatan/tambah" className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-position-btn">
          + Tambah Jabatan
        </Link>
        </CanCreate>
      </div>

      <PositionTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
