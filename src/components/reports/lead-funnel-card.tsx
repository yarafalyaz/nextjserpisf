import type {
  LeadFunnel,
  LeadFunnelBreakdownRow,
} from "@/lib/reports/lead-funnel"
import {
  LEAD_FUNNEL_CURRENT_VALUE_NOTICE_TEXT,
  LEAD_FUNNEL_MOVEMENT_NOTICE_TEXT,
  LEAD_FUNNEL_NO_VALUE_LABEL,
  LEAD_FUNNEL_VALUE_NOTICE_TEXT,
} from "@/lib/reports/lead-funnel"
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

/**
 * F-2026-10-22-092-S: kartu corong prospek (Q-LF-2 dua permukaan, satu builder).
 *
 * Komponen murni presentasi atas `LeadFunnel` dari builder BOT 3
 * (`lead-funnel.ts`): UI tidak menghitung rasio/Σ apa pun — rasio transisi
 * dan semua total ditempel apa adanya. `transitionRatioFromPrevious` null
 * tampil "belum ada data", bukan 0% (BR-LF-05). Corong baca-saja: tanpa
 * tombol ubah status/konversi (BR-LF-10/AC-LF-7).
 */
export function LeadFunnelCard({
  funnel,
}: Readonly<{ funnel: LeadFunnel }>) {
  const { position, movement } = funnel
  return (
    <section
      aria-label="Corong Prospek"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Corong Prospek — Posisi saat ini
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(position.totalLeads)} prospek
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-5">
        {position.totalLeads === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada prospek
          </p>
        ) : (
          <>
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tahap</DetailTableTh>
                <DetailTableTh align="right">Jumlah</DetailTableTh>
                <DetailTableTh align="right">Nilai Estimasi</DetailTableTh>
                <DetailTableTh align="right">{LEAD_FUNNEL_NO_VALUE_LABEL}</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {position.stages.map((stage) => (
                  <DetailTableRow key={stage.status}>
                    <DetailTableTd>{stage.label}</DetailTableTd>
                    <DetailTableTd align="right">{formatNumber(stage.count)}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(stage.estimatedValueTotal, { decimals: 2 })}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatNumber(stage.withoutValueCount)}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
                {position.unknownStatus.count > 0 ? (
                  <DetailTableRow>
                    <DetailTableTd>{position.unknownStatus.label}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatNumber(position.unknownStatus.count)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(position.unknownStatus.estimatedValueTotal, { decimals: 2 })}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatNumber(position.unknownStatus.withoutValueCount)}
                    </DetailTableTd>
                  </DetailTableRow>
                ) : null}
              </DetailTableBody>
            </DetailTable>
            <p className="text-xs text-muted-foreground">
              {LEAD_FUNNEL_CURRENT_VALUE_NOTICE_TEXT}
            </p>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">{position.wonNotConverted.label}</dt>
                <dd className="font-medium">{formatNumber(position.wonNotConverted.count)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Terkonversi</dt>
                <dd className="font-medium">{formatNumber(position.convertedCount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tanpa histori tahap</dt>
                <dd className="font-medium">{formatNumber(position.noStageHistoryCount)}</dd>
              </div>
            </dl>
            <BreakdownSection title="Per Sumber" rows={position.bySource} />
            {position.byAssignee ? (
              <BreakdownSection title="Per Penanggung" rows={position.byAssignee} />
            ) : null}
            <section aria-label="Alasan Kalah" className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Alasan Kalah</h3>
              <DetailTable>
                <DetailTableHead>
                  <DetailTableTh>Kategori</DetailTableTh>
                  <DetailTableTh align="right">Jumlah</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {position.lostByReason.map((row) => (
                    <DetailTableRow key={row.key}>
                      <DetailTableTd>{row.label}</DetailTableTd>
                      <DetailTableTd align="right">{formatNumber(row.count)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            </section>
          </>
        )}

        {movement ? (
          <section aria-label="Corong gerakan periode" className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">Corong gerakan periode</h3>
            <p className="text-xs text-muted-foreground">{LEAD_FUNNEL_MOVEMENT_NOTICE_TEXT}</p>
            {movement.cohortCount === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Belum ada gerakan prospek pada periode ini
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(movement.cohortCount)} prospek bergerak pada periode ini
                </p>
                <DetailTable>
                  <DetailTableHead>
                    <DetailTableTh>Tahap</DetailTableTh>
                    <DetailTableTh align="right">Mencapai</DetailTableTh>
                    <DetailTableTh align="right">Terlewati tidak tercatat</DetailTableTh>
                    <DetailTableTh align="right">Transisi dari tahap sebelumnya</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {movement.stages.map((stage) => (
                      <DetailTableRow key={stage.status}>
                        <DetailTableTd>{stage.label}</DetailTableTd>
                        <DetailTableTd align="right">
                          {formatNumber(stage.reachedCount)}
                        </DetailTableTd>
                        <DetailTableTd align="right">
                          {formatNumber(stage.skippedUnrecordedCount)}
                        </DetailTableTd>
                        <DetailTableTd align="right">
                          {stage.transitionRatioFromPrevious === null
                            ? "belum ada data"
                            : formatPercentage(stage.transitionRatioFromPrevious, 1, true)}
                        </DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Mencapai Kalah</dt>
                    <dd className="font-medium">{formatNumber(movement.lostReachedCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Menang belum terkonversi</dt>
                    <dd className="font-medium">
                      {formatNumber(movement.wonNotConvertedCount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Terkonversi</dt>
                    <dd className="font-medium">{formatNumber(movement.convertedCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tanpa histori tahap</dt>
                    <dd className="font-medium">
                      {formatNumber(movement.noStageHistoryCount)}
                    </dd>
                  </div>
                </dl>
                <BreakdownSection title="Per Sumber" rows={movement.bySource} />
                {movement.byAssignee ? (
                  <BreakdownSection title="Per Penanggung" rows={movement.byAssignee} />
                ) : null}
              </>
            )}
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground">{LEAD_FUNNEL_VALUE_NOTICE_TEXT}</p>
      </div>
    </section>
  )
}

function BreakdownSection({
  title,
  rows,
}: Readonly<{ title: string; rows: LeadFunnelBreakdownRow[] }>) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Belum ada data</p>
      ) : (
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>{title === "Per Sumber" ? "Sumber" : "Penanggung"}</DetailTableTh>
            <DetailTableTh align="right">Jumlah</DetailTableTh>
            <DetailTableTh align="right">Nilai Estimasi</DetailTableTh>
            <DetailTableTh align="right">{LEAD_FUNNEL_NO_VALUE_LABEL}</DetailTableTh>
            <DetailTableTh align="right">Menang</DetailTableTh>
            <DetailTableTh align="right">Kalah</DetailTableTh>
            <DetailTableTh align="right">Terkonversi</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.key}>
                <DetailTableTd>{row.label}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.count)}</DetailTableTd>
                <DetailTableTd align="right">
                  {formatCurrency(row.estimatedValueTotal, { decimals: 2 })}
                </DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.withoutValueCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.wonCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.lostCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.convertedCount)}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      )}
    </section>
  )
}
