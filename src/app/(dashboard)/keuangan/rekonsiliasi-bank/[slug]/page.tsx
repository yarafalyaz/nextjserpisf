export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { CompleteReconciliationButton } from "../_components/complete-reconciliation-button"
import { MatchLineForm } from "./_components/match-line-form"
import { AdjustmentForm } from "./_components/adjustment-form"
import { AdjustmentsTable, MatchedItemsTable } from "./_components/reconciliation-tables"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Rekonsiliasi Bank" }

/**
 * Detail rekonsiliasi bank: ringkasan saldo + 3 kartu kerja.
 *
 * Sampai halaman ini dilengkapi, `matchReconciliationLine` tidak punya pemanggil
 * UI dan item penyesuaian (type outstanding_deposit/outstanding_check) tidak
 * punya jalur tulis — rekonsiliasi hanya bisa dibuat lalu diselesaikan tanpa
 * pernah mencocokkan baris, dan selisih tak bisa dinolkan lewat UI.
 *
 * Izin baca = `view_bank_reconciliation`; izin tulis (match/unmatch/adjust) =
 * `manage_bank_reconciliation`, dan tombol hanya tampil bila rekonsiliasi masih
 * draft. Aksi server menegakkan izin yang SAMA + status draft, jadi halaman
 * yang menampilkan tombol bukan garis pertahanan satu-satunya.
 */
