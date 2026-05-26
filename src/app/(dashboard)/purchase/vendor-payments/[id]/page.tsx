export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteVendorPayment } from "@/actions/purchase.actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"

export default async function VendorPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const payment = await prisma.vendorPayment.findUnique({
    where: { id: Number(id) },
    include: {
      vendor: true,
      allocations: true,
    },
  })

  if (!payment) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Purchase", href: "/purchase" },
  { label: "Vendor Payments", href: "/purchase/vendor-payments" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pembayaran Vendor {payment.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px" }}>
  <div className="flex gap-2">
          <Link href={`/purchase/vendor-payments/${payment.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <PrintButton />
          <DeleteButton id={payment.id} action={deleteVendorPayment} />
                  <Link href="/purchase/vendor-payments" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{payment.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Vendor</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/vendors/${payment.vendor.id}`}>{payment.vendor.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jumlah</span>
            <span className="text-[0.9375rem] text-foreground font-medium" style={{ fontSize: "1.25rem" }}>{formatCurrency(Number(payment.amount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Bayar</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(payment.paymentDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Metode Pembayaran</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{payment.paymentMethod}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(payment.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Allocations */}
      {payment.allocations.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Alokasi Pembayaran</h2>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Bill ID</th>
                  <th style={{ textAlign: "right" }}>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {payment.allocations.map((alloc) => (
                  <tr key={alloc.id}>
                    <td><Link href={`/purchase/bills/${alloc.vendorBillId}`}>Bill #{alloc.vendorBillId}</Link></td>
                    <td className="text-right">{formatCurrency(Number(alloc.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {payment.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{payment.notes}</span>
          </div>
        </div>
      )}
      <TransactionAttachments referenceType="vendor_payment" referenceId={payment.id} />
    </div>
  )
}
