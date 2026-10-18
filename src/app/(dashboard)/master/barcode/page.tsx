export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BarcodeTable } from "./_components/barcode-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Barcode" }

export default async function BarcodesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_barcodes")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()
  // Kotak cari DataTable menulis ?cari= (mode server) — terjemahkan ke query.
  const where = cari
    ? {
        OR: [
          { barcode: { contains: cari } },
          { type: { contains: cari } },
          { item: { name: { contains: cari } } },
        ],
      }
    : {}

  const barcodes = await prisma.barcode.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { item: { select: { name: true } } },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.barcode.count({ where })

  const tableData = toPlain(barcodes)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Barcode" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Barcode</h1>
        <CanCreate permission="create_barcodes">
          <Link href="/master/barcode/tambah" className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-barcode-btn">
          + Tambah Barcode
        </Link>
        </CanCreate>
      </div>

      <BarcodeTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
