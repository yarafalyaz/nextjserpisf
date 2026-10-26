import { statementBalanceSentence } from "@/lib/utils/whatsapp";

/**
 * F-2026-10-25-043-B1: subjek + isi email statement pelanggan (mailto)
 * dan validasi bentuk dasar alamat email (BR-SE-03/Q-SE-3 fisik Backend).
 *
 * Murni (tanpa Prisma/DB) — angka = payload server statement diformat di
 * sini (BR-SE-05: UI tidak hitung ulang); negatif ditampilkan sebagai nilai
 * absolut "kelebihan bayar ... kredit Anda". Wording 3 varian tanda
 * closingBalance IDENTIK kalimat Q-SW-3 putusan Lead (Q-SE-4, PR #903
 * issuecomment-6400093650). TANPA kata tagihan/menunggak/denda/segera
 * lunasi, TANPA angka denda, rincian faktur, atau klaim terkirim
 * (BR-SE-04/BR-ST-07). Pesan menyatakan statement dapat disediakan/dicetak —
 * TIDAK berpura-pura melampirkan PDF (mailto tidak membawa lampiran
 * sistem, BR-SE-08).
 */

export interface StatementEmailMessageInput {
  customerName: string;
  /** Label periode payload server statement, mis. "Periode 1 Jan 2026 – 15 Okt 2026". */
  periodLabel: string;
  /** Saldo akhir payload server statement (buildCustomerStatement). */
  closingBalance: number;
}

/**
 * Validasi bentuk dasar alamat email (BR-SE-03): satu `@`, domain bertitik,
 * tanpa spasi. Regex sama dengan validator existing
 * `src/lib/validations/auth.schemas.ts` (emailRegex) — jangan karang baru.
 * Mengembalikan alamat ter-normalisasi (trim; huruf besar dipertahankan,
 * mailto menerimanya) atau null bila kosong/format tidak valid (tombol
 * tidak tampil, EC-SE-1: di luar bentuk dasar = hilang, bukan ditebak/
 * diperbaiki diam-diam).
 */
export function normalizeCustomerEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{1,63}$/.test(trimmed)) return null;
  return trimmed;
}

export function buildStatementEmailSubject(input: {
  periodLabel: string;
}): string {
  // Subjek verbatim Q-SE-4: "Statement Piutang — <Label Periode>".
  return `Statement Piutang — ${input.periodLabel}`;
}

export function buildStatementEmailMessage(
  input: StatementEmailMessageInput,
): string {
  const tail = "Statement lengkap dapat kami sediakan/dicetak bila diperlukan.";
  // Kalimat saldo identik varian WA (Q-SE-4 = Q-SW-3) — helper bersama.
  const balanceLine = statementBalanceSentence(input.closingBalance);
  return [
    `Halo ${input.customerName},`,
    "",
    `Berikut statement piutang Anda untuk ${input.periodLabel}. ${balanceLine} ${tail}`,
    "",
    "Terima kasih.",
  ].join("\n");
}

/**
 * URL mailto penuh (to + subjek + isi ter-encode), atau null bila alamat
 * tidak bisa dipakai — mengikuti pola buildWhatsappUrl: tombol tidak lahir
 * untuk tautan mati. encodeURIComponent menangani alamat/subjek/isi dengan
 * karakter khusus supaya href tidak rusak (EC-SE-6).
 */
export function buildStatementEmailUrl(
  email: string | null | undefined,
  input: StatementEmailMessageInput,
): string | null {
  const normalized = normalizeCustomerEmail(email);
  if (!normalized) return null;
  const subject = buildStatementEmailSubject(input);
  const body = buildStatementEmailMessage(input);
  return `mailto:${normalized}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
