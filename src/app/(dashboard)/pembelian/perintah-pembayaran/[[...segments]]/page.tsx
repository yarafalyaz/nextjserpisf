export const dynamic = 'force-dynamic'

import { Fragment } from 'react'
import { prisma } from '@/lib/db/prisma'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { formatAccounting, formatCurrency, formatDate } from '@/lib/utils/format'
import { toLocalDateOnly } from '@/lib/utils/date-only'
import { safeAdd, safeSubtract } from '@/lib/utils/math'
import { agingBucket, daysOverdue } from '@/lib/reports/aging'
import { RECOGNISED_AP_STATUSES } from '@/lib/reports/document-status'
import { AppBreadcrumbs } from '@/components/ui/breadcrumbs'
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from '@/components/ui/detail-table'
import { EmptyState } from '@/components/ui/empty-state'
import { ExportButtons } from '@/components/reports/export-buttons'
import { ReportLetterhead } from '@/components/reports/report-letterhead'
import { ReportSection, ReportKpiCard } from '@/components/reports/report-section'
import { ReportNarration } from '@/components/reports/report-narration'
import { notFound, redirect } from 'next/navigation'
import { parsePathFilterSegments } from '@/lib/utils/path-filters'
import { PaymentOrderFilterForm } from '../_components/payment-order-filter-form'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: "Perintah Pembayaran" }

/**
 * Perintah Pembayaran (payment order): the printable instruction listing which
 * vendor bills are to be paid — grouped per vendor with subtotals — so finance
 * can execute the transfers. It does NOT post anything to the GL; the actual
 * settlement is recorded in Pembayaran Vendor as usual.
 */
