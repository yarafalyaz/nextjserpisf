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
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: Number(id) },
    include: {
      items: true,
      purchaseOrders: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!request) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Purchase Request ${request.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Purchase", href: "/purchase" },
          { label: "Requests", href: "/purchase/requests" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={request.status} />}
        actions={
          <>
            <Button href={`/purchase/requests/${request.id}/edit`} variant="primary">Edit</Button>
            <PrintButton />
            <DeleteButton id={request.id} action={deletePurchaseRequest} />
            <BackButton href="/purchase/requests" />
          </>
        }
      />

      <StatusActions
        status={request.status}
        id={request.id}
        module="pembelian/permintaan"
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={request.documentNo} mono />
        <DetailField label="Judul" value={request.title || "-"} />
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
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
        </div>
        <div className="p-4 px-5">
          {request.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Item ID</DetailTableTh>
                <DetailTableTh align="right">Qty</DetailTableTh>
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
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Purchase Order Terkait</h2>
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
                    <DetailTableTd className="font-mono"><Link href={`/purchase/orders/${po.id}`}>{po.documentNo}</Link></DetailTableTd>
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
