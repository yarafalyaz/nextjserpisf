export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrencyExact } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { ProcessButton } from "@/components/ui/process-button"
import { deleteMaterialIssue, completeMaterialIssue } from "@/actions/inventory.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { canViewWarehouseScopedDocument } from "@/lib/auth/document-scope"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Pengeluaran Material" }

export default async function MaterialIssueDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_material_issues")

  const { slug } = await params

  const issue = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.materialIssue.findFirst({
          where: { slug: s },
          include: {
            warehouse: true,
            items: true,
          },
        }),
      byId: (id) =>
        prisma.materialIssue.findUnique({
          where: { id },
          include: {
            warehouse: true,
            items: true,
          },
        }),
    },
  )

  if (!issue) notFound()

  // Batas gudang: penjagaan yang SAMA dengan lampiran & cetak
  // (lib/auth/document-scope) — dokumen gudang lain tidak boleh dibaca.
  if (!(await canViewWarehouseScopedDocument("material_issue", issue.id))) notFound()

  // Fetch item names dynamically
  const itemIds = issue.items.map((i) => i.itemId)
  const [items, project, workOrder, creator] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true, code: true, uom: true },
    }),
    issue.projectId
      ? prisma.project.findUnique({
          where: { id: issue.projectId },
          select: { id: true, slug: true, code: true, name: true },
        })
      : null,
    issue.workOrderId
      ? prisma.workOrder.findUnique({
          where: { id: issue.workOrderId },
          select: { id: true, slug: true, documentNo: true },
        })
      : null,
    issue.createdBy
      ? prisma.user.findUnique({
          where: { id: issue.createdBy },
          select: { id: true, name: true },
        })
      : null,
  ])
  const itemNameMap = new Map(items.map((i) => [i.id, i.name]))
  const canEditMaterialIssue = await hasPermission("edit_material_issues")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Inventaris",href:"/inventaris"},{label:"Pengeluaran Material",href:"/inventaris/pengeluaran-material"},{label:"Detail"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pengeluaran Material {issue.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <StatusChip status={issue.status} />
          <div className="flex gap-2 items-center">
            {issue.status === "draft" && (
              <>
                <ProcessButton
                  id={issue.id}
                  action={completeMaterialIssue}
                  canProcess={canEditMaterialIssue}
                  successMessage="Pengeluaran material berhasil diposting"
                  label="Posting"
                />
                <CanCreate permission="edit_material_issues">
                  <Link href={entityEditHref("/inventaris/pengeluaran-material", issue)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-default text-foreground hover:bg-surface-secondary hover:-translate-y-px hover:shadow-md transition-all">Ubah</Link>
                </CanCreate>
                <CanCreate permission="delete_material_issues">
                  <DeleteButton id={issue.id} action={deleteMaterialIssue} />
                </CanCreate>
              </>
            )}
            <Link href="/inventaris/pengeluaran-material" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{issue.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gudang</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{issue.warehouse.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(issue.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={issue.status} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {formatDate(issue.date, { includeTime: true })}
              {creator ? ` • ${creator.name}` : issue.createdBy ? ` • Pengguna #${issue.createdBy}` : ""}
            </span>
          </div>
          {issue.projectId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Proyek</span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {project ? (
                  <Link href={entityHref("/proyek", project)} className="text-primary hover:underline font-medium">
                    {project.name} ({project.code})
                  </Link>
                ) : (
                  `Proyek #${issue.projectId}`
                )}
              </span>
            </div>
          )}
          {issue.workOrderId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Perintah Kerja</span>
              <span className="text-[0.9375rem] text-foreground font-medium">
                {workOrder ? (
                  <Link href={entityHref("/produksi/perintah-kerja", workOrder)} className="text-primary hover:underline font-mono">
                    {workOrder.documentNo}
                  </Link>
                ) : (
                  `Perintah Kerja #${issue.workOrderId}`
                )}
              </span>
            </div>
          )}
          {issue.notes && (
            <div className="flex flex-col gap-1 col-span-full">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catatan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{issue.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
        </div>
        <div className="p-4 px-5">
          {issue.items.length === 0 ? (
            <EmptyState title="Tidak ada barang" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Barang</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh align="right">Biaya</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {issue.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{itemNameMap.get(item.itemId) || `Item #${item.itemId}`}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrencyExact(Number(item.cost))}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
