import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Avatar } from "@heroui/react"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_customers")
  const { id } = await params

  const customer = await prisma.customer.findUnique({
    where: { id: Number(id), deletedAt: null },
    include: {
      quotations: { take: 10, orderBy: { createdAt: "desc" } },
      salesInvoices: { take: 10, orderBy: { createdAt: "desc" } },
      salesOrders: { take: 5, orderBy: { createdAt: "desc" } },
      projects: { take: 10, orderBy: { createdAt: "desc" } },
      customerVehicles: {
        take: 10,
        include: { vehicle: { include: { variant: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!customer) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Customers", href: "/master/customers" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg" color="accent">
            <Avatar.Fallback>{getInitials(customer.name)}</Avatar.Fallback>
          </Avatar>
          <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href={`/master/customers/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <Link href="/master/customers" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Customer detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Email</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{customer.email || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Telepon</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{customer.phone || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Kota</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{customer.city || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">NPWP</span>
                    <span className="text-[0.9375rem] text-foreground font-medium font-mono">{customer.npwp || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Contact Person</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{customer.contactPerson || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Terdaftar</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(customer.createdAt)}</span>
                  </div>
                  <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Alamat</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{customer.address || "-"}</span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "quotations",
            label: `Quotations (${customer.quotations.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Quotation Terbaru</h2>
                  <Link href={`/sales/quotations?search=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.quotations.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada quotation</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Total</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {customer.quotations.map((q) => (
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
            label: `Invoices (${customer.salesInvoices.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Invoice Terbaru</h2>
                  <Link href={`/sales/invoices?search=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.salesInvoices.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada invoice</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Total</th><th>Terbayar</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {customer.salesInvoices.map((inv) => (
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
            id: "projects",
            label: `Projects (${customer.projects.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Proyek</h2>
                  <Link href={`/projects?search=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.projects.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada proyek</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>Nama Proyek</th><th>Status</th><th>Tanggal Mulai</th><th>Tanggal Selesai</th></tr>
                      </thead>
                      <tbody>
                        {customer.projects.map((p) => (
                          <tr key={p.id}>
                            <td><Link href={`/projects/${p.id}`}>{p.name}</Link></td>
                            <td><StatusChip status={p.status} /></td>
                            <td>{p.startDate ? formatDate(p.startDate) : "-"}</td>
                            <td>{p.endDate ? formatDate(p.endDate) : "-"}</td>
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
            id: "vehicles",
            label: `Vehicles (${customer.customerVehicles.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Kendaraan</h2>
                </div>
                <div className="p-4 px-5">
                  {customer.customerVehicles.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada kendaraan</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>Kendaraan</th><th>Plat Nomor</th><th>Tahun</th><th>Warna</th></tr>
                      </thead>
                      <tbody>
                        {customer.customerVehicles.map((cv) => (
                          <tr key={cv.id}>
                            <td>{cv.vehicle?.variant?.name || `Vehicle #${cv.vehicleId}`}</td>
                            <td className="font-mono">{cv.vehicle?.plateNumber || "-"}</td>
                            <td>{cv.vehicle?.year || "-"}</td>
                            <td>{cv.vehicle?.color || "-"}</td>
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
