"use client";

import { Mail } from "lucide-react";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";
import { recordEmailLinkOpened } from "@/actions/email-log.actions";

/**
 * Tombol "Kirim Email" statement pelanggan (F-2026-10-25-043-F1):
 * membuka klien email staf lewat tautan mailto yang SUDAH dibangun halaman
 * dari builder server (`buildStatementEmailUrl`) — komponen ini tidak
 * membangun alamat/subjek/isi dan tidak menghitung apa pun.
 *
 * Klik juga dicatat sebagai jejak ActivityLog per pelanggan
 * (`recordEmailLinkOpened`, fire-and-forget, pola `WhatsappButton`).
 * Yang tercatat adalah tautan email DIBUKA di klien email staf — bukan
 * email terkirim/dibaca (BR-SE-01). Pencatatan tidak pernah menahan
 * navigasi: tanpa preventDefault, tanpa await.
 */
export function EmailButton({
  href,
  modelId,
  periodStart,
  periodEnd,
}: Readonly<{
  /** URL mailto penuh dari builder; null = tombol tidak tampil. */
  href: string | null;
  /** ID pelanggan (jangkar jejak CustomerStatement). */
  modelId: number;
  /** Periode statement (payload server); wajib untuk jejak. */
  periodStart: Date;
  periodEnd: Date;
}>) {
  if (!href) return null;

  return (
    <a
      href={href}
      aria-label="Kirim Email"
      className={cn(buttonVariants({ variant: "secondary" }), "gap-1.5")}
      onClick={() => {
        void recordEmailLinkOpened({
          modelType: "CustomerStatement",
          modelId,
          surface: "detail",
          periodStart,
          periodEnd,
        });
      }}
    >
      <Mail size={14} aria-hidden="true" /> Kirim Email
    </a>
  );
}
