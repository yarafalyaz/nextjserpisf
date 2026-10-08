export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { NonconformanceTable } from "./_components/nonconformance-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Nonconformance (NCR)" }

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

  const tableData = rows.map((r) => ({
    id: r.id,
    documentNo: r.documentNo,
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
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "NCR" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nonconformance (NCR)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cacat dan pengerjaan ulang. NCR terbuka memblokir serah terima dokumen terkait sampai ditutup.
          </p>
        </div>
        <CanCreate permission="manage_nonconformances">
          <Link
            href="/produksi/qc/ncr/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-ncr-btn"
          >
            + Buat NCR
          </Link>
        </CanCreate>
      </div>

      <NonconformanceTable data={tableData} />
    </div>
  )
}
