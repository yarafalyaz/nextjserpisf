import { Plus, Receipt, Clock, CheckCircle2, Wallet } from "@/components/ui/fontawesome-icons"
import { formatCurrency } from "@/lib/utils/format"
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

  const [expenses, total, statusGroups, claimTotal, approvedAgg] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take,
      include: { category: { select: { label: true } }, vendor: { select: { name: true } } },
    }),
    prisma.expense.count({ where }),
    prisma.expense.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.expense.count({ where: { isReimbursementClaim: true } }),
    prisma.expense.aggregate({
      where: { status: { in: ["approved", "paid"] } },
      _sum: { amount: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    draft: 0,
    pending: 0,
    approved: 0,
    paid: 0,
    rejected: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

  const approvedSum = Number(approvedAgg._sum.amount ?? 0)

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
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, {
          halaman: undefined,
        })}
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
    ? `/keuangan/pengeluaran/status/${activeUrlStatus}`
    : "/keuangan/pengeluaran"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Pengeluaran Operasional (Expense)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pencatatan beban usaha langsung, klaim reimbursement staf, dan verifikasi bukti bayar.
          </p>
        </div>
        <CanCreate permission="create_expenses">
          <Link
            href="/keuangan/pengeluaran/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-expense-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Pengeluaran</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Pengeluaran
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Receipt className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh transaksi beban usaha</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Menunggu Persetujuan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.draft + counts.pending}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Konsep & antrean review atasan</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Disetujui / Selesai
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.approved + counts.paid}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Terotorisasi & dibayarkan kas</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Beban Terbayar
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {formatCurrency(approvedSum)}
            </span>
            <Wallet className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Akumulasi pengeluaran sah</span>
        </div>
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                onlyClaims
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>Klaim Reimbursement</span>
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
                  onlyClaims
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {claimTotal}
              </span>
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
