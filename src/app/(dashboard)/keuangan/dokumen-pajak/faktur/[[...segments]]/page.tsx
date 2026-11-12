export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { parsePathFilterSegments, buildPathFilterHref } from "@/lib/utils/path-filters"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { PageHeader } from "@/components/ui/page-header"
import { CanCreate } from "@/components/auth/can-create"
import { TaxInvoiceDraftQueueCard } from "@/components/reports/tax-invoice-draft-queue-card"
import { getTaxInvoiceDraftQueue } from "@/lib/reports/tax-invoice-draft-queue-data"
import { TaxInvoiceTable, type TaxInvoiceRow } from "../../_components/tax-invoice-table"
import { statusToIndo, indoToStatus, statusLabel } from "@/lib/utils/status-labels"
import {
  Plus,
  FileCheck,
  TrendingUp,
  TrendingDown,
  Receipt,
  FileSpreadsheet,
} from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Daftar Faktur Pajak" }

export const TAX_INVOICE_VALID_DB_STATUSES = [
  "draft",
  "approved",
  "cancelled",
  "replaced",
] as const

const ARAH_TO_DB: Record<string, "out" | "in"> = {
  keluaran: "out",
  masukan: "in",
}

const DB_TO_ARAH: Record<string, string> = {
  out: "keluaran",
  in: "masukan",
}