export default async function PaymentOrderPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ vendorId?: string; sampaiTanggal?: string }>
}) {
  await requireAnyPermission(["view_vendor_bills", "view_vendor_payments"])

  const params = await searchParams
  const { segments } = await routeParams

  // Tautan lama `?sampaiTanggal=`/`?vendorId=` diarahkan ke bentuk path
  // (`/sampai/<tanggal>`, `/pemasok/<slug>`).
  if (params.sampaiTanggal || params.vendorId) {
    const legacyVendorId = params.vendorId ? Number(params.vendorId) : null
    const legacyVendor =
      legacyVendorId && Number.isInteger(legacyVendorId) && legacyVendorId > 0
        ? await prisma.vendor.findUnique({
            where: { id: legacyVendorId },
            select: { slug: true },
          })
        : null
    const legacyPath = [
      "/pembelian/perintah-pembayaran",
      ...(params.sampaiTanggal ? [`sampai/${params.sampaiTanggal}`] : []),
      ...(legacyVendor?.slug ? [`pemasok/${legacyVendor.slug}`] : []),
    ].join("/")
    redirect(legacyPath)
  }

  const filters = parsePathFilterSegments(segments, {
    sampai: /^\d{4}-\d{2}-\d{2}$/,
    pemasok: /^[A-Za-z0-9][A-Za-z0-9-_]*$/,
  })
  if (!filters) notFound()

  const now = new Date()
  const dueThrough = filters.sampai ? new Date(filters.sampai) : now
  dueThrough.setHours(23, 59, 59, 999)

  // Pemasok dari path (slug lebih dulu, id sebagai cadangan — pola laporan).
  const vendorSegment = filters.pemasok
  const selectedVendor = vendorSegment
    ? await prisma.vendor.findFirst({
        where: {
          OR: [
            { slug: vendorSegment },
            ...(/^\d+$/.test(vendorSegment) ? [{ id: Number(vendorSegment) }] : []),
          ],
        },
        select: { id: true, slug: true },
      })
    : null
  if (vendorSegment && !selectedVendor) notFound()
  const vendorId = selectedVendor?.id ?? null

  const [vendors, bills] = await Promise.all([
    prisma.vendor.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, slug: true, code: true, name: true } }),
    prisma.vendorBill.findMany({
      where: {
        status: { in: [...RECOGNISED_AP_STATUSES] },
        deletedAt: null,
        ...(vendorId ? { vendorId } : {}),
        OR: [{ dueDate: { lte: dueThrough } }, { dueDate: null }],
      },
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: [{ vendorId: 'asc' }, { dueDate: 'asc' }],
    }),
  ])

  const rows = bills
    .map((bill) => ({
      key: bill.id,
      vendorId: bill.vendorId,
      vendorName: bill.vendor.name,
      documentNo: bill.documentNo,
      date: bill.date,
      dueDate: bill.dueDate,
      overdueDays: bill.dueDate ? daysOverdue(bill.dueDate, now) : null,
      ageBucket: bill.dueDate ? agingBucket(daysOverdue(bill.dueDate, now)) : 'Tanpa Jatuh Tempo',
      remaining: safeSubtract(bill.grandTotal, bill.paidAmount, 2),
    }))
    .filter((row) => row.remaining > 0)

  // Group per vendor so the printed order reads as a per-supplier instruction.
  const groups = new Map<number, { vendorName: string; rows: typeof rows; total: number }>()
  for (const row of rows) {
    const group = groups.get(row.vendorId) ?? { vendorName: row.vendorName, rows: [], total: 0 }
    group.rows.push(row)
    group.total = safeAdd(group.total, row.remaining, 2)
    groups.set(row.vendorId, group)
  }
  const grouped = Array.from(groups.entries())
    .map(([vendorIdKey, group]) => ({ vendorId: vendorIdKey, ...group }))
    .sort((a, b) => b.total - a.total)

  const total = rows.reduce((sum, row) => safeAdd(sum, row.remaining, 2), 0)
  const periodLabel = `Jatuh tempo s/d ${dueThrough.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Perintah Pembayaran" },
        ]} />
      </div>

      <PaymentOrderFilterForm
        vendors={vendors.map((v) => ({ value: v.slug ?? String(v.id), label: `${v.code ? `${v.code} — ` : ""}${v.name}` }))}
        vendorSegment={selectedVendor ? (selectedVendor.slug ?? String(selectedVendor.id)) : undefined}
        sampaiTanggal={toLocalDateOnly(dueThrough)}
      />

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Perintah_Pembayaran" />
      </div>

      <ReportLetterhead title="Perintah Pembayaran" subtitle="Perintah Pembayaran" periodLabel={periodLabel} />
      <ReportNarration text="Perintah Pembayaran merangkum tagihan vendor yang sudah jatuh tempo (serta tagihan tanpa jatuh tempo) untuk dieksekusi pembayarannya, dikelompokkan per pemasok dengan subtotal dan total keseluruhan. Dokumen ini adalah instruksi pembayaran — pencatatan pelunasan tetap dilakukan pada menu Pembayaran Vendor agar jurnal terbentuk." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Jumlah Pemasok" value={String(grouped.length)} />
        <ReportKpiCard label="Jumlah Tagihan" value={String(rows.length)} />
        <ReportKpiCard label="Total Akan Dibayar" value={formatCurrency(total)} valueClassName="text-danger" />
      </div>

      <ReportSection title="Daftar Tagihan per Pemasok">
        <DetailTable data-report-table="Perintah Pembayaran">
          <DetailTableHead>
            <DetailTableTh>Pemasok</DetailTableTh>
            <DetailTableTh>No. Tagihan</DetailTableTh>
            <DetailTableTh>Tanggal</DetailTableTh>
            <DetailTableTh>Jatuh Tempo</DetailTableTh>
            <DetailTableTh>Umur</DetailTableTh>
            <DetailTableTh align="right">Sisa (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {grouped.map((group) => (
              <Fragment key={group.vendorId}>
                {group.rows.map((row) => (
                  <DetailTableRow key={row.key}>
                    <DetailTableTd className="font-medium">{row.vendorName}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs">{row.documentNo}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <DetailTableTd>{row.dueDate ? formatDate(row.dueDate) : "Tanpa jatuh tempo"}</DetailTableTd>
                    <DetailTableTd>{row.ageBucket}</DetailTableTd>
                    <DetailTableTd align="right">{formatAccounting(row.remaining, { zeroDash: false })}</DetailTableTd>
                  </DetailTableRow>
                ))}
                <DetailTableRow className="bg-muted/40">
                  <DetailTableTd colSpan={5} className="font-semibold">Subtotal {group.vendorName}</DetailTableTd>
                  <DetailTableTd align="right" className="font-semibold">{formatAccounting(group.total, { zeroDash: false })}</DetailTableTd>
                </DetailTableRow>
              </Fragment>
            ))}
            {grouped.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={6}><EmptyState title="Tidak ada tagihan yang jatuh tempo" className="py-6" /></DetailTableTd>
              </DetailTableRow>
            )}
            {grouped.length > 0 && (
              <DetailTableRow className="border-t-2 border-default font-bold">
                <DetailTableTd colSpan={5}>TOTAL AKAN DIBAYAR</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(total, { zeroDash: false })}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  )
}
