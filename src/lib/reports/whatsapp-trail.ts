/**
 * Builder murni jejak dokumen (F-2026-10-21-036 tahap 2 + F-035 histori):
 * klik tautan WhatsApp terakhir + histori geser estimasi selesai WO.
 *
 * Label WAJIB jujur: "Tautan WhatsApp dibuka" — klik tautan BUKAN pesan
 * terkirim. Builder tidak menghitung status bisnis apa pun; hanya memilih
 * baris terakhir per jenis peristiwa dari ActivityLog apa adanya.
 */

export interface WhatsappTrailLogRow {
  action: string;
  userName: string | null;
  createdAt: Date;
  /** Hanya untuk work_order_end_date_changed: { endDate } ISO. */
  oldValues: unknown;
  newValues: unknown;
  /** JSON string: { reasonCode, reasonNote? }. */
  metadata: string | null;
}

export interface WorkOrderEndDateShift {
  userName: string | null;
  createdAt: Date;
  oldEndDate: string | null;
  newEndDate: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
}

export interface WhatsappTrail {
  lastOpened: { userName: string | null; createdAt: Date } | null;
  endDateShifts: WorkOrderEndDateShift[];
}

function endDateOf(values: unknown): string | null {
  if (typeof values !== "object" || values === null) return null;
  const endDate = (values as { endDate?: unknown }).endDate;
  return typeof endDate === "string" ? endDate : null;
}

function parseMetadata(metadata: string | null): {
  reasonCode: string | null;
  reasonNote: string | null;
} {
  if (!metadata) return { reasonCode: null, reasonNote: null };
  try {
    const parsed = JSON.parse(metadata) as {
      reasonCode?: unknown;
      reasonNote?: unknown;
    };
    return {
      reasonCode:
        typeof parsed.reasonCode === "string" ? parsed.reasonCode : null,
      reasonNote:
        typeof parsed.reasonNote === "string" ? parsed.reasonNote : null,
    };
  } catch {
    return { reasonCode: null, reasonNote: null };
  }
}

/** rows diasumsikan terurut createdAt menurun (loader yang menjamin). */
export function buildWhatsappTrail(
  rows: readonly WhatsappTrailLogRow[],
): WhatsappTrail {
  const opened = rows.find((r) => r.action === "whatsapp_link_opened");
  return {
    lastOpened: opened
      ? { userName: opened.userName, createdAt: opened.createdAt }
      : null,
    endDateShifts: rows
      .filter((r) => r.action === "work_order_end_date_changed")
      .map((r) => ({
        userName: r.userName,
        createdAt: r.createdAt,
        oldEndDate: endDateOf(r.oldValues),
        newEndDate: endDateOf(r.newValues),
        ...parseMetadata(r.metadata),
      })),
  };
}
