/**
 * Loader read-only jejak dokumen (F-2026-10-21-036 tahap 2): baris
 * ActivityLog per dokumen — klik tautan WhatsApp + (khusus WO) geser
 * estimasi selesai. Hanya baca; permission view dokumen ditegakkan page
 * pemanggil (requirePermission) sebelum loader ini dipanggil.
 */

import { prisma } from "@/lib/db/prisma";
import {
  buildWhatsappTrail,
  type WhatsappTrail,
} from "@/lib/reports/whatsapp-trail";

export type WhatsappTrailDocumentType =
  | "WorkOrder"
  | "SalesInvoice"
  | "Quotation";

export async function getWhatsappTrail(
  modelType: WhatsappTrailDocumentType,
  modelId: number,
): Promise<WhatsappTrail> {
  const actions =
    modelType === "WorkOrder"
      ? ["whatsapp_link_opened", "work_order_end_date_changed"]
      : ["whatsapp_link_opened"];
  const rows = await prisma.activityLog.findMany({
    where: { modelType, modelId, action: { in: actions } },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      action: true,
      userId: true,
      createdAt: true,
      oldValues: true,
      newValues: true,
      metadata: true,
    },
  });

  const userIds = Array.from(
    new Set(rows.map((r) => r.userId).filter((id) => id != null)),
  );
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return buildWhatsappTrail(
    rows.map((r) => ({
      action: r.action,
      userName: r.userId ? (nameById.get(r.userId) ?? null) : null,
      createdAt: r.createdAt,
      oldValues: r.oldValues,
      newValues: r.newValues,
      metadata: r.metadata,
    })),
  );
}
