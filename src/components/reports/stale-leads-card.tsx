import Link from "next/link"
import type { StaleLeads } from "@/lib/reports/stale-leads"
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
 * F-2026-10-20-29(a): kartu lead basi di daftar prospek.
 *
 * Data dari loader read-only `getStaleLeads`: lead new/contacted yang
 * aktivitas terakhirnya lewat ambang hari. Inti F-29(b) (tautan kendaraan
 * lead) ditunda-teknis; kartu read-only ini default aktifnya. Komponen
 * murni presentasi.
 */
export function StaleLeadsCard({ stale }: Readonly<{ stale: StaleLeads }>) {
  return (
    <section
      aria-label="Prospek Basi"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Prospek Basi</h2>
        <p className="text-xs text-muted-foreground">
          {stale.total} prospek tanpa aktivitas &gt; {stale.thresholdDays} hari
        </p>
      </div>
      <div className="p-4 px-5">
        {stale.rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Tidak ada prospek basi — semua prospek baru/dihubungi masih aktif ditindaklanjuti
          </p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Prospek</DetailTableTh>
              <DetailTableTh>Nama</DetailTableTh>
              <DetailTableTh>Perusahaan</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Aktivitas Terakhir</DetailTableTh>
              <DetailTableTh align="right">Diam</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {stale.rows.map((row) => (
                <DetailTableRow key={row.id}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/crm/leads", row)}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.leadNumber ?? row.name}
                    </Link>
                  </DetailTableTd>
                  <DetailTableTd>{row.name}</DetailTableTd>
                  <DetailTableTd>{row.company ?? "—"}</DetailTableTd>
                  <DetailTableTd>{statusLabel(row.status)}</DetailTableTd>
                  <DetailTableTd>{formatDate(row.lastActivityAt)}</DetailTableTd>
                  <DetailTableTd align="right">
                    <span className="font-medium text-destructive">{row.idleDays} hari</span>
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </div>
    </section>
  )
}
