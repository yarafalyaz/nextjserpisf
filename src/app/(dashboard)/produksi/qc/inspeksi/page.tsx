export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { QcInspectionTable } from "./_components/qc-inspection-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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

  const tableData = inspections.map((i) => ({
    id: i.id,
    documentNo: i.documentNo,
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
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "Inspeksi" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inspeksi QC</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Catatan inspeksi terhadap dokumen (WO/produksi/penerimaan). Hasil akhir memblokir serah terima bila gagal.
          </p>
        </div>
        <CanCreate permission="manage_qc_inspections">
          <Link
            href="/produksi/qc/inspeksi/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-qc-inspection-btn"
          >
            + Catat Inspeksi
          </Link>
        </CanCreate>
      </div>

      <QcInspectionTable data={tableData} />
    </div>
  )
}
