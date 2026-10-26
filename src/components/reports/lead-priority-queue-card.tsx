import Link from "next/link"
import type { LeadPriorityQueue } from "@/lib/reports/lead-priority"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const TITLE = "Prioritas Lead"

/**
 * F-2026-10-25-031-S tahap 1 lapis aman: daftar kerja prioritas lead.
 *
 * Data dari loader read-only `getLeadPriorityQueue` (builder
 * `buildLeadPriorityQueue`) — ember, label tahap, urutan BR-LSC-08,
 * basis, notice, dan total ditampilkan apa adanya; UI tidak menghitung
 * atau mengurutkan ulang. Baca-saja total: tanpa skor/tingkat karangan,
 * tanpa kontrol ubah — penetapan prioritas manual menunggu fisik
 * Backend sesudah putusan Lead Q-LSC-2/3. Tindak lanjut hanya tautan
 * detail prospek existing.
 */
export function LeadPriorityQueueCard({
  queue,
}: Readonly<{ queue: LeadPriorityQueue }>) {
  const bucket = queue.buckets[0]
  return (
    <section
      aria-label={TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{TITLE}</h2>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {queue.totalActive} prospek aktif
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{queue.basisLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">{queue.valueNotice}</p>
        {bucket ? (
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-2">
              <dt>
                <StatusChip
                  status={bucket.bucket}
                  customLabel={bucket.label}
                  customTone="default"
                />
              </dt>
              <dd className="text-xs text-muted-foreground">
                {bucket.count} prospek · total nilai estimasi{" "}
                {formatCurrency(bucket.totalEstimatedValue)} ·{" "}
                {bucket.noValueCount} prospek tanpa nilai estimasi
              </dd>
            </div>
          </dl>
        ) : null}
        {queue.rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada prospek aktif
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Prospek</DetailTableTh>
                <DetailTableTh>Nama</DetailTableTh>
                <DetailTableTh>Tahap</DetailTableTh>
                <DetailTableTh>Prioritas</DetailTableTh>
                <DetailTableTh>Sumber</DetailTableTh>
                <DetailTableTh>Target Tutup</DetailTableTh>
                <DetailTableTh>Penanggung Jawab</DetailTableTh>
                <DetailTableTh align="right">Estimasi Nilai</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {queue.rows.map((row) => (
                  <DetailTableRow key={row.leadId}>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/crm/leads", {
                          id: row.leadId,
                          slug: row.slug,
                        })}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.leadNumber ?? row.name}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>{row.name}</DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.status}
                        customLabel={row.stageLabel}
                        customTone={row.isUnknownStatus ? "default" : undefined}
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.bucket}
                        customLabel={row.bucketLabel}
                        customTone="default"
                      />
                    </DetailTableTd>
                    <DetailTableTd>{row.sourceLabel}</DetailTableTd>
                    <DetailTableTd>
                      {row.expectedCloseDate
                        ? formatDate(row.expectedCloseDate)
                        : "—"}
                    </DetailTableTd>
                    <DetailTableTd>{row.assigneeLabel}</DetailTableTd>
                    <DetailTableTd align="right">
                      {row.hasEstimatedValue && row.estimatedValue != null
                        ? formatCurrency(row.estimatedValue)
                        : row.noValueLabel}
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
