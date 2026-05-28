export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteWorkOrder } from "@/actions/manufacturing.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { PrintButton } from "@/components/ui/print-button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_work_orders")
  const { id } = await params

  const wo = await prisma.workOrder.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      quotation: true,
      items: true,
    },
  })

  if (!wo) notFound()

  const totalCost = wo.items.reduce((sum, item) => sum + Number(item.qty) * Number(item.cost), 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Work Order ${wo.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Manufacturing", href: "/produksi" },
          { label: "Work Orders", href: "/produksi/perintah-kerja" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={wo.status} />}
        actions={
          <>
            <Button href={`/produksi/perintah-kerja/${wo.id}/ubah`} variant="primary">Ubah</Button>
            {wo.status === "completed" && (
              <Button href={`/penjualan/faktur/tambah?pesananPenjualanId=${wo.quotationId}`} variant="primary">+ Sales Invoice</Button>
            )}
            <PrintButton documentType="work-order" documentId={wo.id} />
            <DeleteButton id={wo.id} action={deleteWorkOrder} />
            <BackButton href="/produksi/perintah-kerja" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Pelanggan" value={<Link href={`/master/pelanggan/${wo.customerId}`}>{wo.customer.name}</Link>} />
        <DetailField label="Tanggal" value={formatDate(wo.date)} />
        <DetailField label="Penawaran" value={wo.quotation ? <Link href={`/penjualan/penawaran/${wo.quotationId}`}>{wo.quotation.documentNo}</Link> : "-"} mono />
        <DetailField label="Total Biaya Material" value={formatCurrency(totalCost)} />
      </DetailCard>

      {/* Items / Materials */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Materials ({wo.items.length} item)</h2>
        </div>
        <div className="p-4 px-5">
          {wo.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada material</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Item ID</DetailTableTh>
                <DetailTableTh>Deskripsi</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh align="right">Qty</DetailTableTh>
                <DetailTableTh align="right">Cost/Unit</DetailTableTh>
                <DetailTableTh align="right">Total</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {wo.items.map((item: any) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>Item #{item.itemId}</DetailTableTd>
                    <DetailTableTd>{item.description || "-"}</DetailTableTd>
                    <DetailTableTd><StatusChip status={item.status || "pending"} /></DetailTableTd>
                    <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(item.cost))}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(item.qty) * Number(item.cost))}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow>
                  <DetailTableTd colSpan={5} align="right" className="font-bold">Total</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">{formatCurrency(totalCost)}</DetailTableTd>
                </DetailTableFootRow>
              </DetailTableFoot>
            </DetailTable>
          )}
        </div>
      </div>

      {wo.notes && (
        <DetailCard>
          <DetailField label="Catatan" value={wo.notes} colSpan="full" />
        </DetailCard>
      )}
    </div>
  )
}
