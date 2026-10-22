/**
 * Turunan status rute jurnal garansi tahap 3 (E2/E3, rute provisi MATI).
 *
 * ponytail: literal referenceType disalin dari WARRANTY_CLAIM_COST_REF /
 * WARRANTY_SUPPLIER_RECOVERY_REF di warranty-journal.service.ts — service
 * itu menarik Prisma (node:fs) dan TIDAK boleh diimpor dari client
 * component; ubah literal di service wajib samakan di sini.
 *
 * SUMBER SATU-SATUNYA = baris Journal nyata untuk klaim ini — BUKAN flag
 * status klaim. Rute SUDAH DIPOSTING hanya bila ada jurnal POSTED
 * non-REVERSED dengan referenceType rute itu + referenceId = claimId
 * (unik di schema, jadi maksimal 1 baris per rute). Jurnal REVERSED tidak
 * dihitung sebagai sudah diposting; tampilkan riwayat reversal apa adanya
 * (label "dibalik — lihat jurnal lawan"), jangan hapus dari tampilan.
 * Jurnal lawan (reversal) lahir sebagai Journal referenceType "Journal"
 * dengan referenceId = id jurnal asli dan tanggal sama dengan aslinya.
 * Murni — tanpa DB — supaya teruji unit tanpa Prisma.
 */

export interface WarrantyJournalRow {
  id: number
  journalNumber: string | null
  transactionDate: string
  status: string
  /** Format rupiah siap tampil dari server (formatCurrency). */
  totalDebitLabel: string
  referenceType: string | null
  referenceId: number | null
}

export interface WarrantyJournalReversal {
  journalNumber: string | null
  transactionDate: string
}

export interface WarrantyJournalRoute {
  refType: string
  posted: boolean
  journalNumber: string | null
  transactionDate: string | null
  /** Rupiah jurnal POSTED dari server; null bila belum diposting. */
  amountLabel: string | null
  /** Jurnal asli yang berstatus REVERSED, bila ada. */
  reversed: { journalNumber: string | null; transactionDate: string } | null
  /** Jurnal lawan (reversal) untuk jurnal asli yang dibalik, bila ada. */
  reversal: WarrantyJournalReversal | null
}

export interface WarrantyJournalRoutes {
  claimCost: WarrantyJournalRoute
  supplierRecovery: WarrantyJournalRoute
}

function buildRoute(rows: WarrantyJournalRow[], refType: string): WarrantyJournalRoute {
  const routeRows = rows.filter((r) => r.referenceType === refType)
  const postedRow = routeRows.find((r) => r.status === "POSTED") ?? null
  const reversedRow = routeRows.find((r) => r.status === "REVERSED") ?? null
  const reversalRow = reversedRow
    ? (rows.find((r) => r.referenceType === "Journal" && r.referenceId === reversedRow.id) ?? null)
    : null
  return {
    refType,
    posted: postedRow !== null,
    journalNumber: postedRow?.journalNumber ?? null,
    transactionDate: postedRow?.transactionDate ?? null,
    amountLabel: postedRow?.totalDebitLabel ?? null,
    reversed: reversedRow
      ? { journalNumber: reversedRow.journalNumber, transactionDate: reversedRow.transactionDate }
      : null,
    reversal: reversalRow
      ? { journalNumber: reversalRow.journalNumber, transactionDate: reversalRow.transactionDate }
      : null,
  }
}

export function warrantyJournalRoutes(rows: WarrantyJournalRow[]): WarrantyJournalRoutes {
  return {
    // Literal sama dengan WARRANTY_CLAIM_COST_REF / WARRANTY_SUPPLIER_RECOVERY_REF
    // di warranty-journal.service.ts (tidak diimpor: service menarik Prisma).
    claimCost: buildRoute(rows, "WarrantyClaimCost"),
    supplierRecovery: buildRoute(rows, "WarrantySupplierRecovery"),
  }
}

/** Prasyarat render tombol E2 (spec §3): status + keputusan tercatat + WO repair. */
export function canPostWarrantyClaimCost(facts: {
  status: string
  decisionRecorded: boolean
  repairWorkOrderId: number | null
}): boolean {
  return (
    ["approved", "in_repair", "closed"].includes(facts.status) &&
    facts.decisionRecorded &&
    facts.repairWorkOrderId !== null
  )
}

/** Prasyarat render form E3 (spec §3): status supplier + WO repair tertaut. */
export function canPostWarrantySupplierRecovery(facts: {
  supplierClaimStatus: string
  repairWorkOrderId: number | null
}): boolean {
  return (
    ["accepted", "closed_recovered"].includes(facts.supplierClaimStatus) &&
    facts.repairWorkOrderId !== null
  )
}
