import Link from "next/link"
import type { CrmTicketQueue } from "@/lib/reports/crm-ticket-queue"
import { CRM_TICKET_PRIORITY_LABELS } from "@/lib/reports/crm-ticket-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate, formatRelativeTime } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const TITLE = "Antrean Tiket Terbuka"

/**
 * F-2026-10-25-032-S tahap 1 lapis aman: daftar kerja harian tiket
 * terbuka terurut prioritas lalu umur (BUKAN penilaian SLA).
 *
 * Data dari loader read-only `getCrmTicketQueue` (builder murni
 * `buildCrmTicketQueue`) — urutan BR-CTQ-04, label prioritas/status,
 * ringkasan, teks kosong, dan notice ditampilkan apa adanya; UI tidak
 * menghitung, membulatkan, atau mengurutkan ulang. Tanpa ambang waktu:
 * tidak ada keadaan terlambat di permukaan ini (BR-CTQ-07). Baca-saja
 * total (BR-CTQ-06): nol tombol tulis/klaim — tindak lanjut hanya
 * tautan detail tiket existing.
 */
export function CrmTicketQueueCard({
  queue,
}: Readonly<{ queue: CrmTicketQueue }>) {
  const summary = queue.summary
  const summaryItems: Array<readonly [string, number]> = [
    ["Tiket terbuka", summary.totalOpen],
    [CRM_TICKET_PRIORITY_LABELS.HIGH, summary.highCount],
    [CRM_TICKET_PRIORITY_LABELS.MEDIUM, summary.mediumCount],
    [CRM_TICKET_PRIORITY_LABELS.LOW, summary.lowCount],
    [CRM_TICKET_PRIORITY_LABELS.UNKNOWN, summary.unknownPriorityCount],
    ["Belum ditugaskan", summary.unassignedCount],
    ["Belum direspons", summary.unrespondedCount],
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
        <p className="mt-2 text-xs text-muted-foreground">{queue.noticeText}</p>
        {queue.rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {queue.emptyText}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Tiket</DetailTableTh>
                <DetailTableTh>Subjek</DetailTableTh>
                <DetailTableTh>Prioritas</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>{queue.ageLabel}</DetailTableTh>
                <DetailTableTh>Penanggung Jawab</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {queue.rows.map((row) => (
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
                      {row.isUnresponded ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Belum direspons
                        </span>
                      ) : null}
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.priorityKey}
                        customLabel={row.priorityLabel}
                        customTone="default"
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.status}
                        customLabel={row.statusLabel}
                        customTone={row.isUnknownStatus ? "default" : undefined}
                      />
                    </DetailTableTd>
                    <DetailTableTd>{row.customerLabel}</DetailTableTd>
                    <DetailTableTd>
                      {formatDate(row.createdAt)}
                      <span className="block text-xs text-muted-foreground">
                        {formatRelativeTime(row.createdAt)}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd>{row.assigneeLabel}</DetailTableTd>
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
