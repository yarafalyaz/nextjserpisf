export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency, formatReferenceType, referenceHref } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { resolveReferenceSlugs, referenceSlugKey } from "@/lib/services/reference-slug.service"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd, DetailTableFoot, DetailTableFootRow } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Jurnal" }

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_journals")

  const { slug } = await params

  const journalInclude = {
    entries: {
      include: { account: true },
    },
    creator: true,
  }

  const journal = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.journal.findFirst({ where: { slug: s, ...where }, include: journalInclude }),
      byId: (id, where) => prisma.journal.findFirst({ where: { id, ...where }, include: journalInclude }),
    },
  )

  if (!journal) notFound()

  const referenceSlugs = await resolveReferenceSlugs([journal])
  const journalRefSlug = referenceSlugs.get(referenceSlugKey(journal))

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
        <DetailField label="Tipe" value={{ GENERAL: "Umum", AUTO: "Otomatis" }[journal.type] ?? journal.type} />
        {journal.referenceType &&
          (referenceHref(journal.referenceType, journal.referenceId, journalRefSlug) ? (
            <DetailField
              label="Referensi"
              value={
                <Link
                  href={referenceHref(journal.referenceType, journal.referenceId, journalRefSlug)!}
                  aria-label={`Lihat ${formatReferenceType(journal.referenceType)} #${journal.referenceId}`}
                >
                  {`${formatReferenceType(journal.referenceType)} #${journal.referenceId}`}
                </Link>
              }
            />
          ) : (
            <DetailField label="Referensi" value={`${formatReferenceType(journal.referenceType)} #${journal.referenceId}`} />
          ))}
        {journal.creator && <DetailField label="Dibuat Oleh" value={journal.creator.name} />}
        {journal.description && <DetailField label="Deskripsi" value={journal.description} colSpan="full" />}
      </DetailCard>

      {/* Journal Entries */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Entri Jurnal</h2>
        </div>
        <div className="p-4 px-5">
          {journal.entries.length === 0 ? (
            <EmptyState title="Tidak ada entri" />
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