export default async function TaxInvoicesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{
    status?: string
    arah?: string
    halaman?: string
    pageSize?: string
    cari?: string
  }>
}) {
  await requirePermission("create_tax_invoices")

  const { segments } = await routeParams
  const params = await searchParams

  const filters = parsePathFilterSegments(segments, {
    status: /^[a-z_-]+$/,
    arah: /^(keluaran|masukan)$/,
  })

  // Format path tidak valid atau kunci tak dikenal
  if (!filters) {
    notFound()
  }

  // Redirect link query lama ?status= atau ?arah= ke pasangan path kanonik ERP
  if (params.status || params.arah) {
    const rawStatus = params.status
    const mappedStatus = rawStatus ? (statusToIndo[rawStatus] || rawStatus) : filters.status
    const rawArah = params.arah
    const mappedArah = rawArah ? (DB_TO_ARAH[rawArah] || rawArah) : filters.arah

    const canonicalPath = buildPathFilterHref("/keuangan/dokumen-pajak/faktur", {
      status: mappedStatus,
      arah: mappedArah,
    })

    const qs = new URLSearchParams()
    if (params.cari) qs.set("cari", params.cari)
    if (params.halaman) qs.set("halaman", params.halaman)
    if (params.pageSize) qs.set("pageSize", params.pageSize)
    const queryString = qs.toString()

    redirect(queryString ? `${canonicalPath}?${queryString}` : canonicalPath)
  }

  // Validasi nilai status path segment
  const validUrlStatuses = TAX_INVOICE_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )
  if (filters.status && !validUrlStatuses.includes(filters.status)) {
    notFound()
  }

  const activeUrlStatus = filters.status ?? ""
  const activeUrlArah = filters.arah ?? ""

  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined
  const dbDirection = activeUrlArah ? ARAH_TO_DB[activeUrlArah] : undefined

  const { page, pageSize, take } = parsePagination(params)
  const search = params.cari?.trim() || undefined

  const where = {
    ...(dbStatus && { djpStatus: dbStatus }),
    ...(dbDirection && { direction: dbDirection }),
    ...(search && {
      OR: [
        { taxInvoiceNumber: { contains: search } },
        { counterpartyName: { contains: search } },
        { counterpartyTaxId: { contains: search } },
      ],
    }),
  }

  const [invoices, total, outCount, inCount, draftCount] = await Promise.all([
    prisma.taxInvoice.findMany({
      where,
      orderBy: { taxInvoiceDate: "desc" },
      skip: (page - 1) * pageSize,
      take,
    }),
    prisma.taxInvoice.count({ where }),
    prisma.taxInvoice.count({ where: { direction: "out" } }),
    prisma.taxInvoice.count({ where: { direction: "in" } }),
    prisma.taxInvoice.count({ where: { djpStatus: "draft" } }),
  ])

  const draftQueue = await getTaxInvoiceDraftQueue()

  const tableData: TaxInvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    slug: inv.slug,
    taxInvoiceNumber: inv.taxInvoiceNumber,
    direction: inv.direction as "out" | "in",
    transactionCode: inv.transactionCode,
    taxInvoiceDate: inv.taxInvoiceDate.toISOString(),
    taxPeriod: inv.taxPeriod,
    dpp: Number(inv.dpp),
    taxRate: Number(inv.taxRate),
    taxAmount: Number(inv.taxAmount),
    djpStatus: inv.djpStatus,
    counterpartyName: inv.counterpartyName,
    counterpartyTaxId: inv.counterpartyTaxId,
    creditStatus: inv.creditStatus,
  }))

  const filterChips = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Arah Filter (Path Segments: /arah/keluaran atau /arah/masukan) */}
      <div className="flex items-center gap-1">
        {[
          { label: "Semua Arah", val: "" },
          { label: "Keluaran (PK)", val: "keluaran" },
          { label: "Masukan (PM)", val: "masukan" },
        ].map((dir) => {
          const isActive = activeUrlArah === dir.val
          const targetPath = buildPathFilterHref("/keuangan/dokumen-pajak/faktur", {
            status: activeUrlStatus || undefined,
            arah: dir.val || undefined,
          })

          return (
            <Link
              key={dir.val || "semua"}
              href={withListParams(targetPath, params, {
                halaman: undefined,
              })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-foreground text-background font-semibold"
                  : "bg-surface border border-default text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {dir.label}
            </Link>
          )
        })}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Status Filter (Path Segments: /status/konsep, /status/disetujui, dst) */}
      <div className="flex items-center gap-1">
        {[
          { label: "Semua Status", dbKey: "" },
          ...TAX_INVOICE_VALID_DB_STATUSES.map((key) => ({
            label: statusLabel(key),
            dbKey: key,
          })),
        ].map((item) => {
          const urlSlug = item.dbKey ? statusToIndo[item.dbKey] || item.dbKey : ""
          const isActive = activeUrlStatus === urlSlug
          const targetPath = buildPathFilterHref("/keuangan/dokumen-pajak/faktur", {
            status: urlSlug || undefined,
            arah: activeUrlArah || undefined,
          })

          return (
            <Link
              key={item.dbKey || "all"}
              href={withListParams(targetPath, params, {
                halaman: undefined,
              })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-foreground text-background font-semibold"
                  : "bg-surface border border-default text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )

  const breadcrumbs = [
    { label: "Dasbor", href: "/" },
    { label: "Keuangan", href: "/keuangan" },
    { label: "Dokumen Pajak", href: "/keuangan/dokumen-pajak/faktur" },
    ...(activeUrlStatus ? [{ label: statusLabel(dbStatus) }] : []),
    ...(activeUrlArah ? [{ label: activeUrlArah === "keluaran" ? "Keluaran (PK)" : "Masukan (PM)" }] : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dokumen Pajak (Faktur Pajak)"
        subtitle="Registrasi dan administrasi faktur pajak pertambahan nilai (PPN) keluaran dan masukan terintegrasi Coretax / e-Faktur DJP."
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/keuangan/dokumen-pajak/bupot"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <Receipt className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Bukti Potong</span>
            </Link>
            <Link
              href="/laporan/pajak"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <FileSpreadsheet className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Rekap SPT PPN</span>
            </Link>
            <CanCreate permission="create_tax_invoices">
              <Link
                href="/keuangan/dokumen-pajak/faktur/tambah"
                className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs transition-colors cursor-pointer"
                id="create-tax-invoice-btn"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Terbitkan Faktur Pajak</span>
              </Link>
            </CanCreate>
          </div>
        }
      />

      {/* Financial Metric Strip */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <FileCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Total Dokumen Tercatat</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {total} <span className="text-sm font-normal text-muted-foreground">faktur</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Faktur Pajak Keluaran (PK)</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 font-mono tabular-nums">
            {outCount} <span className="text-sm font-normal text-muted-foreground">faktur</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Faktur Pajak Masukan (PM)</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400 font-mono tabular-nums">
            {inCount} <span className="text-sm font-normal text-muted-foreground">faktur</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <FileCheck className="size-4 text-amber-500" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Draft Menunggu Upload</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {draftCount} <span className="text-sm font-normal text-muted-foreground">dokumen</span>
          </p>
        </div>
      </div>

      {/* Exception Queue */}
      <TaxInvoiceDraftQueueCard queue={draftQueue} />

      {/* Main Data Table */}
      <TaxInvoiceTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        filters={filterChips}
      />
    </div>
  )
}
