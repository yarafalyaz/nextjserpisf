export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const journal = await prisma.journal.findUnique({
    where: { id: Number(id) },
    include: {
      entries: {
        include: { account: true },
      },
      creator: true,
    },
  })

  if (!journal) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Jurnal {journal.journalNumber}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={journal.status.toLowerCase()} />
          <Link href="/finance/journals" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Jurnal</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{journal.journalNumber}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Transaksi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(journal.transactionDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tipe</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{journal.type}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={journal.status.toLowerCase()} /></span>
          </div>
          {journal.referenceType && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Referensi</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{journal.referenceType} #{journal.referenceId}</span>
            </div>
          )}
          {journal.creator && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat Oleh</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{journal.creator.name}</span>
            </div>
          )}
          {journal.description && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{journal.description}</span>
            </div>
          )}
        </div>
      </div>

      {/* Journal Entries */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Entri Jurnal</h2>
        </div>
        <div className="p-4 px-5">
          {journal.entries.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada entri</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Akun</th>
                  <th>Memo</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Kredit</th>
                </tr>
              </thead>
              <tbody>
                {journal.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.account.code} - {entry.account.name}</td>
                    <td>{entry.memo || "-"}</td>
                    <td className="text-right">{formatCurrency(Number(entry.debit))}</td>
                    <td className="text-right">{formatCurrency(Number(entry.credit))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-right"><strong>Total</strong></td>
                  <td className="text-right"><strong>{formatCurrency(Number(journal.totalDebit))}</strong></td>
                  <td className="text-right"><strong>{formatCurrency(Number(journal.totalCredit))}</strong></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
      <TransactionAttachments referenceType="journal" referenceId={journal.id} />
    </div>
  )
}
