import Link from "next/link"
import type { WarrantyExpiryQueue } from "@/lib/reports/warranty-expiry-queue"
import {
  WARRANTY_EXPIRY_CONTACT_NOTICE_TEXT,
  WARRANTY_EXPIRY_EMPTY_TEXT,
  WARRANTY_EXPIRY_INACTIVE_VEHICLE_LABEL,
  WARRANTY_EXPIRY_NOTICE_TEXT,
  WARRANTY_EXPIRY_QUEUE_TITLE,
} from "@/lib/reports/warranty-expiry-queue"
import { formatDate, formatNumber, formatPhone } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { WhatsappButton } from "./whatsapp-button"

/**
 * F-2026-10-22-094-S: antrean "Garansi Segera Berakhir" (Q-WX-3 dua permukaan,
 * satu builder BOT 3). Komponen murni presentasi atas `WarrantyExpiryQueue`:
 * ember/sisa hari/penanda ditempel apa adanya dari server — UI TIDAK
 * menghitung sisa hari, status, atau ember (AC-WX-3/6).
 *
 * Permukaan menentukan kontak (Q-WX-1): scope `claims_page` menampilkan
 * telepon + tombol WA (jejak F-036 lewat WhatsappButton existing, model
 * WorkOrder dari baris coverage); scope `report` tidak pernah menerima
 * telepon dari loader (selalu null) sehingga kolom kontak tidak dirender.
 * Kata §7 verbatim dari konstanta builder. Tanpa ekspor tahap 1 (BR-WX-06).
 */
export function WarrantyExpiryQueueCard({
  queue,
}: Readonly<{ queue: WarrantyExpiryQueue }>) {
  const { rows, summary } = queue
  const showContact = queue.scope === "claims_page"

  return (
    <section
      aria-label={WARRANTY_EXPIRY_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {WARRANTY_EXPIRY_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(summary.segeraBerakhir)} segera berakhir ·{" "}
          {formatNumber(summary.baruBerakhir)} baru berakhir ·{" "}
          {formatNumber(summary.tanpaBatasJelas)} tanpa batas jelas ·{" "}
          {formatNumber(summary.kendaraanNonaktif)}{" "}
          {WARRANTY_EXPIRY_INACTIVE_VEHICLE_LABEL.toLowerCase()} · dari{" "}
          {formatNumber(summary.totalCoverageDinilai)} cakupan dinilai
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{WARRANTY_EXPIRY_NOTICE_TEXT}</p>
        {showContact ? (
          <p className="text-xs text-muted-foreground">{WARRANTY_EXPIRY_CONTACT_NOTICE_TEXT}</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {WARRANTY_EXPIRY_EMPTY_TEXT}
          </p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Pelanggan</DetailTableTh>
              <DetailTableTh>Kendaraan</DetailTableTh>
              <DetailTableTh>Barang</DetailTableTh>
              <DetailTableTh>Serial</DetailTableTh>
              <DetailTableTh>Berakhir</DetailTableTh>
              <DetailTableTh align="right">Sisa Hari</DetailTableTh>
              <DetailTableTh>Ember</DetailTableTh>
              <DetailTableTh>Penanda Klaim</DetailTableTh>
              <DetailTableTh>Batas Km</DetailTableTh>
              {showContact ? <DetailTableTh>Kontak</DetailTableTh> : null}
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.coverageId}>
                  <DetailTableTd>{row.customerName}</DetailTableTd>
                  <DetailTableTd>
                    <span className="font-mono">{row.plateNumber ?? "—"}</span>
                    {row.vehicleName ? (
                      <span className="block text-xs text-muted-foreground">{row.vehicleName}</span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.itemName}
                    <span className="block text-xs text-muted-foreground">{row.itemSku}</span>
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.serialNumber ? (
                      <span className="font-mono">{row.serialLabel}</span>
                    ) : (
                      row.serialLabel
                    )}
                  </DetailTableTd>
                  <DetailTableTd>{row.expiresAt ? formatDate(row.expiresAt) : "—"}</DetailTableTd>
                  <DetailTableTd align="right">
                    {row.sisaHari === null ? "—" : `${formatNumber(row.sisaHari)} hari`}
                  </DetailTableTd>
                  <DetailTableTd>{row.emberLabel}</DetailTableTd>
                  <DetailTableTd>{row.penandaKlaimLabel}</DetailTableTd>
                  <DetailTableTd>{row.batasKmLabel ?? "—"}</DetailTableTd>
                  {showContact ? (
                    <DetailTableTd>
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{formatPhone(row.customerPhone)}</span>
                        <WhatsappButton
                          phone={row.customerPhone}
                          modelType="WorkOrder"
                          modelId={row.workOrderId}
                          surface="queue"
                          message={`Halo ${row.customerName}, garansi ${row.itemName} untuk kendaraan ${row.plateNumber ?? ""} ${row.emberLabel.toLowerCase()}${row.expiresAt ? ` (berakhir ${formatDate(row.expiresAt)})` : ""}. Terima kasih.`}
                        />
                      </span>
                    </DetailTableTd>
                  ) : null}
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
        <p className="text-xs text-muted-foreground">
          <Link href="/produksi/garansi" className="text-primary hover:underline">
            Buka daftar klaim garansi
          </Link>
        </p>
      </div>
    </section>
  )
}
