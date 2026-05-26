export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteWorkOrder } from "@/actions/manufacturing.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Manufacturing", href: "/manufacturing" },
  { label: "Work Orders", href: "/manufacturing/work-orders" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Work Order {wo.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={wo.status} />
  <div className="flex gap-2">
          <Link href={`/manufacturing/work-orders/${wo.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          {wo.status === "completed" && (
            <Link href={`/sales/invoices/create?salesOrderId=${wo.quotationId}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-all">+ Sales Invoice</Link>
          )}
          <DeleteButton id={wo.id} action={deleteWorkOrder} />
                  <Link href="/manufacturing/work-orders" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Customer</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/customers/${wo.customerId}`}>{wo.customer.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(wo.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Quotation</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">
              {wo.quotation ? <Link href={`/sales/quotations/${wo.quotationId}`}>{wo.quotation.documentNo}</Link> : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Total Biaya Material</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(totalCost)}</span>
          </div>
        </div>
      </div>

      {/* Items / Materials */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Materials ({wo.items.length} item)</h2>
        </div>
        <div className="p-4 px-5">
          {wo.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada material</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Cost/Unit</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {wo.items.map((item) => (
                  <tr key={item.id}>
                    <td>Item #{item.itemId}</td>
                    <td className="text-right">{Number(item.qty)}</td>
                    <td className="text-right">{formatCurrency(Number(item.cost))}</td>
                    <td className="text-right">{formatCurrency(Number(item.qty) * Number(item.cost))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-right"><strong>Total</strong></td>
                  <td className="text-right"><strong>{formatCurrency(totalCost)}</strong></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {wo.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{wo.notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}
