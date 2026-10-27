import Link from "next/link"
import {
  STOCKTAKE_UNFINISHED_COLUMN_LABELS,
  STOCKTAKE_UNFINISHED_NO_LINES_LABEL,
  STOCKTAKE_UNFINISHED_NO_STAGE_MARKER_LABEL,
  STOCKTAKE_UNFINISHED_NOTICE_TEXT,
  STOCKTAKE_UNFINISHED_STAGE_LABELS,
  STOCKTAKE_UNFINISHED_STATUSES,
  STOCKTAKE_UNFINISHED_TITLE,
  STOCKTAKE_UNFINISHED_TRUNCATED_LABEL,
  type StocktakeUnfinishedQueue,
} from "@/lib/reports/stocktake-unfinished-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { EmptyState } from "@/components/ui/empty-state"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

/**
 * F-2026-10-27-090-S (090-F): seksi turunan sesi opname belum selesai.
 *
 * Render verbatim payload server (AC-STQ-F1): tahap, umur tahap,
 * tingkat, rekap, dan progres sudah dihitung builder — komponen
 * ini tidak menghitung umur/tingkat/progres/urutan sendiri.
 * Baca-saja (AC-STQ-F2): tanpa tombol aksi transisi apa pun;
 * tautan baris hanya ke detail sesi existing.
 * Tanda baris (AC-STQ-F3) tampil apa adanya.
 */
export function StocktakeUnfinishedQueueCard({
  queue,
}: Readonly<{ queue: StocktakeUnfinishedQueue }>) {
  return (
    <section
      aria-label={STOCKTAKE_UNFINISHED_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {STOCKTAKE_UNFINISHED_TITLE}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{STOCKTAKE_UNFINISHED_NOTICE_TEXT}</p>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {queue.totalSessions} sesi opname belum selesai
        </p>
        <ul aria-label="Rekap tahap sesi opname" className="mt-2 flex flex-wrap gap-1.5">
          {STOCKTAKE_UNFINISHED_STATUSES.map((stage) => (
            <li key={stage}>
              <StatusChip
                status={stage}
                customLabel={`${STOCKTAKE_UNFINISHED_STAGE_LABELS[stage]}: ${queue.stageCounts[stage]}`}
                customTone="default"
              />
            </li>
          ))}
          <li>
            <StatusChip
              status="mengendap"
              customLabel={`Mengendap: ${queue.levelCounts.mengendap}`}
              customTone="danger"
            />
          </li>
          {queue.unknownCount > 0 ? (
            <li>
              <StatusChip
                status="tidak-dikenal"
                customLabel={`Status Tidak Dikenal: ${queue.unknownCount}`}
                customTone="warning"
              />
            </li>
          ) : null}
        </ul>
        {queue.terpotong ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Daftar {STOCKTAKE_UNFINISHED_TRUNCATED_LABEL}: hanya {queue.rows.length} dari{" "}
            {queue.totalSessions} sesi ditampilkan.
          </p>
        ) : null}
        {queue.rows.length === 0 ? (
          <EmptyState title="Belum ada sesi opname belum selesai" className="py-10" />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>{STOCKTAKE_UNFINISHED_COLUMN_LABELS.document}</DetailTableTh>
                <DetailTableTh>{STOCKTAKE_UNFINISHED_COLUMN_LABELS.warehouse}</DetailTableTh>
                <DetailTableTh>{STOCKTAKE_UNFINISHED_COLUMN_LABELS.stage}</DetailTableTh>
                <DetailTableTh>{STOCKTAKE_UNFINISHED_COLUMN_LABELS.stageAge}</DetailTableTh>
                <DetailTableTh>{STOCKTAKE_UNFINISHED_COLUMN_LABELS.progress}</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {queue.rows.map((row) => (
                  <DetailTableRow key={row.sessionId}>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/inventaris/opname/sesi", { id: row.sessionId, slug: row.slug })}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.documentNo}
                      </Link>
                    </DetailTableTd>
                    <DetailTableTd>
                      {row.warehouseCode && row.warehouseName
                        ? `${row.warehouseCode} — ${row.warehouseName}`
                        : (row.warehouseName ?? row.warehouseCode ?? "—")}
                    </DetailTableTd>
                    <DetailTableTd>
                      <span>{row.tahapLabel}</span>{" "}
                      <span className="text-muted-foreground">({row.status})</span>
                      {row.tingkat === "mengendap" && row.tingkatLabel ? (
                        <>
                          {" "}
                          <StatusChip status="mengendap" customLabel={row.tingkatLabel} customTone="danger" />
                        </>
                      ) : null}
                    </DetailTableTd>
                    <DetailTableTd>
                      {row.umurTahapHari == null ? (
                        "—"
                      ) : (
                        <>
                          {`${row.umurTahapHari} hari`}
                          {row.acuanTahap ? (
                            <span className="text-muted-foreground"> sejak {formatDate(row.acuanTahap)}</span>
                          ) : null}
                          {row.tanpaPenandaTahap ? (
                            <span className="text-muted-foreground"> ({STOCKTAKE_UNFINISHED_NO_STAGE_MARKER_LABEL})</span>
                          ) : null}
                        </>
                      )}
                    </DetailTableTd>
                    <DetailTableTd>
                      {row.progresLabel}
                      {row.barisPerluHitungUlang > 0 ? (
                        <span className="text-muted-foreground">
                          {` — ${row.barisPerluHitungUlang} perlu hitung ulang`}
                        </span>
                      ) : null}
                      {row.tanpaBaris ? (
                        <span className="text-muted-foreground"> ({STOCKTAKE_UNFINISHED_NO_LINES_LABEL})</span>
                      ) : null}
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/inventaris/opname/sesi", { id: row.sessionId, slug: row.slug })}
                        className="font-medium text-primary hover:underline"
                      >
                        Buka Sesi
                      </Link>
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
