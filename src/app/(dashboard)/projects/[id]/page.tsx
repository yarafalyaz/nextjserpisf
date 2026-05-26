export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      items: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        include: { progress: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      logs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })

  if (!project) notFound()

  const [quotations, invoices] = await Promise.all([
    prisma.quotation.findMany({
      where: { customerId: project.customerId, deletedAt: null },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesInvoice.findMany({
      where: { customerId: project.customerId, deletedAt: null },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Projects",href:"/projects"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Proyek: {project.name}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`status-badge status-${project.status}`}>{project.status}</span>
          <Link href={`/projects/${project.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <Link href="/projects" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Project detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama Proyek</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{project.name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Customer</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">
                      <Link href={`/master/customers/${project.customer.id}`}>{project.customer.name}</Link>
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
                    <span className="text-[0.9375rem] text-foreground font-medium"><span className={`status-badge status-${project.status}`}>{project.status}</span></span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Mulai</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{project.startDate ? formatDate(project.startDate) : "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Selesai</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{project.endDate ? formatDate(project.endDate) : "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(project.createdAt)}</span>
                  </div>
                  {project.notes && (
                    <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{project.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "items",
            label: "Items",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Items</h2>
                </div>
                <div className="p-4 px-5">
                  {project.items.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th>Deskripsi</th>
                          <th style={{ textAlign: "right" }}>Qty</th>
                          <th style={{ textAlign: "right" }}>Biaya</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.description || `Item #${item.itemId}`}</td>
                            <td className="text-right">{Number(item.qty)}</td>
                            <td className="text-right">{formatCurrency(Number(item.cost))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "stages",
            label: "Stages",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tahapan</h2>
                </div>
                <div className="p-4 px-5">
                  {project.stages.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada tahapan</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th>Nama</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.stages.map((stage) => (
                          <tr key={stage.id}>
                            <td>{stage.name}</td>
                            <td><span className={`status-badge status-${stage.status}`}>{stage.status}</span></td>
                            <td className="text-right">{stage.progress[0]?.percentage ?? 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "quotations",
            label: `Quotations (${quotations.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Penawaran</h2>
                  <Link href={`/sales/quotations?search=${project.customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {quotations.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada quotation</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Total</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {quotations.map((q) => (
                          <tr key={q.id}>
                            <td className="font-mono"><Link href={`/sales/quotations/${q.id}`}>{q.documentNo}</Link></td>
                            <td>{formatDate(q.date)}</td>
                            <td className="text-right">{formatCurrency(Number(q.grandTotal))}</td>
                            <td><StatusChip status={q.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "invoices",
            label: `Invoices (${invoices.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tagihan & Pembayaran</h2>
                  <Link href={`/sales/invoices?search=${project.customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {invoices.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada invoice</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Total</th><th>Terbayar</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="font-mono"><Link href={`/sales/invoices/${inv.id}`}>{inv.documentNo}</Link></td>
                            <td>{formatDate(inv.date)}</td>
                            <td className="text-right">{formatCurrency(Number(inv.grandTotal))}</td>
                            <td className="text-right">{formatCurrency(Number(inv.paidAmount))}</td>
                            <td><StatusChip status={inv.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "logs",
            label: "Logs",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Log Aktivitas</h2>
                </div>
                <div className="p-4 px-5">
                  {project.logs.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada log</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th>Aksi</th>
                          <th>Catatan</th>
                          <th>Tanggal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.logs.map((log) => (
                          <tr key={log.id}>
                            <td>{log.action}</td>
                            <td>{log.notes || "-"}</td>
                            <td>{formatDate(log.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
