export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Jurnal" }

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_journals")

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
      <PageHeader
        title={`Jurnal ${journal.journalNumber}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Jurnal", href: "/keuangan/jurnal" },
          { label: journal.journalNumber },
        ]}
        badge={<StatusChip status={journal.status.toLowerCase()} />}
        actions={<>
          <BackButton href="/keuangan/jurnal" />
        </>}
      />

      <DetailCard>
        <DetailField label="No. Jurnal" value={journal.journalNumber} mono />
        <DetailField label="Tanggal Transaksi" value={formatDate(journal.transactionDate)} />
        <DetailField label="Tipe" value={journal.type} />
        <DetailField label="Status" value={<StatusChip status={journal.status.toLowerCase()} />} />
        {journal.referenceType && <DetailField label="Referensi" value={`${journal.referenceType} #${journal.referenceId}`} />}
        {journal.creator && <DetailField label="Dibuat Oleh" value={journal.creator.name} />}
        {journal.description && <DetailField label="Deskripsi" value={journal.description} colSpan="full" />}
      </DetailCard>

      {/* Journal Entries */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Entri Jurnal</h2>
        </div>
        <div className="p-4 px-5">
          {journal.entries.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada entri</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Akun</DetailTableTh>
                <DetailTableTh>Memo</DetailTableTh>
                <DetailTableTh align="right">Debit</DetailTableTh>
                <DetailTableTh align="right">Kredit</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {journal.entries.map((entry) => (
                  <DetailTableRow key={entry.id}>
                    <DetailTableTd>{entry.account.code} - {entry.account.name}</DetailTableTd>
                    <DetailTableTd>{entry.memo || "-"}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(entry.debit))}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(Number(entry.credit))}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow>
                  <DetailTableTd colSpan={2} align="right" className="font-bold">Total</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">{formatCurrency(Number(journal.totalDebit))}</DetailTableTd>
                  <DetailTableTd align="right" className="font-bold">{formatCurrency(Number(journal.totalCredit))}</DetailTableTd>
                </DetailTableFootRow>
              </DetailTableFoot>
            </DetailTable>
          )}
        </div>
      </div>

      <TransactionAttachments referenceType="journal" referenceId={journal.id} />
    </div>
  )
}
