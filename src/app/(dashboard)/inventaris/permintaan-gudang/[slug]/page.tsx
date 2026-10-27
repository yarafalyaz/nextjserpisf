export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { assertMaterialRequestVisible } from "@/lib/services/material-request.service"
import { deriveMaterialRequestFulfillment, MATERIAL_REQUEST_STATUS_LABELS, type MaterialRequestStatus } from "@/lib/reports/material-request"
import { deleteMaterialRequest } from "@/actions/material-request.actions"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref, entityHref } from "@/lib/utils/entity-url"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { CanCreate } from "@/components/auth/can-create"
import { MaterialRequestActions } from "../_components/material-request-actions"

export const metadata: Metadata = { title: "Permintaan Antar Gudang" }

export default async function MaterialRequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("view_material_requests")
  const { slug } = await params

  const request = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.materialRequest.findFirst({
          where: { slug: s },
          include: {
            requesterWarehouse: { select: { name: true } },
            sourceWarehouse: { select: { name: true } },
            workOrder: { select: { documentNo: true, slug: true, id: true } },
            items: { select: { id: true, itemId: true, qty: true, notes: true, item: { select: { name: true, sku: true, unitOfMeasure: true } } } },
            transfers: { select: { id: true, slug: true, documentNo: true, status: true, items: { select: { itemId: true, qty: true } } }, orderBy: { createdAt: "asc" } },
          },
        }),
      byId: (id) =>
        prisma.materialRequest.findUnique({
          where: { id },
          include: {
            requesterWarehouse: { select: { name: true } },
            sourceWarehouse: { select: { name: true } },
            workOrder: { select: { documentNo: true, slug: true, id: true } },
            items: { select: { id: true, itemId: true, qty: true, notes: true, item: { select: { name: true, sku: true, unitOfMeasure: true } } } },
            transfers: { select: { id: true, slug: true, documentNo: true, status: true, items: { select: { itemId: true, qty: true } } }, orderBy: { createdAt: "asc" } },
          },
        }),
    },
  )

  if (!request) notFound()
  // AC-MR-6: detail langsung (URL tebak) ditegakkan scope server, bukan tombol.
  try {
    await assertMaterialRequestVisible(user, request.id)
  } catch {
    notFound()
  }

  const { lines } = deriveMaterialRequestFulfillment({
    requested: request.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })),
    receivedLines: request.transfers
      .filter((t) => t.status === "received")
      .flatMap((t) => t.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) }))),
  })
  const fulfillmentByItem = new Map(lines.map((l) => [l.itemId, l]))
  const statusLabel = MATERIAL_REQUEST_STATUS_LABELS[request.status as MaterialRequestStatus] ?? request.status

  const [canApprove, canEdit, canCreateTransfer] = await Promise.all([
    hasPermission("approve_material_requests"),
    hasPermission("edit_material_requests"),
    hasPermission("create_inventory_transfers"),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Permintaan Antar Gudang ${request.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Permintaan Antar Gudang", href: "/inventaris/permintaan-gudang" },
          { label: request.documentNo },
        ]}
        badge={<StatusChip status={request.status} customLabel={statusLabel} />}
        actions={
          <>
            <MaterialRequestActions
              id={request.id}
              status={request.status}
              canApprove={canApprove}
              canEdit={canEdit}
              canCreateTransfer={canCreateTransfer}
            />
            {request.status === "draft" && (
              <>
                <CanCreate permission="edit_material_requests">
                  <Button href={entityEditHref("/inventaris/permintaan-gudang", request)} variant="secondary">Ubah</Button>
                </CanCreate>
                <CanCreate permission="delete_material_requests">
                  <DeleteButton id={request.id} action={deleteMaterialRequest} />
                </CanCreate>
              </>
            )}
            <BackButton href="/inventaris/permintaan-gudang" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={request.documentNo} mono />
        <DetailField label="Status" value={<StatusChip status={request.status} customLabel={statusLabel} />} />
        <DetailField label="Gudang Tujuan" value={request.requesterWarehouse.name} />
        <DetailField label="Gudang Sumber" value={request.sourceWarehouse.name} />
        <DetailField label="Perintah Kerja" value={request.workOrder?.documentNo ?? "—"} />
        <DetailField label="Tanggal Dibutuhkan" value={request.neededBy ? formatDate(request.neededBy) : "—"} />
        <DetailField label="Tanggal Dibuat" value={formatDate(request.createdAt)} />
        {request.rejectionReason && (
          <DetailField label="Alasan" value={request.rejectionReason} colSpan="full" />
        )}
      </DetailCard>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
        </div>
        <div className="p-4 px-5">
          {request.items.length === 0 ? (
            <EmptyState title="Tidak ada barang" />
          ) : (
            <div className="overflow-x-auto">
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Nama Barang</DetailTableTh>
                  <DetailTableTh>Satuan</DetailTableTh>
                  <DetailTableTh align="right">Diminta</DetailTableTh>
                  <DetailTableTh align="right">Diterima</DetailTableTh>
                  <DetailTableTh align="right">Sisa</DetailTableTh>
                  <DetailTableTh>Catatan</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {request.items.map((item) => {
                    const f = fulfillmentByItem.get(item.itemId)
                    return (
                      <DetailTableRow key={item.id}>
                        <DetailTableTd>{item.item.name}{item.item.sku ? ` (${item.item.sku})` : ""}</DetailTableTd>
                        <DetailTableTd>{item.item.unitOfMeasure}</DetailTableTd>
                        <DetailTableTd align="right">{formatNumber(Number(item.qty))}</DetailTableTd>
                        <DetailTableTd align="right">{formatNumber(f?.receivedQty ?? 0)}</DetailTableTd>
                        <DetailTableTd align="right">{formatNumber(f?.remainingQty ?? Number(item.qty))}</DetailTableTd>
                        <DetailTableTd>{item.notes ?? "—"}</DetailTableTd>
                      </DetailTableRow>
                    )
                  })}
                </DetailTableBody>
              </DetailTable>
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Transfer Tertaut</h2>
        </div>
        <div className="p-4 px-5">
          {request.transfers.length === 0 ? (
            <EmptyState title="Belum ada transfer" />
          ) : (
            <div className="overflow-x-auto">
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>No. Dokumen</DetailTableTh>
                  <DetailTableTh>Status</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {request.transfers.map((transfer) => (
                    <DetailTableRow key={transfer.id}>
                      <DetailTableTd>
                        <a href={entityHref("/inventaris/transfer", transfer)} className="font-medium text-primary hover:underline">{transfer.documentNo}</a>
                      </DetailTableTd>
                      <DetailTableTd><StatusChip status={transfer.status} /></DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
