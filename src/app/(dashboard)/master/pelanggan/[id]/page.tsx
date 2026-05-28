import { Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { Avatar } from "@heroui/react"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
      <PageHeader
        title={customer.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Customers", href: "/master/pelanggan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/pelanggan/${id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <BackButton href="/master/pelanggan" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Customer detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <DetailCard>
                <DetailField label="Email" value={customer.email || "-"} />
                <DetailField label="Telepon" value={customer.phone || "-"} />
                <DetailField label="Kota" value={customer.city || "-"} />
                <DetailField label="NPWP" value={customer.npwp || "-"} mono />
                <DetailField label="Contact Person" value={customer.contactPerson || "-"} />
                <DetailField label="Terdaftar" value={formatDate(customer.createdAt)} />
                <DetailField label="Alamat" value={customer.address || "-"} colSpan="full" />
              </DetailCard>
            ),
          },
          {
            id: "quotations",
            label: `Quotations (${customer.quotations.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Quotation Terbaru</h2>
                  <Link href={`/penjualan/penawaran?search=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.quotations.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada quotation</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh align="right">Total</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {customer.quotations.map((q) => (
                          <DetailTableRow key={q.id}>
                            <DetailTableTd className="font-mono"><Link href={`/penjualan/penawaran/${q.id}`}>{q.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(q.date)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(q.grandTotal))}</DetailTableTd>
                            <DetailTableTd><StatusChip status={q.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
                  <Link href={`/penjualan/faktur?search=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.salesInvoices.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada invoice</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh align="right">Total</DetailTableTh>
                        <DetailTableTh align="right">Terbayar</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {customer.salesInvoices.map((inv) => (
                          <DetailTableRow key={inv.id}>
                            <DetailTableTd className="font-mono"><Link href={`/penjualan/faktur/${inv.id}`}>{inv.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(inv.date)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(inv.grandTotal))}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(inv.paidAmount))}</DetailTableTd>
                            <DetailTableTd><StatusChip status={inv.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
                  <Link href={`/proyek?search=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.projects.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada proyek</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Nama Proyek</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                        <DetailTableTh>Tanggal Mulai</DetailTableTh>
                        <DetailTableTh>Tanggal Selesai</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {customer.projects.map((p) => (
                          <DetailTableRow key={p.id}>
                            <DetailTableTd><Link href={`/proyek/${p.id}`}>{p.name}</Link></DetailTableTd>
                            <DetailTableTd><StatusChip status={p.status} /></DetailTableTd>
                            <DetailTableTd>{p.startDate ? formatDate(p.startDate) : "-"}</DetailTableTd>
                            <DetailTableTd>{p.endDate ? formatDate(p.endDate) : "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
                  <Link href={`/master/pelanggan/${id}/kendaraan`} className="text-[0.8125rem] text-primary font-medium hover:underline">Kelola Kendaraan →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.customerVehicles.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada kendaraan</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Kendaraan</DetailTableTh>
                        <DetailTableTh>Plat Nomor</DetailTableTh>
                        <DetailTableTh>Tahun</DetailTableTh>
                        <DetailTableTh>Warna</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {customer.customerVehicles.map((cv) => (
                          <DetailTableRow key={cv.id}>
                            <DetailTableTd>{cv.vehicle?.variant?.name || `Vehicle #${cv.kendaraanId}`}</DetailTableTd>
                            <DetailTableTd className="font-mono">{cv.vehicle?.plateNumber || "-"}</DetailTableTd>
                            <DetailTableTd>{cv.vehicle?.year || "-"}</DetailTableTd>
                            <DetailTableTd>{cv.vehicle?.color || "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
