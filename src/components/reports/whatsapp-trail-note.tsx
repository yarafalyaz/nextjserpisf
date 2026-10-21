import { formatDate } from "@/lib/utils/format";
import type { WhatsappTrail } from "@/lib/reports/whatsapp-trail";
import { WORK_ORDER_END_DATE_REASONS } from "@/lib/validations/inventory.schemas";

function reasonLabel(reasonCode: string | null): string | null {
  if (!reasonCode) return null;
  const label =
    WORK_ORDER_END_DATE_REASONS[
      reasonCode as keyof typeof WORK_ORDER_END_DATE_REASONS
    ];
  return label ?? reasonCode;
}

/**
 * F-2026-10-21-036 tahap 2: jejak jujur di detail dokumen — "Tautan
 * WhatsApp dibuka oleh … · …" (klik tautan, BUKAN pesan terkirim) dan,
 * khusus WO, histori geser estimasi selesai F-035. Murni presentasi dari
 * loader `getWhatsappTrail`; tidak tampil sama sekali bila belum ada jejak.
 * Tidak tampil di kartu antrean.
 */
export function WhatsappTrailNote({
  trail,
}: Readonly<{ trail: WhatsappTrail }>) {
  if (!trail.lastOpened && trail.endDateShifts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      {trail.lastOpened ? (
        <p>
          Tautan WhatsApp dibuka oleh{" "}
          {trail.lastOpened.userName ?? "Pengguna"} ·{" "}
          {formatDate(trail.lastOpened.createdAt, { includeTime: true })} WIB
        </p>
      ) : null}
      {trail.endDateShifts.map((shift, i) => {
        const label = reasonLabel(shift.reasonCode);
        return (
          <p key={`${shift.createdAt.toISOString()}-${i}`}>
            Estimasi selesai digeser dari{" "}
            {shift.oldEndDate ? formatDate(shift.oldEndDate) : "—"} ke{" "}
            {shift.newEndDate ? formatDate(shift.newEndDate) : "—"}
            {label ? <> — {label}</> : null}
            {shift.reasonNote ? <> ({shift.reasonNote})</> : null} oleh{" "}
            {shift.userName ?? "Pengguna"} ·{" "}
            {formatDate(shift.createdAt, { includeTime: true })} WIB
          </p>
        );
      })}
    </div>
  );
}
