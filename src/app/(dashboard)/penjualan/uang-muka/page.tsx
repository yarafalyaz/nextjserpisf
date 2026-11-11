export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import {
  statusLabel,
  statusToIndo,
  indoToStatus,
} from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { DownPaymentTable } from "./_components/down-payment-table"
import { loadDownPaymentTaxStatusRows } from "@/lib/reports/down-payment-tax-status-data"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { Plus } from "@/components/ui/fontawesome-icons"
import { formatCurrencyExact } from "@/lib/utils/format"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Uang Muka" }

export const DOWN_PAYMENT_VALID_DB_STATUSES = [
  "draft",
  "confirmed",
  "cancelled",
] as const

export interface DownPaymentsPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderDownPaymentsPage({
  statusParam,
  searchParams,
}: DownPaymentsPageProps) {
  await requirePermission("view_down_payments")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/penjualan/uang-muka/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = DOWN_PAYMENT_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { quotation: { customer: { name: { contains: params.cari } } } },
        { quotation: { documentNo: { contains: params.cari } } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const [rawDps, total, statusGroups, confirmedTotalAgg] = await Promise.all([
    prisma.downPayment.findMany({
      where,
      select: {
        id: true,
        slug: true,
        documentNo: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
        quotation: {
          select: {
            documentNo: true,
            slug: true,
            customer: { select: { name: true } },
          },
        },
      },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.downPayment.count({ where }),
    prisma.downPayment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.downPayment.aggregate({
      where: { status: "confirmed" },
      _sum: { amount: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + curr._count._all, 0),
    draft: 0,
    confirmed: 0,
    cancelled: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count._all
    }
  }

  const confirmedAmount = Number(confirmedTotalAgg._sum.amount ?? 0)

  // Snapshot PPN verbatim server per DP (read-model PR #785) untuk kolom
  // ringkas daftar — halaman tidak menghitung ulang PPN. Hanya DP halaman ini.
  const vatByDpId = new Map(
    (await loadDownPaymentTaxStatusRows({ downPaymentIds: rawDps.map((d) => d.id) })).map((row) => [
      row.downPaymentId,
      row,
    ]),
  )

  const dps = rawDps.map((dp) => ({
    id: dp.id,
    slug: dp.slug,
    documentNo: dp.documentNo,
    quotation: dp.quotation,
    amount: Number(dp.amount),
    paymentDate: dp.paymentDate,
    paymentMethod: dp.paymentMethod,
    status: dp.status,
    createdAt: dp.createdAt,
    vatSnapshot: vatByDpId.get(dp.id) ?? null,
  }))

  const tableData = toPlain(dps)

  const statusChips = ["", ...DOWN_PAYMENT_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/penjualan/uang-muka/status/${urlStatus}`
      : "/penjualan/uang-muka"
    const isActive = activeUrlStatus === urlStatus
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus
    ? `/penjualan/uang-muka/status/${activeUrlStatus}`
    : "/penjualan/uang-muka"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Penjualan", href: "/penjualan" },
                { label: "Uang Muka", href: "/penjualan/uang-muka" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Penjualan", href: "/penjualan" },
                { label: "Uang Muka" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Uang Muka Penjualan</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pencatatan uang muka pelanggan (DP), alokasi kredit, dan snapshot faktur pajak uang muka.
          </p>
        </div>
        <CanCreate permission="create_down_payments">
          <Link
            href="/penjualan/uang-muka/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-down-payment-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>+ Uang Muka</span>
          </Link>
        </CanCreate>
      </div>

      {/* KPI Metric Strip Standar ERP Internasional */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Dokumen DP
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {counts.all}
            </span>
            <span className="text-xs text-muted-foreground">dokumen</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Dikonfirmasi
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {formatCurrencyExact(confirmedAmount)}
            </span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Menunggu Verifikasi
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              {counts.draft}
            </span>
            <span className="text-xs text-muted-foreground">draf</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dikonfirmasi Masuk
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {counts.confirmed}
            </span>
            <span className="text-xs text-muted-foreground">masuk kas/bank</span>
          </div>
        </div>
      </div>

      <DownPaymentTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari pelanggan atau penawaran..."
            action={currentActionPath}
          />
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function DownPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderDownPaymentsPage({ searchParams })
}
