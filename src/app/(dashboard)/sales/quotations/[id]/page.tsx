import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_quotations")
  const { id } = await params

  const quotation = await prisma.quotation.findUnique({
    where: { id: Number(id), deletedAt: null },
    include: {
      customer: true,
      sections: { include: { items: true }, orderBy: { sortOrder: "asc" } },
      downPayments: true,
      histories: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })

  if (!quotation) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Sales", href: "/sales" },
  { label: "Quotations", href: "/sales/quotations" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Quotation {quotation.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={quotation.status} />

          <Link href={`/sales/quotations/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <PrintButton />
          {quotation.status === "approved" && (
            <>
              <Link href={`/sales/orders/create?quotationId=${id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-all">+ Sales Order</Link>
            </>
          )}
          <Link href="/sales/quotations" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Quotation detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <StatusActions
        status={quotation.status}
        id={quotation.id}
        module="sales/quotations"
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Customer</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">
                        <Link href={`/master/customers/${quotation.customerId}`}>{quotation.customer.name}</Link>
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(quotation.date)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Valid Sampai</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(quotation.validUntil)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Grand Total</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(quotation.grandTotal))}</span>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Subtotal</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(quotation.subtotal))}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Diskon</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(quotation.discount))}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Pajak</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(quotation.tax))}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Grand Total</span>
                      <span className="text-[0.9375rem] text-foreground font-medium" style={{ fontSize: "1.25rem" }}>{formatCurrency(Number(quotation.grandTotal))}</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {quotation.notes && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{quotation.notes}</span>
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Items",
            content: (
              <>
                {/* Sections & Items */}
                {quotation.sections.map((section) => (
                  <div key={section.id} className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                      <h2 className="text-[0.9375rem] font-semibold text-foreground">{section.name}</h2>
                    </div>
                    <div className="p-4 px-5">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th>Deskripsi</th>
                            <th style={{ textAlign: "right" }}>Qty</th>
                            <th style={{ textAlign: "right" }}>Harga</th>
                            <th style={{ textAlign: "right" }}>Diskon</th>
                            <th style={{ textAlign: "right" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.description || "-"}</td>
                              <td className="text-right">{Number(item.qty)}</td>
                              <td className="text-right">{formatCurrency(Number(item.unitPrice))}</td>
                              <td className="text-right">{formatCurrency(Number(item.discount))}</td>
                              <td className="text-right">{formatCurrency(Number(item.total))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Down Payments */}
                {quotation.downPayments.length > 0 && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                      <h2 className="text-[0.9375rem] font-semibold text-foreground">Down Payments</h2>
                    </div>
                    <div className="p-4 px-5">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr><th>Jumlah</th><th>Status</th><th>Dibuat</th></tr>
                        </thead>
                        <tbody>
                          {quotation.downPayments.map((dp) => (
                            <tr key={dp.id}>
                              <td>{formatCurrency(Number(dp.amount))}</td>
                              <td><StatusChip status={dp.status} /></td>
                              <td>{formatDate(dp.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "history",
            label: "History",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat</h2>
                </div>
                <div className="p-4 px-5">
                  {quotation.histories.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada riwayat</p>
                  ) : (
                    quotation.histories.map((h) => (
                      <div key={h.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color)", fontSize: "0.8125rem" }}>
                        <strong>{h.action}</strong> — {h.description || ""} <span className="text-muted">({formatDate(h.createdAt)})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
