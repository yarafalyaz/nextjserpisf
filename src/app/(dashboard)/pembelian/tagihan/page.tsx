export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { VendorBillTable } from "./_components/vendor-bill-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tagihan" }

export const VENDOR_BILL_VALID_DB_STATUSES = [
  "draft",
  "approved",
  "paid",
] as const

export interface VendorBillsPageProps {
  statusParam?: string
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderVendorBillsPage({
  statusParam,
  searchParams,
}: VendorBillsPageProps) {
  await requirePermission("view_vendor_bills")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/pembelian/tagihan/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = VENDOR_BILL_VALID_DB_STATUSES.map(
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
        { documentNo: { contains: params.cari } },
        { vendor: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const rawBills = await prisma.vendorBill.findMany({
    where,
    include: { vendor: true, purchaseOrder: { select: { documentNo: true, isService: true } } },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const bills = rawBills.map((b) => ({
    ...b,
    grandTotal: Number(b.grandTotal),
  }))

  const total = await prisma.vendorBill.count({ where })

  const canCreateVendorPayment = await hasPermission("create_vendor_payments")

  const tableData = toPlain(bills)

  const statusChips = ["", ...VENDOR_BILL_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/pembelian/tagihan/status/${urlStatus}`
      : "/pembelian/tagihan"
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
    ? `/pembelian/tagihan/status/${activeUrlStatus}`
    : "/pembelian/tagihan"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Pembelian", href: "/pembelian" },
                { label: "Tagihan Pemasok", href: "/pembelian/tagihan" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Pembelian", href: "/pembelian" },
                { label: "Tagihan Pemasok" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tagihan Pemasok</h1>
        <CanCreate permission="create_vendor_bills">
          <Link
            href="/pembelian/tagihan/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-bill-btn"
          >
            + Buat Tagihan
          </Link>
        </CanCreate>
      </div>

      <VendorBillTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        canCreateVendorPayment={canCreateVendorPayment}
        toolbar={
          <AppSearchField
            placeholder="Cari no. dokumen atau vendor..."
            action={currentActionPath}
          />
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function VendorBillsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderVendorBillsPage({ searchParams })
}
