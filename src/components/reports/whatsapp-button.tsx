"use client";

import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";
import { buildWhatsappUrl } from "@/lib/utils/whatsapp";
import { recordWhatsappLinkOpened } from "@/actions/whatsapp-log.actions";
import type {
  WhatsappDocumentType,
} from "@/actions/whatsapp-log.actions";

/**
 * Tombol "Kirim WA" manual (F-2026-10-20-27(a)): membuka wa.me dengan teks
 * status ter-isi. Tidak tampil bila nomor pelanggan kosong/tidak valid —
 * staf tidak diarahkan ke tautan mati.
 *
 * F-2026-10-21-036: klik juga dicatat sebagai jejak ActivityLog per dokumen
 * (`recordWhatsappLinkOpened`, fire-and-forget). Yang tercatat adalah tautan
 * DIBUKA — bukan pesan terkirim. Pencatatan tidak pernah menahan navigasi:
 * tanpa preventDefault, tanpa await.
 */
export function WhatsappButton({
  phone,
  message,
  modelType,
  modelId,
  surface,
  label = "Kirim WA",
}: Readonly<{
  phone: string | null | undefined;
  message: string;
  modelType: WhatsappDocumentType;
  modelId: number;
  surface: "queue" | "detail";
  label?: string;
}>) {
  const href = buildWhatsappUrl(phone, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Kirim WA ke pelanggan"
      className={cn(buttonVariants({ variant: "secondary" }), "gap-1.5")}
      onClick={() => {
        void recordWhatsappLinkOpened({ modelType, modelId, surface });
      }}
    >
      <MessageCircle size={14} aria-hidden="true" /> {label}
    </a>
  );
}
