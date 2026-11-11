import { Plus } from "@/components/ui/fontawesome-icons";
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
      slug: true,
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

  const total = await prisma.qcChecklist.count({ where })

  const tableData = checklists.map((c) => ({
    id: c.id,
    slug: c.slug,
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
          { label: "Pengendalian Mutu", href: "/produksi/qc" },
          { label: "Checklist" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Daftar Periksa Mutu (QC Checklist)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Master checklist inspeksi ber-versi. Checklist yang telah dirilis dibekukan sebagai standar acuan pengujian mutu.
          </p>
        </div>
        <CanCreate permission="manage_qc_checklists">
          <Link
            href="/produksi/qc/checklist/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-qc-checklist-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Checklist</span>
          </Link>
        </CanCreate>
      </div>

      <QcChecklistTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
