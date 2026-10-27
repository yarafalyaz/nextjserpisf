import Link from "next/link"
import {
  MATERIAL_REQUEST_DRAFT_COLUMN_LABELS,
  MATERIAL_REQUEST_DRAFT_LEVEL_LABELS,
  MATERIAL_REQUEST_DRAFT_NOTICE_TEXT,
  type MaterialRequestDraftLevel,
  type MaterialRequestDraftQueue,
  type MaterialRequestDraftWarehouseCount,
} from "@/lib/reports/material-request-draft-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { ReportCardShell } from "./report-card-shell"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const LEVEL_TONES: Record<MaterialRequestDraftLevel, "danger" | "default"> = {
  mengendap: "danger",
  menunggu: "default",
}

const QUEUE_TITLE = "Antrean Permintaan Material Draft"

function warehouseRecapLabel(
  ariaLabel: string,
  entries: MaterialRequestDraftWarehouseCount[],
  unit: string,
) {
  if (entries.length === 0) return null
  return (
    <ul aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {entries.map((entry) => (
        <li key={entry.warehouseId}>
          <StatusChip
            status={entry.warehouseName}
            customLabel={`${entry.warehouseName}: ${formatNumber(entry.total)} ${unit} (${formatNumber(entry.levelCounts.mengendap)} ${MATERIAL_REQUEST_DRAFT_LEVEL_LABELS.mengendap.toLowerCase()}, ${formatNumber(entry.levelCounts.menunggu)} ${MATERIAL_REQUEST_DRAFT_LEVEL_LABELS.menunggu.toLowerCase()})`}
            customTone="default"
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * 071-F (F-2026-10-26-071-S tahap 1, AC-MRQ-F1..F3): antrean permintaan
 * material draft mengendap. Komponen murni presentasi atas
 * `MaterialRequestDraftQueue` dari loader server
 * (`getMaterialRequestDraftQueue`, Backend PR #1108 merged): kolom, label
 * tingkat, penanda neededBy lampau, notice, dan rekap ditempel verbatim
 * payload/konstanta server — UI TIDAK menghitung umur/tingkat/Σ qty dan
 * tidak mengurut ulang. Σ qty = qty item tersimpan apa adanya, BUKAN sisa
 * kebutuhan/stok/nilai (BR-MRQ-05); payload tanpa nilai uang. WO/pembuat/
 * neededBy kosong tampil `—` (BR-MRQ-09). Tautan baris hanya ke detail
 * permintaan existing; nol tombol Ajukan/Setujui/Buat Transfer/Hapus.
 */
export function MaterialRequestDraftQueueCard({
  queue,
}: Readonly<{ queue: MaterialRequestDraftQueue }>) {
  const { rows, levelCounts, requesterWarehouseCounts, sourceWarehouseCounts, totalDocuments } =
    queue

  return (
    <ReportCardShell
      label={QUEUE_TITLE}
      title={QUEUE_TITLE}
      summary={
        <>
          {formatNumber(levelCounts.mengendap)}{" "}
          {MATERIAL_REQUEST_DRAFT_LEVEL_LABELS.mengendap.toLowerCase()} ·{" "}
          {formatNumber(levelCounts.menunggu)}{" "}
          {MATERIAL_REQUEST_DRAFT_LEVEL_LABELS.menunggu.toLowerCase()} ·{" "}
          {formatNumber(totalDocuments)} permintaan draft
        </>
      }
      isEmpty={rows.length === 0}
      emptyText="Tidak ada permintaan material Draf."
      notice={MATERIAL_REQUEST_DRAFT_NOTICE_TEXT}
    >
      <div className="flex flex-col gap-4">
        {warehouseRecapLabel(
          "Rekap gudang tujuan antrean permintaan material draft",
          requesterWarehouseCounts,
          "permintaan",
        )}
        {warehouseRecapLabel(
          "Rekap gudang sumber antrean permintaan material draft",
          sourceWarehouseCounts,
          "permintaan",
        )}
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>{MATERIAL_REQUEST_DRAFT_COLUMN_LABELS.age}</DetailTableTh>
            <DetailTableTh>{MATERIAL_REQUEST_DRAFT_COLUMN_LABELS.documentNo}</DetailTableTh>
            <DetailTableTh>{MATERIAL_REQUEST_DRAFT_COLUMN_LABELS.requesterWarehouse}</DetailTableTh>
            <DetailTableTh>{MATERIAL_REQUEST_DRAFT_COLUMN_LABELS.sourceWarehouse}</DetailTableTh>
            <DetailTableTh>{MATERIAL_REQUEST_DRAFT_COLUMN_LABELS.workOrder}</DetailTableTh>
            <DetailTableTh>{MATERIAL_REQUEST_DRAFT_COLUMN_LABELS.neededBy}</DetailTableTh>
            <DetailTableTh align="right">Item</DetailTableTh>
            <DetailTableTh align="right">Qty Permintaan</DetailTableTh>
            <DetailTableTh>{MATERIAL_REQUEST_DRAFT_COLUMN_LABELS.createdBy}</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.materialRequestId}>
                <DetailTableTd>
                  <StatusChip
                    status={row.tingkat}
                    customLabel={row.tingkatLabel}
                    customTone={LEVEL_TONES[row.tingkat]}
                  />
                  <span className="block text-xs text-muted-foreground">
                    {formatNumber(row.umurDraftHari)} hari
                  </span>
                </DetailTableTd>
                <DetailTableTd>
                  <Link
                    href={entityHref("/inventaris/permintaan-gudang", {
                      id: row.materialRequestId,
                      slug: row.slug,
                    })}
                    className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                  >
                    {row.documentNo}
                  </Link>
                </DetailTableTd>
                <DetailTableTd>{row.requesterWarehouseName}</DetailTableTd>
                <DetailTableTd>{row.sourceWarehouseName}</DetailTableTd>
                <DetailTableTd>{row.workOrderDocumentNo ?? "—"}</DetailTableTd>
                <DetailTableTd>
                  {row.neededBy ? formatDate(row.neededBy) : "—"}
                  {row.neededByLampauLabel ? (
                    <span className="block text-xs font-medium text-destructive">
                      {row.neededByLampauLabel}
                    </span>
                  ) : null}
                </DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.itemCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.totalQty)}</DetailTableTd>
                <DetailTableTd>{row.createdByName ?? "—"}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
