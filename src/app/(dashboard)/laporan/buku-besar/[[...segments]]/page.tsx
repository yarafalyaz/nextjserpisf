export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db/prisma'
import { sumNetForAccount } from "@/lib/services/report-aggregation.service"
import { resolveReferenceSlugs, referenceSlugKey } from "@/lib/services/reference-slug.service"
import { requirePermission } from '@/lib/auth/permissions'
import { formatAccounting, formatDate } from '@/lib/utils/format'
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { BookOpen } from 'lucide-react'
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportSheet } from "@/components/reports/report-sheet"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { parseReportFilters } from "@/lib/reports/report-href"
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
  const accountKey = parseReportFilters(segments.slice(1)).akun ?? search.accountId ?? null

  const allAccounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, slug: true },
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

  if (accountId) {
    const account = allAccounts.find((a) => a.id === accountId)
    if (account) {
      selectedAccount = { code: account.code, name: account.name }
    }

    // Opening balance is a single SUM over prior postings - loading every earlier
    // journal line into Node just to add them up does not scale.
    openingBalance = await sumNetForAccount(accountId, { date: { lt: startDate } })

    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        accountId,
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

  const rows = entries.reduce<Array<(typeof entries)[number] & { balance: number }>>((acc, entry) => {
    const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : openingBalance
    const nextBalance = previousBalance + entry.debit - entry.credit
    acc.push({ ...entry, balance: nextBalance })
    return acc
  }, [])

  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0)
  // With no in-period entries the closing balance is the opening balance, NOT 0
  // (a 0 here hid the account's carried-forward balance entirely).
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance

  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`
  const ledgerSubtitle = selectedAccount ? `${selectedAccount.code} – ${selectedAccount.name}` : undefined

  return (
    <ReportPageShell title="Buku Besar" sheet={false} filter={<>
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
</>} actions={<>
<div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Buku Besar" pdfHref={buildReportPdfHref("buku-besar", period.slug, accountKey ? { akun: accountKey } : {})} />
      </div>
</>}>






      {!accountId && (
        <div className="flex flex-col items-center gap-3 py-16 text-center print:hidden">
          <BookOpen size={48} className="text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Pilih akun untuk melihat buku besar</p>
        </div>
      )}

      {accountId && selectedAccount && (
        <ReportSheet
          title="Buku Besar"
          subtitle={ledgerSubtitle}
          periodLabel={periodLabel}
          periodCaption={`Periode ${formatDate(startDate, { format: "short" })} s/d ${formatDate(endDate, { format: "short" })}`}
          printedBy={user.name ?? user.email}
        >
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
                <td className="num">{formatAccounting(openingBalance, { zeroDash: false })}</td>
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
                    <td className="num">{row.debit ? formatAccounting(row.debit, { zeroDash: false }) : ''}</td>
                    <td className="num">{row.credit ? formatAccounting(row.credit, { zeroDash: false }) : ''}</td>
                    <td className="num">{formatAccounting(row.balance, { zeroDash: false })}</td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="grand">
                  <td colSpan={4}>Total &amp; Saldo Akhir</td>
                  <td className="num">{formatAccounting(totalDebit, { zeroDash: false })}</td>
                  <td className="num">{formatAccounting(totalCredit, { zeroDash: false })}</td>
                  <td className="num">{formatAccounting(finalBalance, { zeroDash: false })}</td>
                </tr>
              )}
            </tbody>
          </table>
        </ReportSheet>
      )}
    </ReportPageShell>
  )
}
