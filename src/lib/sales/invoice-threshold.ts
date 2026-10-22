/**
 * F-2026-10-22-065-S (inti F-2026-10-20-108): ambang konversi DP → invoice.
 *
 * Ambang efektif dibaca dari snapshot `Quotation.invoiceThresholdPercent`
 * (diisi saat quotation dibuat dari `CustomerCategory.downPaymentPercent`).
 * BUKAN konstanta 50% dan BUKAN master kategori berjalan: mengubah master
 * tidak menulis ulang kesepakatan quotation berjalan (AC-DP65-4).
 *
 * Snapshot kosong/nol/korup (di luar rentang sah >0 dan <=100) fail-closed
 * ke default 50 (BR-DP65-02/03, AC-DP65-2/5). Default 50 mempertahankan
 * perilaku berjalan persis, termasuk pembulatan ke atas ke sen.
 *
 * Vonis BOT 4 F-2026-10-22-073-V: ambang hanya mengatur saat lahir invoice
 * DRAFT; tidak memicu posting/stok/jurnal/TaxInvoice (penjaga di hook).
 */

export const DEFAULT_INVOICE_THRESHOLD_PERCENT = 50;

/** Bentuk data persen efektif untuk konsumen UI (BOT 2, kartu t_3d831132). */
export interface InvoiceThresholdInfo {
  /** Persen efektif (sesudah fail-closed). UI menampilkan apa adanya. */
  percent: number;
  /** Sumber verbatim dari server; UI TIDAK menghitung label sendiri (AC-DP65-7). */
  sourceLabel: string;
}

/** Persen snapshot sah bila >0 dan <=100 (BR-DP65-03). */
export function isValidInvoiceThresholdPercent(percent: unknown): percent is number {
  const n = typeof percent === "number" ? percent : Number(percent);
  return Number.isFinite(n) && n > 0 && n <= 100;
}

/**
 * Persen efektif murni: snapshot sah dipakai; kosong/korup → 50 + log.
 * `onInvalid` opsional supaya pemanggil memutuskan cara mencatat (hook
 * menulis log terstruktur); helper sendiri tidak punya efek samping.
 */
export function resolveInvoiceThresholdPercent(
  snapshotPercent: unknown,
  onInvalid?: (raw: unknown) => void,
): number {
  if (isValidInvoiceThresholdPercent(snapshotPercent)) {
    return Number(snapshotPercent);
  }
  if (snapshotPercent !== null && snapshotPercent !== undefined && snapshotPercent !== 0 && onInvalid) {
    onInvalid(snapshotPercent);
  }
  return DEFAULT_INVOICE_THRESHOLD_PERCENT;
}

/** Ambang sen: ceil(grandTotalSen × persen / 100) — pola existing (BR-DP65-04). */
export function computeInvoiceThresholdSen(grandTotalSen: number, percent: number): number {
  return Math.ceil((grandTotalSen * percent) / 100);
}

/** Label sumber verbatim (AC-DP65-6); teks ini kontrak UI, jangan parafrase. */
export function invoiceThresholdSourceLabel(snapshotPercent: unknown): string {
  if (isValidInvoiceThresholdPercent(snapshotPercent)) {
    return `Ambang invoice dari kategori pelanggan: ${Number(snapshotPercent)}%`;
  }
  return `Ambang invoice default: ${DEFAULT_INVOICE_THRESHOLD_PERCENT}%`;
}

/** Kotak lengkap untuk UI: persen efektif + label sumber dari server. */
export function buildInvoiceThresholdInfo(snapshotPercent: unknown): InvoiceThresholdInfo {
  return {
    percent: resolveInvoiceThresholdPercent(snapshotPercent),
    sourceLabel: invoiceThresholdSourceLabel(snapshotPercent),
  };
}
