export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { QcInspectionTable } from "./_components/qc-inspection-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Plus } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Inspeksi QC" }

export default async function QcInspectionsPage({
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

  const inspections = await prisma.qcInspection.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      documentNo: true,
      slug: true,
      inspectionType: true,
      referenceType: true,
      referenceId: true,
      status: true,
      inspectedAt: true,
      checklist: { select: { name: true } },
      _count: { select: { results: true } },
    },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.qcInspection.count({ where })

  const tableData = inspections.map((i) => ({
    id: i.id,
    documentNo: i.documentNo,
    slug: i.slug,
    inspectionType: i.inspectionType,
    referenceType: i.referenceType,
    referenceId: i.referenceId,
    status: i.status,
    inspectedAt: i.inspectedAt ? i.inspectedAt.toISOString() : null,
    checklistName: i.checklist.name,
    resultsCount: i._count.results,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Pengendalian Mutu", href: "/produksi/qc" },
          { label: "Inspeksi" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Inspeksi Kendali Mutu (QC Inspection)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pemeriksaan mutu dokumen (WO, produksi, penerimaan gudang). Status gagal memblokir proses serah terima.
          </p>
        </div>
        <CanCreate permission="manage_qc_inspections">
          <Link
            href="/produksi/qc/inspeksi/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-qc-inspection-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Catat Inspeksi</span>
          </Link>
        </CanCreate>
      </div>

      <QcInspectionTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
