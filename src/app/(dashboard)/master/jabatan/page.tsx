import { Plus } from "@/components/ui/fontawesome-icons";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Master Jabatan & Posisi
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Tingkatan peran profesional, deskripsi tanggung jawab, dan standar grade hierarki karyawan.
          </p>
        </div>
        <CanCreate permission="create_positions">
          <Link
            href="/master/jabatan/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-position-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Jabatan</span>
          </Link>
        </CanCreate>
      </div>

      <PositionTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
