import Link from "next/link"
import {
  INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS,
  INVENTORY_TRANSFER_UNRECEIVED_COLUMN_LABELS,
  INVENTORY_TRANSFER_UNRECEIVED_EMPTY_TEXT,
  INVENTORY_TRANSFER_UNRECEIVED_TIERS,
  INVENTORY_TRANSFER_UNRECEIVED_TIER_LABELS,
  INVENTORY_TRANSFER_UNRECEIVED_TITLE,
  INVENTORY_TRANSFER_TRUNCATED_LABEL,
  INVENTORY_TRANSFER_UNKNOWN_STATUS_LABEL,
  type InventoryTransferUnreceivedQueue,
} from "@/lib/reports/inventory-transfer-unreceived-queue"
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
 * F-2026-10-27-106-S (106-F): seksi turunan transfer belum
 * diterima penuh di halaman daftar transfer existing.
 *
 * Render verbatim payload server (AC-ITQ-F1): ember, tingkat,
 * umur, sisa, urutan, dan rekap sudah dihitung builder —
 * komponen ini tidak menghitung umur/tingkat/sisa sendiri.
 * Baca-saja (AC-ITQ-F2): tanpa tombol Proses/Terima/Tutup
 * Selisih; tautan baris hanya ke detail transfer existing.
 * Tanda baris (AC-ITQ-F3) tampil apa adanya.
 */
export function InventoryTransferUnreceivedQueueCard({
  queue,
}: Readonly<{ queue: InventoryTransferUnreceivedQueue }>) {
  const labels = INVENTORY_TRANSFER_UNRECEIVED_COLUMN_LABELS
  const isEmpty = queue.rows.length === 0 && queue.unknownStatusRows.length === 0

  return (
    <section
      aria-label={INVENTORY_TRANSFER_UNRECEIVED_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {INVENTORY_TRANSFER_UNRECEIVED_TITLE}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{queue.noticeText}</p>
        <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
          <p>
            {queue.totalTransfers} transfer di jalan · {queue.totalBarisBersisa} baris bersisa
          </p>
          <ul aria-label="Rekap antrean transfer belum diterima" className="flex flex-wrap gap-1.5">
            {(
              Object.keys(INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS) as Array<
                keyof typeof INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS
              >
            ).map((bucket) =>
              INVENTORY_TRANSFER_UNRECEIVED_TIERS.map((tier) => (
                <li key={`${bucket}-${tier}`}>
                  <StatusChip
                    status={tier}
                    customLabel={`${INVENTORY_TRANSFER_UNRECEIVED_BUCKET_LABELS[bucket]} ${INVENTORY_TRANSFER_UNRECEIVED_TIER_LABELS[tier]}: ${queue.recap[bucket][tier].transferCount} transfer · ${queue.recap[bucket][tier].barisBersisa} baris`}
                    customTone={tier === "mengendap" ? "danger" : "default"}
                  />
                </li>
              )),
            )}
            {queue.unknownStatusCount > 0 ? (
              <li>
                <StatusChip
                  status="tidak-dikenal"
                  customLabel={`${INVENTORY_TRANSFER_UNKNOWN_STATUS_LABEL}: ${queue.unknownStatusCount}`}
                  customTone="warning"
                />
              </li>
            ) : null}
          </ul>
          {queue.terpotong ? (
            <p className="font-medium text-foreground">
              {INVENTORY_TRANSFER_TRUNCATED_LABEL}: menampilkan {queue.rows.length} dari{" "}
              {queue.totalTransfers} transfer; rekap dari populasi penuh.
            </p>
          ) : null}
          {queue.unknownTerpotong ? (
            <p className="font-medium text-foreground">
              {INVENTORY_TRANSFER_TRUNCATED_LABEL}: menampilkan {queue.unknownStatusRows.length} dari{" "}
              {queue.unknownStatusCount} status tidak dikenal.
            </p>
          ) : null}
        </div>
      </div>

      {isEmpty ? (
        <EmptyState title={INVENTORY_TRANSFER_UNRECEIVED_EMPTY_TEXT} className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>{labels.documentNo}</DetailTableTh>
              <DetailTableTh>{labels.route}</DetailTableTh>
              <DetailTableTh>{labels.date}</DetailTableTh>
              <DetailTableTh>{labels.bucket}</DetailTableTh>
              <DetailTableTh>{labels.umurDiJalan}</DetailTableTh>
              <DetailTableTh>{labels.barisBersisa}</DetailTableTh>
              <DetailTableTh>{labels.terimaTerakhir}</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {queue.rows.map((row) => (
                <DetailTableRow key={row.transferId}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/inventaris/transfer", { id: row.transferId, slug: row.slug })}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.documentNo}
                    </Link>
                    {row.flags.map((flag) => (
                      <span key={flag} className="block text-xs font-medium text-destructive">
                        {flag}
                      </span>
                    ))}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.sourceWarehouseName ?? "—"} → {row.destinationWarehouseName ?? "—"}
                  </DetailTableTd>
                  <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                  <DetailTableTd>
                    <span>{row.bucketLabel}</span>{" "}
                    <span className="text-muted-foreground">({row.status})</span>
                    {row.tingkat === "mengendap" ? (
                      <>
                        {" "}
                        <StatusChip status="mengendap" customLabel={row.tingkatLabel} customTone="danger" />
                      </>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>{row.umurLabel}</DetailTableTd>
                  <DetailTableTd>
                    {row.barisBersisaLabel}
                    {row.sisaPerBaris.length > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.sisaPerBaris.map((line) => `Baris ${line.lineId}: sisa ${line.sisaQty}`).join(" · ")}
                      </span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.terimaTerakhirAt ? formatDate(row.terimaTerakhirAt) : "—"}
                  </DetailTableTd>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/inventaris/transfer", { id: row.transferId, slug: row.slug })}
                      className="font-medium text-primary hover:underline"
                    >
                      Buka Transfer
                    </Link>
                  </DetailTableTd>
                </DetailTableRow>
              ))}
              {queue.unknownStatusRows.map((row) => (
                <DetailTableRow key={`unknown-${row.transferId}`}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/inventaris/transfer", { id: row.transferId, slug: row.slug })}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.documentNo}
                    </Link>
                    <span className="block text-xs font-medium text-destructive">
                      {INVENTORY_TRANSFER_UNKNOWN_STATUS_LABEL}: {row.status}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.sourceWarehouseName ?? "—"} → {row.destinationWarehouseName ?? "—"}
                  </DetailTableTd>
                  <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                  <DetailTableTd>{row.statusLabel}</DetailTableTd>
                  <DetailTableTd>—</DetailTableTd>
                  <DetailTableTd>—</DetailTableTd>
                  <DetailTableTd>—</DetailTableTd>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/inventaris/transfer", { id: row.transferId, slug: row.slug })}
                      className="font-medium text-primary hover:underline"
                    >
                      Buka Transfer
                    </Link>
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      )}
    </section>
  )
}
