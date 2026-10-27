export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { ProcessButton } from "@/components/ui/process-button"
import { deleteStockAdjustment, processStockAdjustment } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { canViewWarehouseScopedDocument } from "@/lib/auth/document-scope"
import { entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Penyesuaian Stok" }

export default async function StockAdjustmentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_stock_adjustments")

  const { slug } = await params

  const adjustment = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.stockAdjustment.findFirst({
          where: { slug: s },
          include: {
            warehouse: true,
            items: true,
          },
        }),
      byId: (id) =>
        prisma.stockAdjustment.findUnique({
          where: { id },
          include: {
            warehouse: true,
            items: true,
          },
        }),
    },
  )

  if (!adjustment) notFound()

  // Batas gudang: penjagaan yang SAMA dengan lampiran & cetak
  // (lib/auth/document-scope) — dokumen gudang lain tidak boleh dibaca.
  if (!(await canViewWarehouseScopedDocument("stock_adjustment", adjustment.id))) notFound()

  // Fetch item names dynamically
  const itemIds = adjustment.items.map((i) => i.itemId)
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true },
  })
  const itemNameMap = new Map(items.map((i) => [i.id, i.name]))

  // Fetch approver name dynamically if set
  let approverName: string | null = null
  if (adjustment.approvedBy) {
    const approver = await prisma.user.findUnique({
      where: { id: adjustment.approvedBy },
      select: { name: true },
    })
    approverName = approver?.name || null
  }

  const typeMap: Record<string, string> = {
    increase: "Penambahan",
    decrease: "Pengurangan",
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Penyesuaian Stok ${adjustment.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Penyesuaian", href: "/inventaris/penyesuaian" },
          { label: adjustment.documentNo },
        ]}
        badge={
          <StatusChip
            status={adjustment.status}
            customLabel={adjustment.status === "processed" ? "Diposting" : undefined}
            customTone={adjustment.status === "processed" ? "success" : undefined}
          />
        }
        actions={
          <>
            {adjustment.status === "draft" && (
              <>
                <ProcessButton
                  id={adjustment.id}
                  action={processStockAdjustment}
                  successMessage="Penyesuaian stok berhasil diposting"
                  label="Posting"
                />
                <CanCreate permission="edit_stock_adjustments">
                  <Button href={entityEditHref("/inventaris/penyesuaian", adjustment)} variant="secondary">Ubah</Button>
                </CanCreate>
                <CanCreate permission="delete_stock_adjustments">
                  <DeleteButton id={adjustment.id} action={deleteStockAdjustment} />
                </CanCreate>
              </>
            )}
            <BackButton href="/inventaris/penyesuaian" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={adjustment.documentNo} mono />
        <DetailField label="Gudang" value={adjustment.warehouse.name} />
        <DetailField label="Tanggal" value={formatDate(adjustment.date)} />
        <DetailField
          label="Status"
          value={
            <StatusChip
              status={adjustment.status}
              customLabel={adjustment.status === "processed" ? "Diposting" : undefined}
              customTone={adjustment.status === "processed" ? "success" : undefined}
            />
          }
        />
        <DetailField label="Tipe" value={typeMap[adjustment.type.toLowerCase()] || adjustment.type} />
        {adjustment.reason && (
          <DetailField label="Alasan" value={adjustment.reason} colSpan="full" />
        )}
        {adjustment.notes && (
          <DetailField label="Catatan" value={adjustment.notes} colSpan="full" />
        )}
        {adjustment.approvedBy && (
          <DetailField label="Disetujui Oleh" value={approverName || `User #${adjustment.approvedBy}`} />
        )}
        {adjustment.approvedAt && (
          <DetailField label="Disetujui Pada" value={formatDate(adjustment.approvedAt)} />
        )}
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
        </div>
        <div className="p-4 px-5">
          {adjustment.items.length === 0 ? (
            <EmptyState title="Tidak ada barang" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Barang</DetailTableTh>
                <DetailTableTh align="right">Kuantitas Sistem</DetailTableTh>
                <DetailTableTh align="right">Kuantitas Aktual</DetailTableTh>
                <DetailTableTh align="right">Selisih</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {adjustment.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{itemNameMap.get(item.itemId) || `Item #${item.itemId}`}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.systemQty)}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.actualQty)}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.difference)}</DetailTableTd>
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
