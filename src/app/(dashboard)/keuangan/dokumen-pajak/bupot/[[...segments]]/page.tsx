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
import { WithholdingCertificateTable, type WithholdingCertificateRow } from "../../_components/withholding-certificate-table"
import { statusToIndo, indoToStatus, statusLabel } from "@/lib/utils/status-labels"
import {
  Plus,
  Receipt,
  FileCheck,
  Building2,
  TrendingDown,
  FileSpreadsheet,
} from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Daftar Bukti Potong PPh" }

export const WITHHOLDING_CERTIFICATE_VALID_DB_STATUSES = [
  "draft",
  "issued",
  "revoked",
] as const

const ARAH_TO_DB: Record<string, "we_withhold" | "withheld_from_us"> = {
  dipungut: "we_withhold",
  dipotong: "withheld_from_us",
}

const DB_TO_ARAH: Record<string, string> = {
  we_withhold: "dipungut",
  withheld_from_us: "dipotong",
}

export default async function WithholdingCertificatesPage({
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
  await requirePermission("manage_withholding_certificates")

  const { segments } = await routeParams
  const params = await searchParams

  const filters = parsePathFilterSegments(segments, {
    status: /^[a-z_-]+$/,
    arah: /^(dipungut|dipotong)$/,
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

    const canonicalPath = buildPathFilterHref("/keuangan/dokumen-pajak/bupot", {
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
  const validUrlStatuses = WITHHOLDING_CERTIFICATE_VALID_DB_STATUSES.map(
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
    ...(dbStatus && { status: dbStatus }),
    ...(dbDirection && { direction: dbDirection }),
    ...(search && {
      OR: [
        { certificateNumber: { contains: search } },
        { counterpartyName: { contains: search } },
        { counterpartyTaxId: { contains: search } },
        { objectCode: { contains: search } },
      ],
    }),
  }

  const [certificates, total, weWithholdCount, fromUsCount, draftCount] = await Promise.all([
    prisma.withholdingCertificate.findMany({
      where,
      orderBy: { withholdingDate: "desc" },
      skip: (page - 1) * pageSize,
      take,
      include: { withholdingType: { select: { name: true } } },
    }),
    prisma.withholdingCertificate.count({ where }),
    prisma.withholdingCertificate.count({ where: { direction: "we_withhold" } }),
    prisma.withholdingCertificate.count({ where: { direction: "withheld_from_us" } }),
    prisma.withholdingCertificate.count({ where: { status: "draft" } }),
  ])

  const tableData: WithholdingCertificateRow[] = certificates.map((cert) => ({
    id: cert.id,
    slug: cert.slug,
    certificateNumber: cert.certificateNumber,
    direction: cert.direction as "we_withhold" | "withheld_from_us",
    withholdingDate: cert.withholdingDate.toISOString(),
    taxPeriod: cert.taxPeriod,
    article: cert.article,
    objectCode: cert.objectCode,
    objectName: cert.objectName,
    dpp: Number(cert.dpp),
    tariff: Number(cert.tariff),
    withheldAmount: Number(cert.withheldAmount),
    status: cert.status,
    counterpartyName: cert.counterpartyName,
    counterpartyTaxId: cert.counterpartyTaxId,
    facility: cert.facility,
    typeName: cert.withholdingType?.name ?? cert.article,
  }))

  const filterChips = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Jenis Pemotongan (Path Segments: /arah/dipungut atau /arah/dipotong) */}
      <div className="flex items-center gap-1">
        {[
          { label: "Semua Jenis", val: "" },
          { label: "Dipungut Sendiri", val: "dipungut" },
          { label: "Dipotong Pelanggan", val: "dipotong" },
        ].map((dir) => {
          const isActive = activeUrlArah === dir.val
          const targetPath = buildPathFilterHref("/keuangan/dokumen-pajak/bupot", {
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

      {/* Status Filter (Path Segments: /status/diterbitkan, /status/konsep, /status/dicabut) */}
      <div className="flex items-center gap-1">
        {[
          { label: "Semua Status", dbKey: "" },
          ...WITHHOLDING_CERTIFICATE_VALID_DB_STATUSES.map((key) => ({
            label: statusLabel(key),
            dbKey: key,
          })),
        ].map((item) => {
          const urlSlug = item.dbKey ? statusToIndo[item.dbKey] || item.dbKey : ""
          const isActive = activeUrlStatus === urlSlug
          const targetPath = buildPathFilterHref("/keuangan/dokumen-pajak/bupot", {
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
    { label: "Bukti Potong", href: "/keuangan/dokumen-pajak/bupot" },
    ...(activeUrlStatus ? [{ label: statusLabel(dbStatus) }] : []),
    ...(activeUrlArah ? [{ label: activeUrlArah === "dipungut" ? "Dipungut Sendiri" : "Dipotong Pelanggan" }] : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bukti Potong PPh (Bupot)"
        subtitle="Administrasi penerbitan dan pencatatan bukti potong/pungut PPh unifikasi (PPh 21, 22, 23, 4 ayat 2, 15, 26) terintegrasi sistem e-Bupot DJP."
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/keuangan/dokumen-pajak/faktur"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <FileCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Faktur Pajak</span>
            </Link>
            <Link
              href="/laporan/pajak"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <FileSpreadsheet className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Rekap SPT PPh</span>
            </Link>
            <CanCreate permission="manage_withholding_certificates">
              <Link
                href="/keuangan/dokumen-pajak/bupot/tambah"
                className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-2xs transition-colors"
                id="create-bupot-btn"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Terbitkan Bukti Potong</span>
              </Link>
            </CanCreate>
          </div>
        }
      />

      {/* Financial Metric Strip */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Total Bukti Potong</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {total} <span className="text-sm font-normal text-muted-foreground">dokumen</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">PPh Dipungut Sendiri</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 font-mono tabular-nums">
            {weWithholdCount} <span className="text-sm font-normal text-muted-foreground">dokumen</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">PPh Dipotong Pelanggan</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400 font-mono tabular-nums">
            {fromUsCount} <span className="text-sm font-normal text-muted-foreground">dokumen</span>
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

      {/* Main Data Table */}
      <WithholdingCertificateTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        filters={filterChips}
      />
    </div>
  )
}
