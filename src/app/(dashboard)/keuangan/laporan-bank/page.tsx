export const dynamic = "force-dynamic"

import { Plus, FileSpreadsheet, ArrowLeftRight, CheckCircle2 } from "@/components/ui/fontawesome-icons"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { PageHeader } from "@/components/ui/page-header"
import { CanCreate } from "@/components/auth/can-create"
import { BankStatementDraftQueueSection } from "./_components/bank-statement-draft-queue"
import { BankStatementTable, type BankStatementRow } from "./_components/bank-statement-table"
import { getBankStatementDraftQueue } from "@/lib/reports/bank-statement-draft-queue-data"
import {
  BANK_STATEMENT_DRAFT_QUEUE_TITLE,
  type BankStatementDraftQueue,
} from "@/lib/reports/bank-statement-draft-queue"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekening Koran Bank" }

/** Redirect Next.js (termasuk gerbang izin fail-closed) bukan error muat. */
function isNextRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

export default async function BankStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; pageSize?: string; cari?: string }>
}) {
  await requirePermission("view_bank_statements")

  const params = await searchParams
  const perPage = 20
  const page = Number(params.halaman) || 1
  const pageSize = Number(params.pageSize) || perPage
  const search = params.cari?.trim() || undefined

  const where = {
    ...(search && {
      OR: [
        { reference: { contains: search } },
        { accountNumber: { contains: search } },
      ],
    }),
  }

  // Seksi turunan baca-saja (F-2026-10-27-096-S, Q-BSQ-3) dimuat paralel
  const draftQueuePromise: Promise<{
    queue: BankStatementDraftQueue | null
    redirectError?: unknown
  }> = getBankStatementDraftQueue()
    .then((queue) => ({ queue }))
    .catch((error: unknown) => {
      if (isNextRedirect(error)) return { queue: null, redirectError: error }
      console.error("[laporan-bank] antrean rekening koran draft gagal dimuat:", error)
      return { queue: null }
    })

  // Muat data rekening koran beserta akun bank dan jumlah barisnya
  const [statements, total, draftCount, reconciledCount] = await Promise.all([
    prisma.bankStatement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { lines: true } },
      },
    }),
    prisma.bankStatement.count({ where }),
    prisma.bankStatement.count({ where: { status: "draft", deletedAt: null } }),
    prisma.bankStatement.count({ where: { status: { not: "draft" }, deletedAt: null } }),
  ])

  // Muat detail nama akun bank untuk setiap statement
  const accountIds = Array.from(new Set(statements.map((s) => s.accountId)))
  const accounts = accountIds.length > 0
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true },
      })
    : []
  const accountMap = new Map(accounts.map((a) => [a.id, a]))

  const draftResult = await draftQueuePromise
  if (draftResult.redirectError !== undefined) throw draftResult.redirectError
  const draftQueue = draftResult.queue

  const tableData: BankStatementRow[] = statements.map((stmt) => {
    const acc = accountMap.get(stmt.accountId)
    return {
      id: stmt.id,
      slug: stmt.slug,
      accountId: stmt.accountId,
      accountCode: acc?.code ?? null,
      accountName: acc?.name ?? null,
      accountNumber: stmt.accountNumber,
      date: stmt.date.toISOString(),
      reference: stmt.reference,
      periodStart: stmt.periodStart ? stmt.periodStart.toISOString() : null,
      periodEnd: stmt.periodEnd ? stmt.periodEnd.toISOString() : null,
      closingBalance: Number(stmt.closingBalance),
      lineCount: stmt._count.lines,
      status: stmt.status,
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rekening Koran Bank"
        subtitle="Pencatatan dan impor mutasi rekening koran bank operasional, verifikasi saldo, dan persiapan rekonsiliasi kas/bank."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekening Koran" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/keuangan/rekonsiliasi-bank"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeftRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Rekonsiliasi Bank</span>
            </Link>
            <CanCreate permission="create_journals">
              <Link
                href="/keuangan/laporan-bank/tambah"
                className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-2xs transition-colors"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Unggah / Tambah Rekening Koran</span>
              </Link>
            </CanCreate>
          </div>
        }
      />

      {/* ERP Financial Metric Strip */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-3">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Total Rekening Koran Terdata</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {total} <span className="text-sm font-normal text-muted-foreground">dokumen</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Status Draf / Belum Selesai</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {draftCount} <span className="text-sm font-normal text-muted-foreground">dokumen</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Tercocokkan / Terverifikasi</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {reconciledCount} <span className="text-sm font-normal text-muted-foreground">dokumen</span>
          </p>
        </div>
      </div>

      {/* Seksi Peringatan / Audit: Rekening Koran Draf Mengendap */}
      {draftQueue ? (
        <BankStatementDraftQueueSection queue={draftQueue} />
      ) : (
        <section
          aria-label={BANK_STATEMENT_DRAFT_QUEUE_TITLE}
          className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden"
        >
          <div className="flex flex-col gap-1 p-4 px-5">
            <h2 className="text-sm font-semibold text-foreground">
              {BANK_STATEMENT_DRAFT_QUEUE_TITLE}
            </h2>
            <p className="text-xs text-muted-foreground">
              Antrean rekening koran draft mengendap tidak dapat dimuat saat ini.
            </p>
          </div>
        </section>
      )}

      {/* Tabel Utama Dokumen Rekening Koran Menggunakan Standard DataTable ERP */}
      <BankStatementTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
      />
    </div>
  )
}
