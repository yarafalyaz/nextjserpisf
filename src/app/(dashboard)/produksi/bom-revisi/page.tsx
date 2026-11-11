import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { BomRevisionTable } from "./_components/bom-revision-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Revisi BOM" }

export default async function BomRevisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_bom_revisions")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = params.cari
    ? { product: { name: { contains: params.cari } } }
    : {}

  const revisions = await prisma.bomRevision.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      revisionNo: true,
      status: true,
      effectiveDate: true,
      createdAt: true,
      product: { select: { id: true, name: true, slug: true } },
      _count: { select: { materials: true } },
    },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.bomRevision.count({ where })

  const tableData = revisions.map((r) => ({
    id: r.id,
    slug: r.slug,
    revisionNo: r.revisionNo,
    status: r.status,
    effectiveDate: r.effectiveDate.toISOString(),
    productId: r.product.id,
    productName: r.product.name,
    productSlug: r.product.slug,
    materialsCount: r._count.materials,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Revisi BOM" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Revisi Resep BOM (BOM Revision)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Snapshot BOM ber-versi. Perintah produksi yang dirilis mengunci versi aktif tanpa terpengaruh perubahan master di kemudian hari.
          </p>
        </div>
        <CanCreate permission="manage_bom_revisions">
          <Link
            href="/produksi/bom-revisi/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-bom-revision-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Revisi BOM</span>
          </Link>
        </CanCreate>
      </div>

      <BomRevisionTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
