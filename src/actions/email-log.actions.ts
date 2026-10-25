"use server";

import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/services/activity-log.service";
import { toLocalDateOnly } from "@/lib/utils/date-only";

/**
 * F-2026-10-25-043-B1 (Q-SE-3 fisik Backend; Q-SE-1 putusan Lead PR #903
 * issuecomment-6400093650): catat klik tautan email (mailto) statement
 * pelanggan sebagai ActivityLog `email_link_opened` berjangkar PELANGGAN
 * (modelType `CustomerStatement`, modelId = ID pelanggan — tidak ada nomor
 * dokumen).
 *
 * Kontrak jujur (BR-SE-01): yang tercatat adalah tautan email DIBUKA di
 * klien email staf, BUKAN email terkirim/dibaca. Metadata TANPA alamat
 * email/subjek/isi/nama staf penerima (AC-SE-B1) — hanya kanal + periode
 * (bukan PII). Nama aksi email TERPISAH dari `whatsapp_link_opened`:
 * mencampur kanal ke aksi bernama whatsapp dilarang (AC-SE-B3/BR-SE-02).
 *
 * Guard (Q-SE-1): sesi login + `view_reports` (izin lihat permukaan induk
 * laporan, key sama gerbang halaman statement). Tanpa izin → ditolak TANPA
 * log ({ success: false }), bukan dicatat diam-diam (AC-SE-B2 fail-closed).
 *
 * Fire-and-forget (AC-SE-B4/BR-SE-06): fungsi ini tidak pernah melempar —
 * kegagalan catat tidak boleh menggagalkan navigasi mailto. Klik ganda =
 * dua baris (AC-SE-B5/BR-SE-07): tidak ada dedup.
 *
 * BR-SE-08: TIDAK ADA pengiriman server-side (SMTP/API dilarang tahap ini;
 * Q-SE-2 ditunda). Aksi ini hanya mencatat klik; tautan `mailto:` dibangun
 * frontend dari builder email statement (email-statement-message.ts).
 */
export async function recordEmailLinkOpened(input: {
  modelType: string;
  modelId: number;
  surface: string;
  periodStart?: Date;
  periodEnd?: Date;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Hanya statement kanal email yang lahir lewat aksi ini (043-B1);
    // kanal lain/dokumen bernomor tidak dicampur ke `email_link_opened`.
    if (input?.modelType !== "CustomerStatement") {
      return { success: false, error: "Jenis dokumen tidak dikenal" };
    }
    if (!Number.isSafeInteger(input.modelId) || input.modelId <= 0) {
      return { success: false, error: "Dokumen tidak valid" };
    }
    // Statement hanya lahir di halaman statement (surface detail); periode
    // WAJIB dari payload server dan menjadi metadata jejak (BR-SE-02/05).
    // Kedua tanggal atau tidak sama sekali — setengah periode ditolak.
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

    if (!(await hasPermission("view_reports"))) {
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
      "email_link_opened",
      "CustomerStatement",
      input.modelId,
      "Tautan Email dibuka untuk Statement Pelanggan",
      {
        channel: "email",
        event: "link_opened",
        surface: "detail",
        periodStart: toLocalDateOnly(input.periodStart as Date),
        periodEnd: toLocalDateOnly(input.periodEnd as Date),
      },
    );
    return { success: true };
  } catch (e) {
    // Fire-and-forget: catat kegagalan untuk monitoring, jangan lempar —
    // tautan mailto harus tetap terbuka apa pun yang terjadi di sini.
    console.error("[recordEmailLinkOpened] gagal mencatat klik email", e);
    return { success: false, error: "Gagal mencatat klik email" };
  }
}
