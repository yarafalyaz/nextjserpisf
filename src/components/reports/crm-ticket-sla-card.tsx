import Link from "next/link"
import type { CrmTicketSlaResult } from "@/lib/reports/crm-ticket-sla"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import { TicketSlaChip } from "@/components/reports/ticket-sla-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const TITLE = "Tiket Lewat SLA"

/**
 * 001-U atas F-2026-10-24-135-S: antrean GLOBAL tiket lewat SLA dari
 * `overdueQueue` loader (urutan kelebihan terbesar -> nomor -> id dari
 * builder; UI dilarang urut ulang). Tenggat (`dueAt`) dan kelebihan
 * (`overdueMinutes`) server tampil apa adanya — UI tidak menghitung
 * jam kerja/sisa sendiri. `emptyText`/`noticeText` verbatim builder.
 * Baca-saja: tindak lanjut hanya tautan detail tiket existing.
 */
export function CrmTicketSlaCard({
  sla,
}: Readonly<{ sla: CrmTicketSlaResult }>) {
  const summary = sla.summary
  const summaryItems: Array<readonly [string, number]> = [
    ["Tiket aktif", summary.activeCount],
    ["Lewat SLA", summary.overdueCount],
    ["Lewat respons", summary.overdueResponseCount],
    ["Lewat resolusi", summary.overdueResolutionCount],
    ["Mendekati SLA", summary.nearCount],
    ["Prioritas tak dikenal", summary.unknownPriorityCount],
  ]
  return (
    <section
      aria-label={TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{TITLE}</h2>
      </div>
      <div className="p-4 px-5">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {summaryItems.map(([label, count]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-semibold text-foreground">{count}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{sla.noticeText}</p>
        {sla.overdueQueue.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {sla.emptyText}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Tiket</DetailTableTh>
                <DetailTableTh>Subjek</DetailTableTh>
                <DetailTableTh>SLA</DetailTableTh>
                <DetailTableTh>Tenggat</DetailTableTh>
                <DetailTableTh>Kelebihan</DetailTableTh>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>Penanggung Jawab</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {sla.overdueQueue.map((row) => (
                  <DetailTableRow key={row.ticketId}>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/crm/tickets", {
                          id: row.ticketId,
                          slug: row.slug,
                        })}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.ticketNumber ?? `#${row.ticketId}`}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>
                      {row.subject}
                      {row.isUnknownPriority ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Prioritas tak dikenal
                        </span>
                      ) : null}
                    </DetailTableTd>
                    <DetailTableTd>
                      <TicketSlaChip primaryState={row.primaryState} />
                    </DetailTableTd>
                    <DetailTableTd>
                      {row.dueAt
                        ? formatDate(row.dueAt, { includeTime: true })
                        : "-"}
                    </DetailTableTd>
                    <DetailTableTd>{`${row.overdueMinutes} menit`}</DetailTableTd>
                    <DetailTableTd>{row.customerName ?? "—"}</DetailTableTd>
                    <DetailTableTd>
                      {row.assignedToName ??
                        (row.assignedTo != null
                          ? `Pengguna #${row.assignedTo}`
                          : "Belum ditugaskan")}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        )}
      </div>
    </section>
  )
}
