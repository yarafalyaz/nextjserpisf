export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
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

/** Redirect Next.js (termasuk gerbang izin fail-closed) bukan error muat. */
function isNextRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; klaim?: string }>
}) {
  await requirePermission("view_expenses")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined
  const page = Number(params.halaman) || 1
  const perPage = 100
  const onlyClaims = params.klaim === "1"

  const where = {
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
    ...(onlyClaims && { isReimbursementClaim: true }),
  }

  // Seksi turunan baca-saja (F-2026-10-27-107-S, Q-EXQ-5) dimuat
  // paralel dengan daftar utama. Gerbang view_expenses ditegakkan
  // ulang fail-closed di loader sebelum query: redirect izin tetap
  // diteruskan, sedangkan kegagalan muat lain hanya mengosongkan
  // seksi turunan — daftar pengeluaran existing tetap tampil.
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
      skip: (page - 1) * perPage,
      take: perPage,
      include: { category: { select: { label: true } }, vendor: { select: { name: true } } },
    }),
    prisma.expense.count({ where }),
  ])

  const draftResult = await draftQueuePromise
  if (draftResult.redirectError !== undefined) throw draftResult.redirectError
  const draftQueue = draftResult.queue

  const totalPages = Math.ceil(total / perPage)
  const data = toPlain(expenses).map((e) => ({
    ...e,
    categoryName: (e as Record<string, unknown>).category
      ? ((e as Record<string, unknown>).category as { label: string }).label
      : null,
    vendorName: (e as Record<string, unknown>).vendor
      ? ((e as Record<string, unknown>).vendor as { name: string }).name
      : null,
  }))

  const statusChips = ["", "draft", "pending", "approved", "paid", "rejected"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/keuangan/pengeluaran${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengeluaran</h1>
        <CanCreate permission="create_expenses">
          <Link href="/keuangan/pengeluaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-expense-btn">
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
        toolbar={<AppSearchField placeholder="Cari pengeluaran..." action="/keuangan/pengeluaran" />}
        filters={
          <div className="flex flex-wrap gap-1.5">
            {statusChips}
            <Link
              href={onlyClaims ? "/keuangan/pengeluaran" : "/keuangan/pengeluaran?klaim=1"}
              className={`filter-chip ${onlyClaims ? "active" : ""}`}
            >
              Klaim Reimbursement
            </Link>
          </div>
        }
      />

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-5 border-t border-default">
          <span className="text-[0.8125rem] text-muted-foreground">Hal {page} dari {totalPages} ({total} data)</span>
          <div className="flex gap-1">
            {page > 1 && <Link href={`/keuangan/pengeluaran?halaman=${page - 1}`} className="button button--ghost button--sm">← Sebelumnya</Link>}
            {page < totalPages && <Link href={`/keuangan/pengeluaran?halaman=${page + 1}`} className="button button--ghost button--sm">Berikutnya →</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
