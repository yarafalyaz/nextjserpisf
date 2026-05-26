export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteDownPayment } from "@/actions/sales.actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function DownPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const dp = await prisma.downPayment.findUnique({
    where: { id: Number(id) },
    include: {
      quotation: true,
      customer: true,
    },
  })

  if (!dp) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Sales",href:"/sales"},{label:"Down Payments",href:"/sales/down-payments"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Down Payment {dp.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`status-badge status-${dp.status}`}>{dp.status}</span>
  <div className="flex gap-2">
          <Link href={`/sales/down-payments/${dp.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          {dp.status === "paid" && (
            <Link href={`/manufacturing/work-orders/create?quotationId=${dp.quotationId}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-all">+ Work Order</Link>
          )}
          <PrintButton />
          <DeleteButton id={dp.id} action={deleteDownPayment} />
                  <Link href="/sales/down-payments" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{dp.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Customer</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/customers/${dp.customer.id}`}>{dp.customer.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Quotation</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/sales/quotations/${dp.quotation.id}`}>{dp.quotation.documentNo}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jumlah</span>
            <span className="text-[0.9375rem] text-foreground font-medium" style={{ fontSize: "1.25rem" }}>{formatCurrency(Number(dp.amount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Bayar</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(dp.paymentDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Metode Pembayaran</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{dp.paymentMethod || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(dp.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Proof Image */}
      {dp.proofImage && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Bukti Pembayaran</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <img src={dp.proofImage} alt="Bukti pembayaran" style={{ maxWidth: "400px", borderRadius: "8px" }} />
            </span>
          </div>
        </div>
      )}

      {/* Notes */}
      {dp.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{dp.notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}
