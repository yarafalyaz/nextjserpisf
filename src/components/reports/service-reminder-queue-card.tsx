import type { ServiceReminderQueue, ServiceReminderStatus } from "@/lib/reports/service-reminder-queue"
import {
  SERVICE_REMINDER_EMPTY_TEXT,
  SERVICE_REMINDER_INACTIVE_LABEL,
  SERVICE_REMINDER_KM_NOTICE_TEXT,
  SERVICE_REMINDER_NOTICE_TEXT,
  SERVICE_REMINDER_QUEUE_TITLE,
} from "@/lib/reports/service-reminder-queue"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const STATUS_TONES: Record<ServiceReminderStatus, "danger" | "warning" | "accent" | "default"> = {
  terlewat: "danger",
  mendekati: "warning",
  jadwal_rusak: "danger",
  terjadwal: "accent",
  belum_terjadwal: "default",
}

/**
 * F-2026-10-25-021-S: antrean pengingat servis berkala per kendaraan.
 * Komponen murni presentasi atas `ServiceReminderQueue`: status/sisa
 * hari/sisa km/ember ditempel apa adanya dari server — UI TIDAK
 * menghitung sisa, status, atau ember (AC-SV-F1). Sisa km null =
 * tidak bisa dinilai → penanda jujur, bukan 0. Telepon pelanggan tidak
 * pernah dimuat loader (BR-SV-06) sehingga tidak ada kolom kontak.
 * Baca-saja: tanpa form/tombol/ekspor.
 */
export function ServiceReminderQueueCard({
  queue,
}: Readonly<{ queue: ServiceReminderQueue }>) {
  const { rows, summary } = queue
  return (
    <section
      aria-label={SERVICE_REMINDER_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {SERVICE_REMINDER_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(summary.terlewat)} terlewat · {formatNumber(summary.mendekati)}{" "}
          mendekati · {formatNumber(summary.jadwalRusak)} jadwal_rusak ·{" "}
          {formatNumber(summary.belumTerjadwal)} belum_terjadwal ·{" "}
          {formatNumber(summary.kendaraanNonaktif)}{" "}
          {SERVICE_REMINDER_INACTIVE_LABEL} · {formatNumber(summary.diLuarJendela)} di
          luar jendela · dari {formatNumber(summary.totalKendaraanDinilai)} kendaraan
          dinilai
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{SERVICE_REMINDER_NOTICE_TEXT}</p>
        <p className="text-xs text-muted-foreground">{SERVICE_REMINDER_KM_NOTICE_TEXT}</p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {SERVICE_REMINDER_EMPTY_TEXT}
          </p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Pelanggan</DetailTableTh>
              <DetailTableTh>Kendaraan</DetailTableTh>
              <DetailTableTh>Servis Berikutnya</DetailTableTh>
              <DetailTableTh align="right">Sisa Hari</DetailTableTh>
              <DetailTableTh align="right">Sisa Km</DetailTableTh>
              <DetailTableTh align="right">Odometer Terakhir</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Catatan</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={row.customerVehicleId}>
                  <DetailTableTd>{row.customerName}</DetailTableTd>
                  <DetailTableTd>
                    <span className="font-mono">{row.plateNumber ?? "—"}</span>
                    {row.vehicleName ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.vehicleName}
                      </span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.nextServiceDate ? formatDate(row.nextServiceDate) : "—"}
                    {row.nextServiceKm != null ? (
                      <span className="block text-xs text-muted-foreground">
                        {formatNumber(row.nextServiceKm)} km
                      </span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    {row.sisaHari === null ? "—" : `${formatNumber(row.sisaHari)} hari`}
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    {row.sisaKm === null
                      ? "Tidak bisa dinilai"
                      : `${formatNumber(row.sisaKm)} km`}
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    {row.lastOdometerKm === null
                      ? "—"
                      : `${formatNumber(row.lastOdometerKm)} km`}
                  </DetailTableTd>
                  <DetailTableTd>
                    <StatusChip
                      status={row.status}
                      customLabel={row.statusLabel}
                      customTone={STATUS_TONES[row.status]}
                    />
                  </DetailTableTd>
                  <DetailTableTd>{row.nextServiceNote ?? "—"}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </div>
    </section>
  )
}
