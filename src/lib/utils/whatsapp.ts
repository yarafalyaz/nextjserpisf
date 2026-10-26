import { formatCurrency, formatDate } from "@/lib/utils/format";
import { statusLabel } from "@/lib/utils/status-labels";

/**
 * F-2026-10-20-27(a): tautan WhatsApp manual (wa.me) — staf menekan kirim di
 * aplikasi WA sendiri. Tanpa API/gateway/kredensial; inti API otomatis
 * (F-27(b)) ditunda-teknis.
 */

/** Normalisasi nomor Indonesia ke format wa.me: 08.. -> 628.., +62/62 tetap. */
export function normalizeWhatsappPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  // Nomor lokal Indonesia minimal 628 + 8 digit; lebih pendek = tidak valid.
  if (!digits.startsWith("62") || digits.length < 11) return null;
  return digits;
}

export interface WhatsappMessageInput {
  customerName: string;
  documentLabel: string;
  documentNo: string;
  status: string;
  plateNumber?: string | null;
  estimatedEndDate?: Date | string | null;
}

export function buildWhatsappMessage(input: WhatsappMessageInput): string {
  const lines = [
    `Halo ${input.customerName},`,
    "",
    `Status ${input.documentLabel} ${input.documentNo}: ${statusLabel(input.status)}.`,
  ];
  if (input.plateNumber) lines.push(`Kendaraan: ${input.plateNumber}.`);
  if (input.estimatedEndDate) {
    lines.push(`Estimasi selesai: ${formatDate(input.estimatedEndDate)}.`);
  }
  lines.push("", "Terima kasih.");
  return lines.join("\n");
}

/** URL wa.me, atau null bila nomor tidak bisa dipakai. */
export function buildWhatsappUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export interface StatementWhatsappMessageInput {
  customerName: string;
  /** Label periode payload server statement, mis. "Periode 1 Jan 2026 – 15 Okt 2026". */
  periodLabel: string;
  /** Saldo akhir payload server statement (buildCustomerStatement). */
  closingBalance: number;
}

/**
 * Kalimat saldo statement — 3 varian verbatim PUTUSAN Lead Q-SW-3
 * (PR #890 issuecomment-6398030628), dipakai bersama pesan WA (038-B1) dan
 * email (043-B1, Q-SE-4: kalimat identik per varian). Angka = payload
 * server (BR-SW-05: UI tidak hitung ulang); negatif = nilai absolut
 * "kelebihan bayar ... kredit Anda". TANPA kata tagihan/menunggak/denda,
 * rincian faktur, atau klaim terkirim (BR-SW-01/BR-SW-04).
 */
export function statementBalanceSentence(closingBalance: number): string {
  if (closingBalance > 0) {
    return `Saldo akhir periode: ${formatCurrency(closingBalance)}.`;
  }
  if (closingBalance === 0) {
    return "Saldo akhir periode: Rp 0 — tidak ada sisa piutang pada akhir periode ini.";
  }
  return `Saldo akhir periode menunjukkan kelebihan bayar sebesar ${formatCurrency(Math.abs(closingBalance))} yang tercatat sebagai kredit Anda.`;
}

/**
 * F-2026-10-25-038-B1: pesan WA statement pelanggan. Kalimat saldo +
 * penutup memakai helper bersama `statementBalanceSentence` (verbatim
 * Q-SW-3). Pesan menyatakan statement dapat disediakan/dicetak — TIDAK
 * berpura-pura melampirkan PDF.
 */
export function buildStatementWhatsappMessage(
  input: StatementWhatsappMessageInput,
): string {
  const tail = "Statement lengkap dapat kami sediakan/dicetak bila diperlukan.";
  const balanceLine = statementBalanceSentence(input.closingBalance);
  return [
    `Halo ${input.customerName},`,
    "",
    `Berikut statement piutang Anda untuk ${input.periodLabel}. ${balanceLine} ${tail}`,
    "",
    "Terima kasih.",
  ].join("\n");
}
