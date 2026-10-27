export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { CompleteReconciliationButton } from "../_components/complete-reconciliation-button"
import { MatchLineForm } from "./_components/match-line-form"
import { AdjustmentForm } from "./_components/adjustment-form"
import { UnmatchButton } from "./_components/unmatch-button"

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
  const periodFilter = {
    ...(recon.periodStart ? { date: { gte: recon.periodStart } } : {}),
    ...(recon.periodEnd ? { date: { lte: recon.periodEnd } } : {}),
  }
  const statementLines = await prisma.bankStatementLine.findMany({
    where: {
      bankStatement: { accountId: recon.accountId },
      ...periodFilter,
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: { id: true, date: true, description: true, amount: true, type: true },
  })
  const matchedLineIds = new Set(
    recon.items
      .filter((i) => i.bankStatementLineId != null)
      .map((i) => i.bankStatementLineId as number),
  )
  const unmatchedLines = statementLines.filter((l) => !matchedLineIds.has(l.id))

  // Entri jurnal POSTED milik akun ini dalam periode rekonsiliasi.
  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      accountId: recon.accountId,
      journal: {
        status: "POSTED",
        deletedAt: null,
        ...(recon.periodStart ? { transactionDate: { gte: recon.periodStart } } : {}),
        ...(recon.periodEnd ? { transactionDate: { lte: recon.periodEnd } } : {}),
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
  })

  // Item kecocokan dengan relasi untuk tampilan; item penyesuaian tidak punya
  // relasi (kedua FK null) dan dibedakan lewat `type`.
  const itemIds = recon.items.map((i) => i.id)
  const itemLines =
    itemIds.length > 0
      ? await prisma.bankStatementLine.findMany({
          where: { id: { in: recon.items.map((i) => i.bankStatementLineId).filter((v): v is number => v != null) } },
          select: { id: true, date: true, description: true, amount: true },
        })
      : []
  const itemJournals =
    itemIds.length > 0
      ? await prisma.journalEntry.findMany({
          where: { id: { in: recon.items.map((i) => i.journalEntryId).filter((v): v is number => v != null) } },
          select: {
            id: true,
            debit: true,
            credit: true,
            memo: true,
            journal: { select: { journalNumber: true, transactionDate: true } },
          },
        })
      : []
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
          {recon.status === "draft" && <CompleteReconciliationButton reconciliationId={recon.id} />}
          <BackButton href="/keuangan/rekonsiliasi-bank" />
        </>}
      />

      <DetailCard>
        <DetailField label="Tanggal Laporan" value={formatDate(recon.statementDate)} />
        <DetailField label="Saldo Buku" value={formatCurrency(Number(recon.bookBalance))} />
        <DetailField label="Saldo Laporan" value={formatCurrency(Number(recon.statementBalance))} />
        <DetailField label="Setoran Beredar" value={formatCurrency(Number(recon.outstandingDeposits))} />
        <DetailField label="Cek Beredar" value={formatCurrency(Number(recon.outstandingPayments))} />
        <DetailField label="Saldo Buku Disesuaikan" value={formatCurrency(Number(recon.adjustedBookBalance))} />
        <DetailField label="Selisih" value={
          <span className={Math.abs(Number(recon.difference)) < 0.01 ? "text-success font-semibold" : "text-danger font-semibold"}>
            {formatCurrency(Number(recon.difference))}
          </span>
        } />
        <DetailField label="Item Tercocok" value={`${matched} / ${recon.items.length}`} />
        <DetailField label="Dibuat" value={formatDate(recon.createdAt)} />
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
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Baris Rekening Koran</DetailTableTh>
                <DetailTableTh>Entri Jurnal</DetailTableTh>
                <DetailTableTh align="right">Nominal</DetailTableTh>
                {canWrite && <DetailTableTh align="right">Aksi</DetailTableTh>}
              </DetailTableHead>
              <DetailTableBody>
                {matchedItems.map((item) => {
                  const line = item.bankStatementLineId != null ? lineById.get(item.bankStatementLineId) : undefined
                  const journal = item.journalEntryId != null ? journalById.get(item.journalEntryId) : undefined
                  return (
                    <DetailTableRow key={item.id}>
                      <DetailTableTd>{line ? formatDate(line.date) : "-"}</DetailTableTd>
                      <DetailTableTd>{line ? (line.description || `#${line.id}`) : "-"}</DetailTableTd>
                      <DetailTableTd>
                        {journal ? `${journal.journal.journalNumber}${journal.memo ? ` — ${journal.memo}` : ""}` : "-"}
                      </DetailTableTd>
                      <DetailTableTd align="right">
                        {formatCurrency(Number(line?.amount ?? item.amount))}
                      </DetailTableTd>
                      {canWrite && (
                        <DetailTableTd align="right">
                          <div className="flex items-center justify-end">
                            <UnmatchButton reconciliationId={recon.id} itemId={item.id} />
                          </div>
                        </DetailTableTd>
                      )}
                    </DetailTableRow>
                  )
                })}
              </DetailTableBody>
            </DetailTable>
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
              label: `${formatDate(l.date)} — ${l.description || `#${l.id}`} — ${formatCurrency(Number(l.amount))}`,
            }))}
            journalEntries={journalEntries.map((j) => ({
              id: j.id,
              label: `${j.journal.journalNumber} — ${formatDate(j.journal.transactionDate)} — ${formatCurrency(Number(j.debit) || Number(j.credit))}${j.memo ? ` — ${j.memo}` : ""}`,
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
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Jenis</DetailTableTh>
                <DetailTableTh>Deskripsi</DetailTableTh>
                <DetailTableTh align="right">Nominal</DetailTableTh>
                {canWrite && <DetailTableTh align="right">Aksi</DetailTableTh>}
              </DetailTableHead>
              <DetailTableBody>
                {adjustments.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{item.date ? formatDate(item.date) : "-"}</DetailTableTd>
                    <DetailTableTd>
                      {item.type === "outstanding_deposit"
                        ? "Setoran beredar"
                        : item.type === "outstanding_check"
                          ? "Cek beredar"
                          : (item.type || "-")}
                    </DetailTableTd>
                    <DetailTableTd>{item.description || "-"}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(item.amount))}</DetailTableTd>
                    {canWrite && (
                      <DetailTableTd align="right">
                        <div className="flex items-center justify-end">
                          <UnmatchButton reconciliationId={recon.id} itemId={item.id} />
                        </div>
                      </DetailTableTd>
                    )}
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
