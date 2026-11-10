export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { ExpenseTable } from "./_components/expense-table"
import { ExpenseDraftQueueSection } from "./_components/expense-draft-queue"
import { getExpenseDraftQueue } from "@/lib/reports/expense-draft-queue-data"
import {
  EXPENSE_DRAFT_QUEUE_TITLE,
  type ExpenseDraftQueue,
} from "@/lib/reports/expense-draft-queue"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengeluaran" }

export const EXPENSE_VALID_DB_STATUSES = [
  "draft",
  "pending",
  "approved",
  "paid",
  "rejected",
] as const

/** Redirect Next.js (termasuk gerbang izin fail-closed) bukan error muat. */
function isNextRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

export interface ExpensesPageProps {
  statusParam?: string
  searchParams: Promise<{
    cari?: string
    status?: string
    halaman?: string
    pageSize?: string
    klaim?: string
  }>
}

export async function renderExpensesPage({
  statusParam,
  searchParams,
}: ExpensesPageProps) {
  await requirePermission("view_expenses")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.klaim) query.set("klaim", params.klaim)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/keuangan/pengeluaran/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = EXPENSE_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)
  const onlyClaims = params.klaim === "1"
  const cari = params.cari?.trim()

  const where = {
    ...(dbStatus && { status: dbStatus }),
    ...(onlyClaims && { isReimbursementClaim: true }),
    ...(cari && {
      OR: [
        { documentNo: { contains: cari } },
        { description: { contains: cari } },
      ],
    }),
  }

  const draftQueuePromise: Promise<{
    queue: ExpenseDraftQueue | null
    redirectError?: unknown
  }> = getExpenseDraftQueue()
    .then((queue) => ({ queue }))
    .catch((error: unknown) => {
      if (isNextRedirect(error)) return { queue: null, redirectError: error }
      console.error("[pengeluaran] antrean pengeluaran menunggu persetujuan gagal dimuat:", error)
      return { queue: null }
    })

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take,
      include: { category: { select: { label: true } }, vendor: { select: { name: true } } },
    }),
    prisma.expense.count({ where }),
  ])

  const draftResult = await draftQueuePromise
  if (draftResult.redirectError !== undefined) throw draftResult.redirectError
  const draftQueue = draftResult.queue

  const data = toPlain(expenses).map((e) => ({
    ...e,
    categoryName: (e as Record<string, unknown>).category
      ? ((e as Record<string, unknown>).category as { label: string }).label
      : null,
    vendorName: (e as Record<string, unknown>).vendor
      ? ((e as Record<string, unknown>).vendor as { name: string }).name
      : null,
  }))

  const statusChips = ["", ...EXPENSE_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/keuangan/pengeluaran/status/${urlStatus}` : "/keuangan/pengeluaran"
    const isActive = activeUrlStatus === urlStatus

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, {
          halaman: undefined,
        })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus
    ? `/keuangan/pengeluaran/status/${activeUrlStatus}`
    : "/keuangan/pengeluaran"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengeluaran</h1>
        <CanCreate permission="create_expenses">
          <Link
            href="/keuangan/pengeluaran/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-expense-btn"
          >
            + Buat Pengeluaran
          </Link>
        </CanCreate>
      </div>

      {draftQueue ? (
        <ExpenseDraftQueueSection queue={draftQueue} />
      ) : (
        <section
          aria-label={EXPENSE_DRAFT_QUEUE_TITLE}
          className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
        >
          <div className="flex flex-col gap-1 p-4 px-5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              {EXPENSE_DRAFT_QUEUE_TITLE}
            </h2>
            <p className="text-xs text-muted-foreground">
              Antrean pengeluaran menunggu persetujuan tidak dapat dimuat saat ini.
            </p>
          </div>
        </section>
      )}

      <ExpenseTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari pengeluaran..." action={currentActionPath} />}
        filters={
          <div className="flex flex-wrap gap-1.5">
            {statusChips}
            <Link
              href={withListParams(currentActionPath, params, {
                klaim: onlyClaims ? undefined : "1",
                halaman: undefined,
              })}
              className={`filter-chip ${onlyClaims ? "active" : ""}`}
            >
              Klaim Reimbursement
            </Link>
          </div>
        }
      />
    </div>
  )
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string; klaim?: string }>
}) {
  return renderExpensesPage({ searchParams })
}
