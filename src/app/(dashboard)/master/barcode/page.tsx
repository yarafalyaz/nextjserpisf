import { Plus } from "@/components/ui/fontawesome-icons";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Manajemen Barcode Produk
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Registrasi kode batang EAN/UPC/QR-Code untuk pemindaian scanner di kasir dan gudang.
          </p>
        </div>
        <CanCreate permission="create_barcodes">
          <Link
            href="/master/barcode/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-barcode-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Barcode</span>
          </Link>
        </CanCreate>
      </div>

      <BarcodeTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
