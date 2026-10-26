"use server";

import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import type { PermissionName } from "@/lib/setup/base-data";
import { logActivity } from "@/lib/services/activity-log.service";
import { toLocalDateOnly } from "@/lib/utils/date-only";

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
 *
 * F-2026-10-25-038-B1 (Q-SW-2 Backend, PUTUSAN Lead PR #890
 * issuecomment-6398030628): satu jenis statement `CustomerStatement`
 * berjangkar PELANGGAN (modelId = ID pelanggan, TIDAK ada nomor dokumen)
 * ditambahkan ke peta existing — bukan jalur khusus terpisah — dengan
 * penjaga `view_reports` (Q-SW-1: izin lihat permukaan induk laporan).
 * Metadata statement menambah tanggal periode (bukan PII); deskripsi log
 * memakai label jenis saja, TANPA nama pelanggan/nomor telepon/isi pesan
 * (BR-SW-02). Tiga jenis existing byte-sama (BR-SW-10): label, permission,
 * dan metadata ketiganya tidak berubah.
 */

const WHATSAPP_DOC_TYPES = {
  WorkOrder: { label: "Perintah Kerja", permission: "view_work_orders" },
  SalesInvoice: { label: "Faktur", permission: "view_sales_invoices" },
  Quotation: { label: "Penawaran", permission: "view_quotations" },
  CustomerStatement: { label: "Statement Pelanggan", permission: "view_reports" },
} as const satisfies Record<string, { label: string; permission: PermissionName }>;

export type WhatsappDocumentType = keyof typeof WHATSAPP_DOC_TYPES;

export async function recordWhatsappLinkOpened(input: {
  modelType: string;
  modelId: number;
  surface: string;
  periodStart?: Date;
  periodEnd?: Date;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const config =
      WHATSAPP_DOC_TYPES[input?.modelType as WhatsappDocumentType];
    if (!config) return { success: false, error: "Jenis dokumen tidak dikenal" };
    if (!Number.isSafeInteger(input.modelId) || input.modelId <= 0) {
      return { success: false, error: "Dokumen tidak valid" };
    }

    if (input.modelType === "CustomerStatement") {
      // Q-SW-2: statement hanya lahir di halaman statement (surface detail);
      // periode WAJIB dari payload server dan menjadi metadata jejak
      // (BR-SW-02/BR-SW-05). Kedua tanggal atau tidak sama sekali — setengah
      // periode ditolak, bukan dilengkapi karangan.
      if (input.surface !== "detail") {
        return { success: false, error: "Permukaan tautan tidak dikenal" };
      }
      const startOk =
        input.periodStart instanceof Date && !Number.isNaN(input.periodStart.getTime());
      const endOk =
        input.periodEnd instanceof Date && !Number.isNaN(input.periodEnd.getTime());
      if (!startOk || !endOk) {
        return { success: false, error: "Periode statement tidak valid" };
      }

      if (!(await hasPermission(config.permission))) {
        return { success: false, error: "Tidak berizin melihat dokumen ini" };
      }

      // Berjangkar pelanggan, bukan dokumen bernomor: pelanggan terhapus
      // lunak tidak boleh berjejak (konsisten halaman statement aktif).
      const customer = await prisma.customer.findFirst({
        where: { id: input.modelId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) return { success: false, error: "Dokumen tidak ditemukan" };

      await logActivity(
        "whatsapp_link_opened",
        input.modelType,
        input.modelId,
        `Tautan WhatsApp dibuka untuk ${config.label}`,
        {
          channel: "whatsapp",
          event: "link_opened",
          surface: "detail",
          periodStart: toLocalDateOnly(input.periodStart as Date),
          periodEnd: toLocalDateOnly(input.periodEnd as Date),
        },
      );
      return { success: true };
    }

    // Jalur 3 jenis dokumen bernomor existing — byte-sama (BR-SW-10).
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
