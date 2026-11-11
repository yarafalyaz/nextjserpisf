import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { NonconformanceTable } from "./_components/nonconformance-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Ketidaksesuaian (NCR)" }

export default async function NonconformancesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_qc")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = params.cari
    ? { documentNo: { contains: params.cari } }
    : {}

  const rows = await prisma.nonconformance.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      documentNo: true,
      slug: true,
      referenceType: true,
      referenceId: true,
      severity: true,
      responsibility: true,
      status: true,
      createdAt: true,
    },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.nonconformance.count({ where })

  const tableData = rows.map((r) => ({
    id: r.id,
    documentNo: r.documentNo,
    slug: r.slug,
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    severity: r.severity,
    responsibility: r.responsibility,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Pengendalian Mutu", href: "/produksi/qc" },
          { label: "NCR" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Ketidaksesuaian Mutu (NCR)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pencatatan cacat produk, analisis akar masalah, dan disposisi pengerjaan ulang (rework).
          </p>
        </div>
        <CanCreate permission="manage_nonconformances">
          <Link
            href="/produksi/qc/ncr/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-ncr-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat NCR</span>
          </Link>
        </CanCreate>
      </div>

      <NonconformanceTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
