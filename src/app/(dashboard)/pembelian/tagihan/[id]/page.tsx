export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVendorBill } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function VendorBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const bill = await prisma.vendorBill.findUnique({
    where: { id: Number(id) },
    include: {
      vendor: true,
      purchaseOrder: true,
      items: true,
    },
  })

  if (!bill) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Tagihan",href:"/pembelian/tagihan"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tagihan {bill.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <span className={`status-badge status-${bill.status}`}>{bill.status}</span>
  <div className="flex gap-2">
          <Link href={`/purchase/bills/${bill.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <PrintButton />
          <DeleteButton id={bill.id} action={deleteVendorBill} />
                  <Link href="/pembelian/tagihan" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <StatusActions
        status={bill.status}
        id={bill.id}
        module="pembelian/tagihan"
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{bill.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Vendor</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/vendors/${bill.vendor.id}`}>{bill.vendor.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Purchase Order</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {bill.purchaseOrder ? (
                <Link href={`/purchase/orders/${bill.purchaseOrder.id}`}>{bill.purchaseOrder.documentNo}</Link>
              ) : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(bill.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jatuh Tempo</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{bill.dueDate ? formatDate(bill.dueDate) : "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Grand Total</span>
            <span className="text-xl text-foreground font-medium">{formatCurrency(Number(bill.grandTotal))}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Deskripsi</DetailTableTh>
              <DetailTableTh align="right">Qty</DetailTableTh>
              <DetailTableTh align="right">Harga</DetailTableTh>
              <DetailTableTh align="right">Total</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {bill.items.map((item) => (
                <DetailTableRow key={item.id}>
                  <DetailTableTd>{item.description || "-"}</DetailTableTd>
                  <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.unitPrice))}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(Number(item.total))}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Subtotal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(bill.subtotal))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Pajak</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(bill.tax))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Terbayar</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(bill.paidAmount))}</span>
          </div>
        </div>
      </div>
      <TransactionAttachments referenceType="vendor_bill" referenceId={bill.id} />
    </div>
  )
}
