/** `BankStatementLine.type` → label tampilan (arah mutasi). */
export const BANK_STATEMENT_LINE_TYPE_LABELS: Record<string, string> = {
  debit: "Debit",
  credit: "Kredit",
}

/** Label arah mutasi; nilai tak dikenal dikembalikan apa adanya. */
export function bankStatementLineTypeLabel(type: string): string {
  return BANK_STATEMENT_LINE_TYPE_LABELS[type] ?? type
}
