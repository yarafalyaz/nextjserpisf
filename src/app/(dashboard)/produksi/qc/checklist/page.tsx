export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { QcChecklistTable } from "./_components/qc-checklist-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Checklist QC" }

export default async function QcChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_qc")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = params.cari
    ? { name: { contains: params.cari } }
    : {}

  const checklists = await prisma.qcChecklist.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      name: true,
      checklistType: true,
      version: true,
      status: true,
      _count: { select: { items: true } },
    },
    take,
    skip: (page - 1) * pageSize,
  })

  const tableData = checklists.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    checklistType: c.checklistType,
    version: c.version,
    status: c.status,
    itemsCount: c._count.items,
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "Checklist" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Checklist QC</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Master checklist inspeksi ber-versi. Checklist yang sudah dirilis dibekukan dan dipakai sebagai acuan inspeksi.
          </p>
        </div>
        <CanCreate permission="manage_qc_checklists">
          <Link
            href="/produksi/qc/checklist/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-qc-checklist-btn"
          >
            + Buat Checklist
          </Link>
        </CanCreate>
      </div>

      <QcChecklistTable data={tableData} />
    </div>
  )
}
