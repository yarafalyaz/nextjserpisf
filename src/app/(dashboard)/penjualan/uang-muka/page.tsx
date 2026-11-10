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

  const [rawDps, total] = await Promise.all([
    prisma.downPayment.findMany({
      where,
      include: { quotation: { include: { customer: true } } },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.downPayment.count({ where }),
  ])

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
    quotation: dp.quotation,
    amount: Number(dp.amount),
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

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
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
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Uang Muka</h1>
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