export default async function BankReconciliationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("view_bank_reconciliation")
  const { slug } = await params

  const recon = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.bankReconciliation.findFirst({ where: { slug: s, ...where }, include: { items: true } }),
      byId: (id, where) => prisma.bankReconciliation.findFirst({ where: { id, ...where }, include: { items: true } }),
    },
  )
  if (!recon) notFound()

  const userRoles: string[] = user.roles ?? []
  const userPerms: string[] = user.permissions ?? []
  const isSuperAdmin = userRoles.includes("super_admin")
  const canWrite =
    recon.status === "draft" &&
    (isSuperAdmin || userPerms.includes("manage_bank_reconciliation"))

  const matched = recon.items.filter((i) => i.matched).length

  // Baris rekening koran milik akun ini dalam periode rekonsiliasi, dikurangi
  // yang sudah punya item kecocokan di rekonsiliasi ini.
  const dateRange = {
    ...(recon.periodStart ? { gte: recon.periodStart } : {}),
    ...(recon.periodEnd ? { lte: recon.periodEnd } : {}),
  }
  const periodFilter = Object.keys(dateRange).length > 0 ? { date: dateRange } : {}
  const journalDateFilter =
    Object.keys(dateRange).length > 0 ? { transactionDate: dateRange } : {}

  const [statementLines, journalEntries] = await Promise.all([
    prisma.bankStatementLine.findMany({
      where: {
        bankStatement: { accountId: recon.accountId, deletedAt: null },
        ...periodFilter,
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, date: true, description: true, amount: true, type: true },
    }),
    // Entri jurnal POSTED milik akun ini dalam periode rekonsiliasi.
    prisma.journalEntry.findMany({
      where: {
        accountId: recon.accountId,
        journal: {
          status: "POSTED",
          deletedAt: null,
          ...journalDateFilter,
        },
      },
      orderBy: { id: "asc" },
      take: 500,
      select: {
        id: true,
        debit: true,
        credit: true,
        memo: true,
        journal: { select: { journalNumber: true, transactionDate: true } },
      },
    }),
  ])
  const matchedLineIds = new Set(
    recon.items
      .filter((i) => i.bankStatementLineId != null)
      .map((i) => i.bankStatementLineId as number),
  )
  const unmatchedLines = statementLines.filter((l) => !matchedLineIds.has(l.id))

  // Item kecocokan dengan relasi untuk tampilan; item penyesuaian tidak punya
  // relasi (kedua FK null) dan dibedakan lewat `type`.
  const itemIds = recon.items.map((i) => i.id)
  const [itemLines, itemJournals] = await Promise.all([
    itemIds.length > 0
      ? prisma.bankStatementLine.findMany({
          where: { id: { in: recon.items.map((i) => i.bankStatementLineId).filter((v): v is number => v != null) } },
          select: { id: true, date: true, description: true, amount: true },
        })
      : Promise.resolve([]),
    itemIds.length > 0
      ? prisma.journalEntry.findMany({
          where: { id: { in: recon.items.map((i) => i.journalEntryId).filter((v): v is number => v != null) } },
          select: {
            id: true,
            debit: true,
            credit: true,
            memo: true,
            journal: { select: { journalNumber: true, transactionDate: true } },
          },
        })
      : Promise.resolve([]),
  ])
  const lineById = new Map(itemLines.map((l) => [l.id, l]))
  const journalById = new Map(itemJournals.map((j) => [j.id, j]))

  const matchedItems = recon.items.filter((i) => i.matched)
  const adjustments = recon.items.filter((i) => !i.matched)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Rekonsiliasi Bank #${recon.id}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekonsiliasi Bank", href: "/keuangan/rekonsiliasi-bank" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={recon.status} />}
        actions={<>
          {canWrite && <CompleteReconciliationButton reconciliationId={recon.id} />}
        </>}
      />

      <DetailCard>
        <DetailField label="Tanggal Laporan" value={formatDate(recon.statementDate)} mono />
        <DetailField label="Saldo Buku" value={formatCurrencyExact(Number(recon.bookBalance))} mono />
        <DetailField label="Saldo Laporan" value={formatCurrencyExact(Number(recon.statementBalance))} mono />
        <DetailField label="Setoran Beredar" value={formatCurrencyExact(Number(recon.outstandingDeposits))} mono />
        <DetailField label="Cek Beredar" value={formatCurrencyExact(Number(recon.outstandingPayments))} mono />
        <DetailField label="Saldo Buku Disesuaikan" value={formatCurrencyExact(Number(recon.adjustedBookBalance))} mono />
        <DetailField label="Selisih" value={
          <span className={`font-mono tabular-nums font-semibold ${Math.abs(Number(recon.difference)) < 0.01 ? "text-success" : "text-danger"}`}>
            {formatCurrencyExact(Number(recon.difference))}
          </span>
        } />
        <DetailField label="Item Tercocok" value={`${matched} / ${statementLines.length}`} mono />
        <DetailField label="Dibuat" value={formatDate(recon.createdAt)} mono />
      </DetailCard>

      {/* Baris belum cocok: baris mutasi + tombol Batalkan per item matched. */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Baris Belum Cocok</h2>
            <p className="text-xs text-muted-foreground">
              {unmatchedLines.length} baris belum cocok. {matchedItems.length} baris sudah cocok.
            </p>
          </div>
        </div>

        {matchedItems.length === 0 ? (
          <EmptyState title="Belum ada baris yang dicocokkan" />
        ) : (
          <div className="p-4 px-5">
            <MatchedItemsTable
              data={matchedItems.map((item) => {
                const line = item.bankStatementLineId != null ? lineById.get(item.bankStatementLineId) : undefined
                const journal = item.journalEntryId != null ? journalById.get(item.journalEntryId) : undefined
                return {
                  id: item.id,
                  date: line ? line.date.toISOString() : null,
                  statementDescription: line ? (line.description || `#${line.id}`) : "-",
                  journalDescription: journal ? `${journal.journal.journalNumber}${journal.memo ? ` - ${journal.memo}` : ""}` : "-",
                  amount: Number(line?.amount ?? item.amount),
                }
              })}
              reconciliationId={recon.id}
              canWrite={canWrite}
            />
          </div>
        )}
      </div>

      {/* Cocokkan baris: pilih baris rekening koran + entri jurnal. */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Cocokkan Baris</h2>
            <p className="text-xs text-muted-foreground">
              Pilih baris rekening koran yang belum cocok dan entri jurnal posted akun yang sama.
            </p>
          </div>
        </div>

        {canWrite ? (
          <MatchLineForm
            reconciliationId={recon.id}
            statementLines={unmatchedLines.map((l) => ({
              id: l.id,
              label: `${formatDate(l.date)} - ${l.description || `#${l.id}`} - ${formatCurrencyExact(Number(l.amount))}`,
            }))}
            journalEntries={journalEntries.map((j) => ({
              id: j.id,
              label: `${j.journal.journalNumber} - ${formatDate(j.journal.transactionDate)} - ${formatCurrencyExact(Number(j.debit) || Number(j.credit))}${j.memo ? ` - ${j.memo}` : ""}`,
            }))}
          />
        ) : (
          <p className="p-4 px-5 text-sm text-muted-foreground">
            Anda tidak memiliki izin untuk mencocokkan baris rekonsiliasi.
          </p>
        )}
      </div>

      {/* Item penyesuaian: form + daftar setoran/cek beredar. */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Item Penyesuaian</h2>
            <p className="text-xs text-muted-foreground">
              Setoran beredar menambah saldo buku; cek beredar menguranginya.
            </p>
          </div>
        </div>

        {canWrite && <AdjustmentForm reconciliationId={recon.id} />}

        <div className="p-4 px-5">
          {adjustments.length === 0 ? (
            <EmptyState title="Belum ada item penyesuaian" />
          ) : (
            <AdjustmentsTable
              data={adjustments.map((item) => ({
                id: item.id,
                date: item.date ? item.date.toISOString() : null,
                type: item.type ?? "",
                description: item.description,
                amount: Number(item.amount),
              }))}
              reconciliationId={recon.id}
              canWrite={canWrite}
            />
          )}
        </div>
      </div>
    </div>
  )
}
