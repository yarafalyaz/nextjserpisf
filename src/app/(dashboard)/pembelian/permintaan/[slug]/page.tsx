export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePurchaseRequest } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { CanCreate } from "@/components/auth/can-create"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import {
  PurchaseRequestItemsTable,
  PurchaseRequestOrdersTable,
} from "./_components/purchase-request-detail-tables"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { DRAFT_ONLY_EDIT_STATUSES } from "@/lib/constants/status"
export const metadata: Metadata = { title: "Permintaan Pembelian" }

export default async function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_purchase_requests")
  const [canApprove, canEdit, canDelete] = await Promise.all([
    hasPermission("approve_purchase_requests"),
    hasPermission("edit_purchase_requests"),
    hasPermission("delete_purchase_requests"),
  ])

  const { slug } = await params

  const request = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.purchaseRequest.findFirst({
          where: { slug: s, ...where },
          include: {
            items: true,
            vendor: { select: { name: true } },
            purchaseOrders: { orderBy: { createdAt: "desc" } },
          },
        }),
      byId: (id, where) =>
        prisma.purchaseRequest.findUnique({
          where: { id, ...where },
          include: {
            items: true,
            vendor: { select: { name: true } },
            purchaseOrders: { orderBy: { createdAt: "desc" } },
          },
        }),
    },
  )

  if (!request) notFound()

  const itemIds = request.items.map((i) => i.itemId)
  const [items, users] = await Promise.all([
    itemIds.length > 0
      ? prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, slug: true, code: true, name: true, unitOfMeasure: true },
        })
      : [],
    prisma.user.findMany({
      where: {
        id: { in: [request.requestedBy, request.approvedBy, request.createdBy].filter(Boolean) as number[] },
      },
      select: { id: true, name: true },
    }),
  ])
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  // updatePurchaseRequest hanya menerima draft; deletePurchaseRequest menolak
  // approved/partial_ordered/ordered (PR itu sudah melahirkan PO, jadi jejak
  // auditnya wajib tinggal). Dua gerbang berbeda: PR `rejected`/`cancelled`
  // masih boleh dihapus tetapi tidak boleh diedit.
  const isDraft = (DRAFT_ONLY_EDIT_STATUSES as readonly string[]).includes(request.status)
  const isDeletable = !["approved", "partial_ordered", "ordered"].includes(request.status)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Permintaan Pembelian ${request.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Permintaan", href: "/pembelian/permintaan" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={request.status} />}
        actions={
          <>
            {(request.status === "approved" || request.status === "partial_ordered") && (
              <CanCreate permission="create_purchase_orders">
                <Button href={`/pembelian/pesanan/tambah/pr/${request.slug ?? request.id}`} variant="primary" className="min-h-11 sm:min-h-9">
                  Buat Pesanan
                </Button>
              </CanCreate>
            )}
            {canEdit && isDraft && <Button href={entityEditHref("/pembelian/permintaan", request)} variant="primary" className="min-h-11 sm:min-h-9">Ubah</Button>}
            <PrintButton documentType="purchase-request" documentId={request.id} />
            {canDelete && isDeletable && <DeleteButton id={request.id} action={deletePurchaseRequest} />}
          </>
        }
      />

      <StatusActions
        status={request.status}
        id={request.id}
        module="pembelian/permintaan"
        canAct={canApprove}
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={request.documentNo} mono />
        <DetailField label="Judul" value={request.title || "-"} />
        <DetailField label="Pemasok Disarankan" value={request.vendor?.name || "-"} />
        <DetailField label="Pemohon" value={userMap.get(request.requestedBy) || `Pengguna #${request.requestedBy}`} />
        <DetailField label="Tanggal" value={formatDate(request.date)} />
        {request.requestDate && (
          <DetailField label="Tanggal Permintaan" value={formatDate(request.requestDate)} />
        )}
        <DetailField label="Dibuat" value={`${formatDate(request.createdAt, { includeTime: true })}${request.createdBy ? ` • ${userMap.get(request.createdBy) || `Pengguna #${request.createdBy}`}` : ""}`} />
        {request.approvedAt && (
          <DetailField label="Disetujui" value={`${formatDate(request.approvedAt, { includeTime: true })}${request.approvedBy ? ` • ${userMap.get(request.approvedBy) || `Pengguna #${request.approvedBy}`}` : ""}`} />
        )}
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
        </div>
        <div className="p-4 px-5">
          {request.items.length === 0 ? (
            <EmptyState title="Tidak ada item" />
          ) : (
            <PurchaseRequestItemsTable
              data={request.items.map((item) => {
                const dbItem = itemMap.get(item.itemId)
                return {
                  id: item.id,
                  itemId: item.itemId,
                  itemName: dbItem?.name ?? null,
                  itemCode: dbItem?.code ?? null,
                  qty: Number(item.qty),
                  unitOfMeasure: dbItem?.unitOfMeasure ?? null,
                  notes: item.notes,
                }
              })}
            />
          )}
        </div>
      </div>

      {/* Related POs */}
      {request.purchaseOrders.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Pesanan Pembelian Terkait</h2>
          </div>
          <div className="p-4 px-5">
            <PurchaseRequestOrdersTable
              data={request.purchaseOrders.map((po) => ({
                id: po.id,
                slug: po.slug,
                documentNo: po.documentNo,
                date: po.date.toISOString(),
                status: po.status,
              }))}
            />
          </div>
        </div>
      )}

      {/* Description */}
      {request.description && (
        <DetailCard>
          <DetailField label="Deskripsi" value={<span className="whitespace-pre-wrap">{request.description}</span>} colSpan="full" />
        </DetailCard>
      )}

      {/* Rejection Reason */}
      {request.status === "rejected" && request.rejectionReason && (
        <div className="bg-surface rounded-xl border border-danger/30 shadow-sm p-6">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <DetailField label="Alasan Penolakan" value={<span className="whitespace-pre-wrap">{request.rejectionReason}</span>} colSpan="full" />
          </div>
        </div>
      )}

      {/* Notes */}
      {request.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={request.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  )
}
