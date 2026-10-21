"use server";

import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import type { PermissionName } from "@/lib/setup/base-data";
import { logActivity } from "@/lib/services/activity-log.service";

/**
 * F-2026-10-21-036 (vonis Lead Q-LEAD-1, t_586ab283): catat klik tautan
 * WhatsApp sebagai ActivityLog per dokumen — action `whatsapp_link_opened`.
 *
 * Kontrak jujur: yang tercatat adalah KLIK TAUTAN dibuka, bukan pesan
 * terkirim. Metadata TANPA nomor telepon / isi pesan (PII dilarang masuk
 * log). Fire-and-forget: fungsi ini tidak pernah melempar — kegagalan catat
 * tidak boleh menggagalkan navigasi wa.me (pola logActivity telan-error).
 *
 * Guard (syarat Lead): sesi login + view permission per modelType. Tanpa
 * izin → ditolak TANPA log ({ success: false }), bukan dicatat diam-diam.
 */

const WHATSAPP_DOC_TYPES = {
  WorkOrder: { label: "Perintah Kerja", permission: "view_work_orders" },
  SalesInvoice: { label: "Faktur", permission: "view_sales_invoices" },
  Quotation: { label: "Penawaran", permission: "view_quotations" },
} as const satisfies Record<string, { label: string; permission: PermissionName }>;

export type WhatsappDocumentType = keyof typeof WHATSAPP_DOC_TYPES;

export async function recordWhatsappLinkOpened(input: {
  modelType: string;
  modelId: number;
  surface: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const config =
      WHATSAPP_DOC_TYPES[input?.modelType as WhatsappDocumentType];
    if (!config) return { success: false, error: "Jenis dokumen tidak dikenal" };
    if (!Number.isSafeInteger(input.modelId) || input.modelId <= 0) {
      return { success: false, error: "Dokumen tidak valid" };
    }
    if (input.surface !== "queue" && input.surface !== "detail") {
      return { success: false, error: "Permukaan tautan tidak dikenal" };
    }

    // Sesi + izin lihat dokumen itu. hasPermission non-throwing (tidak
    // redirect) — aksi fire-and-forget tidak boleh melempar NEXT_REDIRECT.
    if (!(await hasPermission(config.permission))) {
      return { success: false, error: "Tidak berizin melihat dokumen ini" };
    }

    const doc =
      input.modelType === "WorkOrder"
        ? await prisma.workOrder.findUnique({
            where: { id: input.modelId },
            select: { documentNo: true },
          })
        : input.modelType === "SalesInvoice"
          ? await prisma.salesInvoice.findUnique({
              where: { id: input.modelId },
              select: { documentNo: true },
            })
          : await prisma.quotation.findUnique({
              where: { id: input.modelId },
              select: { documentNo: true },
            });
    if (!doc) return { success: false, error: "Dokumen tidak ditemukan" };

    await logActivity(
      "whatsapp_link_opened",
      input.modelType,
      input.modelId,
      `Tautan WhatsApp dibuka untuk ${config.label} ${doc.documentNo}`,
      { channel: "whatsapp", event: "link_opened", surface: input.surface },
    );
    return { success: true };
  } catch (e) {
    // Fire-and-forget: catat kegagalan untuk monitoring, jangan lempar —
    // tautan wa.me harus tetap terbuka apa pun yang terjadi di sini.
    console.error("[recordWhatsappLinkOpened] gagal mencatat klik WA", e);
    return { success: false, error: "Gagal mencatat klik WhatsApp" };
  }
}
