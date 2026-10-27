import { Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { loadCustomerTaxCompleteness } from "@/lib/reports/customer-tax-identity-data"
import { deriveSnapshotMarkers, NPWP_LEGACY15_WARNING } from "@/lib/tax/customer-tax-identity"
import { entityEditHref, entityHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pelanggan" }

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_customers")
  const { slug } = await params

  const customer = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.customer.findFirst({
          where: { slug: s, ...where },
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
        }),
      byId: (id, where) =>
        prisma.customer.findUnique({
          where: { id, ...where },
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
        }),
    },
  )

  if (!customer) notFound()

  const [taxCompletenessRows, taxInvoices] = await Promise.all([
    loadCustomerTaxCompleteness([customer.id]),
    prisma.taxInvoice.findMany({
      where: { direction: "out", salesInvoice: { customerId: customer.id, deletedAt: null }, djpStatus: { not: "cancelled" } },
      orderBy: { taxInvoiceDate: "desc" },
      take: 10,
      select: { id: true, taxInvoiceNumber: true, taxInvoiceDate: true, counterpartyName: true, counterpartyTaxId: true, counterpartyNitku: true },
    }),
  ])
  const taxCompleteness = taxCompletenessRows[0]?.completeness
  const NPWP_FORMAT_LABEL: Record<string, string> = {
    canonical16: "bentuk 16 digit",
    legacy15: "bentuk 15 digit (legacy)",
    invalid: "bentuk tidak sah",
    absent: "kosong",
  }
  const PKP_LABEL: Record<string, string> = { pkp: "PKP", non_pkp: "Bukan PKP", unknown: "Belum diketahui" }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={customer.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Pelanggan", href: "/master/pelanggan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_customers">
              <Button href={entityEditHref("/master/pelanggan", customer)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <BackButton href="/master/pelanggan" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Tab detail pelanggan"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <DetailCard>
                <DetailField label="Surel" value={customer.email || "-"} />
                <DetailField label="Telepon" value={customer.phone || "-"} />
                <DetailField label="Kota" value={customer.city || "-"} />
                <DetailField label="Narahubung" value={customer.contactPerson || "-"} />
                <DetailField label="Terdaftar" value={formatDate(customer.createdAt)} />
                <DetailField label="Alamat" value={customer.address || "-"} colSpan="full" />
              </DetailCard>
            ),
          },
          {
            id: "tax-identity",
            label: "Identitas Pajak",
            content: (
              <div className="flex flex-col gap-4">
                <DetailCard>
                  <DetailField label="Nama Wajib Pajak" value={customer.taxpayerName || "-"} />
                  <DetailField label="NPWP" value={customer.taxId ? `${customer.taxId} (${NPWP_FORMAT_LABEL[taxCompleteness?.npwpFormat ?? "absent"]})` : "-"} />
                  <DetailField label="NITKU" value={customer.nitku || "-"} />
                  <DetailField label="Status PKP" value={PKP_LABEL[customer.pkpStatus] ?? customer.pkpStatus} />
                  <DetailField label="Tanggal Pengukuhan PKP" value={customer.pkpEffectiveFrom ? formatDate(customer.pkpEffectiveFrom) : "-"} />
                  <DetailField label="Sumber Status PKP" value={customer.pkpSource || "-"} />
                  <DetailField label="Alamat Pajak" value={customer.taxAddress || "-"} colSpan="full" />
                </DetailCard>
                <p className="text-xs text-muted-foreground">Alamat pajak master dipakai ekspor Coretax secara live — belum dibekukan ke dokumen.</p>
                {taxCompleteness?.npwpFormat === "legacy15" ? (
                  <p role="alert" className="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm">{NPWP_LEGACY15_WARNING}</p>
                ) : null}
                {taxCompleteness && !taxCompleteness.ready ? (
                  <p className="text-sm text-muted-foreground">
                    Belum siap terbit faktur pajak: kurang {taxCompleteness.missing.join(", ")}.
                    {taxCompleteness.usesTradeNameFallback ? " Nama wajib pajak kosong — nama dagang tampil sebagai penanda, bukan pengganti gerbang faktur." : ""}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Identitas pajak master terisi untuk gerbang terbit faktur pajak.</p>
                )}
                <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                  <div className="p-4 px-5 border-b border-default">
                    <h2 className="text-[0.9375rem] font-semibold text-foreground">Snapshot Faktur Pajak Terbit</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Identitas di bawah dibekukan saat faktur terbit — perubahan master sesudahnya tidak mengubah snapshot ini.</p>
                  </div>
                  <div className="p-4 px-5">
                    {taxInvoices.length === 0 ? (
                      <EmptyState title="Belum ada faktur pajak terbit" className="py-10" />
                    ) : (
                      <DetailTable>
                        <DetailTableHead>
                          <DetailTableTh>No. Faktur Pajak</DetailTableTh>
                          <DetailTableTh>Tanggal</DetailTableTh>
                          <DetailTableTh>Nama Snapshot</DetailTableTh>
                          <DetailTableTh>NPWP Snapshot</DetailTableTh>
                          <DetailTableTh>NITKU Snapshot</DetailTableTh>
                        </DetailTableHead>
                        <DetailTableBody>
                          {taxInvoices.map((inv) => {
                            const markers = deriveSnapshotMarkers(inv)
                            return (
                              <DetailTableRow key={inv.id}>
                                <DetailTableTd className="font-mono">{inv.taxInvoiceNumber}</DetailTableTd>
                                <DetailTableTd>{formatDate(inv.taxInvoiceDate)}</DetailTableTd>
                                <DetailTableTd>{inv.counterpartyName || "-"}</DetailTableTd>
                                <DetailTableTd>{inv.counterpartyTaxId ? `${inv.counterpartyTaxId} (${NPWP_FORMAT_LABEL[markers.npwpFormat]})` : "-"}</DetailTableTd>
                                <DetailTableTd>{inv.counterpartyNitku ? (markers.nitkuUnlinked ? `${inv.counterpartyNitku} (belum tertaut — NPWP snapshot bukan 16 digit)` : inv.counterpartyNitku) : "(kosong — terbit bertanda nitkuAbsent)"}</DetailTableTd>
                              </DetailTableRow>
                            )
                          })}
                        </DetailTableBody>
                      </DetailTable>
                    )}
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "quotations",
            label: `Penawaran (${customer.quotations.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Penawaran Terbaru</h2>
                  <Link href={`/penjualan/penawaran?cari=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.quotations.length === 0 ? (
                    <EmptyState title="Belum ada penawaran" />
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
                            <DetailTableTd className="font-mono"><Link href={entityHref("/penjualan/penawaran", q)}>{q.documentNo}</Link></DetailTableTd>
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
            label: `Faktur (${customer.salesInvoices.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Faktur Terbaru</h2>
                  <Link href={`/penjualan/faktur?cari=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.salesInvoices.length === 0 ? (
                    <EmptyState title="Belum ada faktur" />
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
                            <DetailTableTd className="font-mono"><Link href={entityHref("/penjualan/faktur", inv)}>{inv.documentNo}</Link></DetailTableTd>
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
            label: `Proyek (${customer.projects.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Proyek</h2>
                  <Link href={`/proyek?cari=${customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.projects.length === 0 ? (
                    <EmptyState title="Belum ada proyek" />
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
                            <DetailTableTd><Link href={entityHref("/proyek", p)}>{p.name}</Link></DetailTableTd>
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
            label: `Kendaraan (${customer.customerVehicles.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Kendaraan</h2>
                  <Link href={`${entityHref("/master/pelanggan", customer)}/kendaraan`} className="text-[0.8125rem] text-primary font-medium hover:underline">Kelola Kendaraan →</Link>
                </div>
                <div className="p-4 px-5">
                  {customer.customerVehicles.length === 0 ? (
                    <EmptyState title="Belum ada kendaraan" />
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
                            <DetailTableTd>{cv.vehicle?.variant?.name || `Kendaraan #${cv.vehicleId}`}</DetailTableTd>
                            <DetailTableTd className="font-mono">{cv.plateNumber || "-"}</DetailTableTd>
                            <DetailTableTd>{cv.vehicle?.year || "-"}</DetailTableTd>
                            <DetailTableTd>{cv.color || "-"}</DetailTableTd>
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
