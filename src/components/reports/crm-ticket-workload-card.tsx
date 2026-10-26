import type {
  CrmTicketWorkload,
  CrmTicketWorkloadGroup,
} from "@/lib/reports/crm-ticket-workload"
import { formatDate, formatRelativeTime } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

import { ReportSummaryStrip } from "./report-card-shell"

const TITLE = "Beban Tiket per Penanggung Jawab"

/**
 * Label umur tiket tertua dari createdAt tertua kelompok (BR-CTB-05);
 * kelompok kosong (ember Belum ditugaskan nol tiket) tampil "—".
 */
function oldestAgeLabel(group: CrmTicketWorkloadGroup): string {
  return group.oldestCreatedAt == null
    ? "—"
    : formatRelativeTime(group.oldestCreatedAt)
}

/**
 * F-2026-10-25-033-S lapis aman: rekap agregat beban tiket terbuka per
 * penanggung jawab di atas populasi 032-S (`buildCrmTicketWorkload`,
 * loader `getCrmTicketWorkload`).
 *
 * Semua hitungan, label prioritas, label umur, dan urutan kelompok
 * (BR-CTB-05: ember `Belum ditugaskan` pertama, lalu high/total/umur
 * tertua) ditampilkan apa adanya dari builder; UI tidak
 * mengelompokkan, menghitung, membulatkan, atau mengurutkan ulang.
 * Bukan penilaian kinerja (BR-CTB-07): tanpa target/ambang/peringkat.
 * Baca-saja total (BR-CTB-06): nol kontrol tulis — penugasan ulang
 * lewat detail tiket existing.
 */
export function CrmTicketWorkloadCard({
  workload,
}: Readonly<{ workload: CrmTicketWorkload }>) {
  const summary = workload.summary
  const summaryItems: Array<readonly [string, number]> = [
    ["Tiket terbuka", summary.totalOpen],
    [workload.unassignedLabel, summary.unassignedCount],
  ]
  const namedGroups = workload.groups.filter((g) => g.assignedTo !== null)
  const unassignedGroup = workload.groups.find((g) => g.assignedTo == null)
  return (
    <section
      aria-label={TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{TITLE}</h2>
      </div>
      <div className="p-4 px-5">
        <ReportSummaryStrip items={summaryItems} />
        <p className="mt-2 text-xs text-muted-foreground">{workload.noticeText}</p>
        {unassignedGroup ? (
          <p className="mt-2 text-sm text-foreground">
            {workload.unassignedLabel}: {unassignedGroup.totalOpen} tiket terbuka
            {unassignedGroup.oldestCreatedAt ? (
              <>
                {"; tertua "}
                {formatDate(unassignedGroup.oldestCreatedAt)} (
                {oldestAgeLabel(unassignedGroup)})
              </>
            ) : null}
          </p>
        ) : null}
        {namedGroups.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {workload.emptyNamedText}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Penanggung Jawab</DetailTableTh>
                <DetailTableTh align="right">Tiket Terbuka</DetailTableTh>
                <DetailTableTh align="right">{workload.priorityLabels.HIGH}</DetailTableTh>
                <DetailTableTh align="right">{workload.priorityLabels.MEDIUM}</DetailTableTh>
                <DetailTableTh align="right">{workload.priorityLabels.LOW}</DetailTableTh>
                <DetailTableTh align="right">{workload.priorityLabels.UNKNOWN}</DetailTableTh>
                <DetailTableTh align="right">Belum Direspons</DetailTableTh>
                <DetailTableTh>{workload.ageLabel} Tertua</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {namedGroups.map((group) => (
                  <DetailTableRow key={group.assignedTo}>
                    <DetailTableTd>{group.assigneeLabel}</DetailTableTd>
                    <DetailTableTd align="right">{group.totalOpen}</DetailTableTd>
                    <DetailTableTd align="right">{group.highCount}</DetailTableTd>
                    <DetailTableTd align="right">{group.mediumCount}</DetailTableTd>
                    <DetailTableTd align="right">{group.lowCount}</DetailTableTd>
                    <DetailTableTd align="right">{group.unknownPriorityCount}</DetailTableTd>
                    <DetailTableTd align="right">{group.unrespondedCount}</DetailTableTd>
                    <DetailTableTd>
                      {group.oldestCreatedAt ? (
                        <>
                          {formatDate(group.oldestCreatedAt)}
                          <span className="block text-xs text-muted-foreground">
                            {oldestAgeLabel(group)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
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
