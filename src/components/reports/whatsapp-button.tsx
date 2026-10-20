import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";
import { buildWhatsappUrl } from "@/lib/utils/whatsapp";

/**
 * Tombol "Kirim WA" manual (F-2026-10-20-27(a)): membuka wa.me dengan teks
 * status ter-isi. Tidak tampil bila nomor pelanggan kosong/tidak valid —
 * staf tidak diarahkan ke tautan mati.
 */
export function WhatsappButton({
  phone,
  message,
}: Readonly<{ phone: string | null | undefined; message: string }>) {
  const href = buildWhatsappUrl(phone, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Kirim WA ke pelanggan"
      className={cn(buttonVariants({ variant: "secondary" }), "gap-1.5")}
    >
      <MessageCircle size={14} aria-hidden="true" /> Kirim WA
    </a>
  );
}
