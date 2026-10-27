export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePurchaseRequest } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { StatusChip } from "@/components/ui/status-chip"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Permintaan Pembelian" }

export default async function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_purchase_requests")
  const canApprove = await hasPermission("approve_purchase_requests")

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
              <Button href={`/pembelian/pesanan/tambah/pr/${request.slug ?? request.id}`} variant="primary">
                Buat Pesanan
              </Button>
            )}
            <Button href={entityEditHref("/pembelian/permintaan", request)} variant="primary">Ubah</Button>
            <PrintButton documentType="purchase-request" documentId={request.id} />
            <DeleteButton id={request.id} action={deletePurchaseRequest} />
            <BackButton href="/pembelian/permintaan" />
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
        <DetailField label="Tanggal" value={formatDate(request.date)} />
        {request.requestDate && (
          <DetailField label="Tanggal Permintaan" value={formatDate(request.requestDate)} />
        )}
        <DetailField label="Dibuat" value={formatDate(request.createdAt)} />
        {request.approvedAt && (
          <DetailField label="Disetujui Pada" value={formatDate(request.approvedAt)} />
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
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Barang</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh>Catatan</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {request.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{item.itemId}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                    <DetailTableTd>{item.notes || "-"}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
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
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Dokumen</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {request.purchaseOrders.map((po) => (
                  <DetailTableRow key={po.id}>
                    <DetailTableTd className="font-mono"><Link href={entityHref("/pembelian/pesanan", po)}>{po.documentNo}</Link></DetailTableTd>
                    <DetailTableTd>{formatDate(po.date)}</DetailTableTd>
                    <DetailTableTd><StatusChip status={po.status} /></DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
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
