import Link from "next/link"
import type { LeadFollowups } from "@/lib/reports/lead-followups"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

/**
 * F-2026-10-21-037: kartu antrean follow-up lead terjadwal di daftar prospek.
 *
 * Data dari loader read-only `getLeadFollowups`: per lead jadwal follow-up
 * terawal yang sudah jatuh tempo dan belum selesai. Beda tegas dari
 * StaleLeadsCard ("Prospek Basi" = tanpa aktivitas): kartu ini soal jadwal
 * yang dijanjikan, bukan soal diam. Komponen murni presentasi; kartu
 * sembunyi total bila tidak ada baris.
 */
export function LeadFollowupsCard({ followups }: Readonly<{ followups: LeadFollowups }>) {
  if (followups.rows.length === 0) return null
  return (
    <section
      aria-label="Jadwal follow-up lewat"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Jadwal follow-up lewat</h2>
        <p className="text-xs text-muted-foreground">
          {followups.total} prospek dengan jadwal follow-up sudah lewat
        </p>
      </div>
      <div className="p-4 px-5">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>No. Prospek</DetailTableTh>
            <DetailTableTh>Nama</DetailTableTh>
            <DetailTableTh>Status</DetailTableTh>
            <DetailTableTh>Jadwal Follow-up</DetailTableTh>
            <DetailTableTh align="right">Terlambat</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {followups.rows.map((row) => (
              <DetailTableRow key={row.leadId}>
                <DetailTableTd>
                  <Link
                    href={entityHref("/crm/leads", { id: row.leadId, slug: row.slug })}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.leadNumber ?? row.name}
                  </Link>
                </DetailTableTd>
                <DetailTableTd>{row.name}</DetailTableTd>
                <DetailTableTd>{statusLabel(row.status)}</DetailTableTd>
                <DetailTableTd>{formatDate(row.scheduledAt)}</DetailTableTd>
                <DetailTableTd align="right">
                  <span className="font-medium text-destructive">
                    {row.overdueDays === 0 ? "Hari ini" : `${row.overdueDays} hari`}
                  </span>
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </section>
  )
}
