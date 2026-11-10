export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { sumNetForAccount, sumNetForAccounts } from "@/lib/services/report-aggregation.service"
import { collectDescendantAccountIds } from "@/lib/reports/account-hierarchy"
import { resolveReferenceSlugs, referenceSlugKey } from "@/lib/services/reference-slug.service"
import { requirePermission } from '@/lib/auth/permissions'
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { formatAccountingExact, formatCurrencyExact, formatDate } from '@/lib/utils/format'
import { safeAdd, safeSubtract } from '@/lib/utils/math'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { BookOpen } from "@/components/ui/fontawesome-icons"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportSheet } from "@/components/reports/report-sheet"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import Link from "next/link"
import { referenceHref, formatReferenceType } from "@/lib/utils/format"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Buku Besar" }

export default async function GeneralLedgerPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ accountId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  const user = await requirePermission('view_reports')

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period
  // Akun dari path (slug lebih dulu, id sebagai cadangan); `?accountId=` lama
  // tetap dibaca supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const accountKey = splitReportSegments(segments).filters.akun ?? search.accountId ?? null

  const allAccounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, slug: true, type: true, parentId: true },
  })

  const accountRow = accountKey
    ? allAccounts.find((acc) => acc.slug === accountKey) ?? allAccounts.find((acc) => String(acc.id) === accountKey) ?? null
    : null
  const accountId = accountRow?.id ?? null

  let entries: {
    id: number
    date: Date
    journalNumber: string
    journalSlug: string | null
    memo: string | null
    description: string | null
    referenceType: string | null
    referenceId: number | null
    referenceLabel: string | null
    debit: number
    credit: number
  }[] = []
  let selectedAccount: { code: string; name: string } | null = null
  let openingBalance = 0

  let descendantIds: number[] = []

  if (accountId) {
    const account = allAccounts.find((a) => a.id === accountId)
    if (account) {
      selectedAccount = { code: account.code, name: account.name }
    }

    descendantIds = collectDescendantAccountIds(allAccounts, accountId)

    // Opening balance is aggregated over account and its descendants (if parent)
    const rawNet = await sumNetForAccounts(descendantIds, { date: { lt: startDate } })
    const isCreditNormal = account ? (account.type === 'LIABILITY' || account.type === 'EQUITY' || account.type === 'REVENUE') : false
    openingBalance = isCreditNormal ? -rawNet : rawNet

    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        accountId: { in: descendantIds },
        journal: {
          status: { in: ['POSTED', 'REVERSED'] },
          deletedAt: null,
          transactionDate: { gte: startDate, lte: endDate },
        },
      },
      include: {
        journal: {
          select: {
            journalNumber: true,
            slug: true,
            transactionDate: true,
            description: true,
            referenceType: true,
            referenceId: true,
          },
        },
      },
      orderBy: [
        { journal: { transactionDate: 'asc' } },
        { id: 'asc' },
      ],
    })

    entries = journalEntries.map((e) => ({
      id: e.id,
      date: e.journal.transactionDate,
      journalNumber: e.journal.journalNumber,
      journalSlug: e.journal.slug,
      memo: e.memo,
      description: e.journal.description,
      referenceType: e.journal.referenceType,
      referenceId: e.journal.referenceId,
      referenceLabel:
        e.journal.referenceType && e.journal.referenceId != null
          ? `${formatReferenceType(e.journal.referenceType)} #${e.journal.referenceId}`
          : null,
      debit: Number(e.debit),
      credit: Number(e.credit),
    }))
  }

  // Slug dokumen sumber untuk tautan referensi (kanonis, bukan id numerik).
  const referenceSlugs = await resolveReferenceSlugs(entries)

  const isCreditNormal = accountRow ? (accountRow.type === 'LIABILITY' || accountRow.type === 'EQUITY' || accountRow.type === 'REVENUE') : false

  const rows = entries.reduce<Array<(typeof entries)[number] & { balance: number }>>((acc, entry) => {
    const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : openingBalance
    // Saldo berjalan sen-aman:
    // Pada akun Debit normal: balance = previousBalance + debit - credit
    // Pada akun Kredit normal: balance = previousBalance + credit - debit
    const nextBalance = isCreditNormal
      ? safeSubtract(safeAdd(previousBalance, entry.credit, 2), entry.debit, 2)
      : safeSubtract(safeAdd(previousBalance, entry.debit, 2), entry.credit, 2)
    acc.push({ ...entry, balance: nextBalance })
    return acc
  }, [])

  const totalDebit = entries.reduce((sum, e) => safeAdd(sum, e.debit, 2), 0)
  const totalCredit = entries.reduce((sum, e) => safeAdd(sum, e.credit, 2), 0)
  // With no in-period entries the closing balance is the opening balance, NOT 0
  // (a 0 here hid the account's carried-forward balance entirely).
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance

  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`
  const ledgerSubtitle = selectedAccount ? `${selectedAccount.code} – ${selectedAccount.name}` : undefined

  const filterNode = (
    <ReportPeriodFilter
      basePath="/laporan/buku-besar"
      mode="range"
      defaultStartDate={toLocalDateOnly(startDate)}
      defaultEndDate={toLocalDateOnly(endDate)}
      selects={[
        {
          param: "akun",
          label: "Akun",
          placeholder: "Cari akun (kode / nama)...",
          value: accountRow ? (accountRow.slug ?? String(accountRow.id)) : "",
          options: allAccounts.map((acc) => ({ value: acc.slug ?? String(acc.id), label: `${acc.code} - ${acc.name}` })),
        },
      ]}
    />
  )

  const actionsNode = accountKey ? (
    <ExportButtons title="Buku Besar" pdfHref={buildReportPdfHref("buku-besar", period.slug, { akun: accountKey })} />
  ) : null

  if (!accountId || !selectedAccount) {
    return (
      <ReportPageShell
        title="Buku Besar"
        sheet={false}
        actions={actionsNode}
        filter={filterNode}
      >
        <div className="flex flex-col items-center gap-4 py-16 text-center print:hidden">
          <BookOpen size={48} className="text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Pilih Akun Buku Besar</h3>
            <p className="text-muted-foreground text-sm mt-1">Pilih akun di atas untuk melihat detail mutasi dan saldo berjalan.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 max-w-lg mt-2">
            {allAccounts.slice(0, 6).map((acc) => (
              <Link
                key={acc.id}
                href={`/laporan/buku-besar/${period.slug}/akun/${acc.slug ?? acc.id}`}
                className="text-xs px-3 py-1.5 rounded-lg border border-default bg-surface hover:bg-surface-secondary text-foreground transition-colors font-medium"
              >
                {acc.code} — {acc.name}
              </Link>
            ))}
          </div>
        </div>
      </ReportPageShell>
    )
  }

  return (
    <ReportPageShell
      title="Buku Besar"
      sheetTitle="Buku Besar"
      subtitle={ledgerSubtitle}
      periodLabel={periodLabel}
      periodCaption={`Periode ${formatDate(startDate, { format: "short" })} s/d ${formatDate(endDate, { format: "short" })}`}
      printedBy={user.name ?? user.email}
      actions={actionsNode}
      filter={filterNode}
    >
      {descendantIds.length > 1 && (
        <div className="mb-4 text-xs bg-muted/50 p-2.5 rounded-lg text-muted-foreground print:hidden">
          <span className="font-semibold text-foreground">Akun Induk:</span> Menggabungkan transaksi dari akun induk dan {descendantIds.length - 1} sub-akun terkait.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6 print:hidden">
        <ReportKpiCard label="Saldo Awal" value={formatAccountingExact(openingBalance)} />
        <ReportKpiCard label="Total Debit" value={formatAccountingExact(totalDebit)} />
        <ReportKpiCard label="Total Kredit" value={formatAccountingExact(totalCredit)} />
        <ReportKpiCard label="Saldo Akhir" value={formatAccountingExact(finalBalance)} />
      </div>

      <table className="stmt" data-report-table="Buku Besar">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>No. Jurnal</th>
            <th>Referensi</th>
            <th>Keterangan</th>
            <th className="num">Debit</th>
            <th className="num">Kredit</th>
            <th className="num">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr className="subtotal">
            <td colSpan={6}>Saldo Awal</td>
            <td className="num">{formatAccountingExact(openingBalance)}</td>
          </tr>
          {/* Sisa terjustifikasi TASK-037: sel .stmt dokumen cetak — EmptyState (teks Tailwind px) merusak paritas layar/PDF 9pt. */}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="stmt-empty">Tidak ada transaksi dalam periode ini</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.date, { format: "numeric" })}</td>
                <td className="muted">
                  {row.journalSlug ? (
                    <Link href={`/keuangan/jurnal/${row.journalSlug}`} aria-label={`Lihat jurnal ${row.journalNumber}`}>
                      {row.journalNumber}
                    </Link>
                  ) : (
                    row.journalNumber
                  )}
                </td>
                <td className="muted">
                  {row.referenceLabel && row.referenceType && referenceHref(row.referenceType, row.referenceId, referenceSlugs.get(referenceSlugKey(row))) ? (
                    <Link
                      href={referenceHref(row.referenceType, row.referenceId, referenceSlugs.get(referenceSlugKey(row)))!}
                      aria-label={`Lihat ${row.referenceLabel}`}
                    >
                      {row.referenceLabel}
                    </Link>
                  ) : (
                    row.referenceLabel ?? "-"
                  )}
                </td>
                <td>{row.memo || row.description || '-'}</td>
                <td className="num">{row.debit ? formatAccountingExact(row.debit) : ''}</td>
                <td className="num">{row.credit ? formatAccountingExact(row.credit) : ''}</td>
                <td className="num">{formatAccountingExact(row.balance)}</td>
              </tr>
            ))
          )}
          {rows.length > 0 && (
            <tr className="grand">
              <td colSpan={4}>Total &amp; Saldo Akhir</td>
              <td className="num">{formatAccountingExact(totalDebit)}</td>
              <td className="num">{formatAccountingExact(totalCredit)}</td>
              <td className="num">{formatAccountingExact(finalBalance)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </ReportPageShell>
  )
}
