/**
 * Klaim reimbursement karyawan (F-2026-10-25-017-S + vonis F-2026-10-25-018-V)
 * — builder murni, tanpa Prisma/aksi/izin.
 *
 * Klaim tahap 1 = Expense existing bertanda `isReimbursementClaim` dengan
 * `employeeId` pengaju (BR-RB-01). Bukan model kedua, bukan dokumen bayar
 * kedua. Aturan yang dibekukan di sini:
 * - BR-RB-04: bukti wajib sebelum approve (lampiran tertaut atau
 *   receiptImage, DAN referenceNo) — draft boleh tanpa bukti, approve tidak.
 * - BR-RB-07: SoD — pengaju tidak boleh menyetujui klaimnya sendiri.
 * - BR-RB-10: kandidat dobel = pengaju + tanggal + nominal + referenceNo
 *   sama pada klaim belum terminal → peringatan, bukan blokir diam.
 * - Putusan 2 vonis 018-V: jurnal dua tahap (J-RB1 akrual saat approve,
 *   J-RB2 saat bayar); tahap bayar TURUNAN dari fakta jurnal, bukan kolom.
 * - Putusan 4 vonis 018-V: nominal disetujui = min(diajukan, terbukti);
 *   bayar <= akrual. Tanpa pecah PPN (Putusan 5).
 * - BR-RB-12: tanpa plafon/batas hari/kategori karangan tahap 1.
 *
 * Q-RB-1/2/4/6 (gerbang Lead) belum tertulis di board saat inti ini dibuat;
 * default paling aman spec dipakai dan ditandai di PR untuk diratifikasi:
 * key izin khusus fail-closed, rantai ApprovalWorkflow existing apa adanya,
 * tahap DIBAYAR turunan, tanpa plafon.
 */

/* ------------------------------------------------------------------ */
/* Tahap klaim (turunan baca-saja, spec §3 — BUKAN kolom status baru)  */
/* ------------------------------------------------------------------ */

export const REIMBURSEMENT_STAGES = [
  "DIAJUKAN",
  "DISETUJUI",
  "DITOLAK",
  "DIBAYAR",
] as const
export type ReimbursementStage = (typeof REIMBURSEMENT_STAGES)[number]

export interface ReimbursementClaimLike {
  status: string
  /** Fakta J-RB2 (jurnal tahap bayar) sudah terposting. */
  hasPaymentJournal: boolean
}

/**
 * Tahap klaim dari status dokumen + fakta bayar existing (Q-RB-4 turunan).
 * `paid` tanpa jurnal bayar TIDAK dibaca DIBAYAR — status dokumen saja
 * bukan bukti uang keluar (vonis 018-V Putusan 2: pemisahan status).
 */
export function deriveReimbursementStage(
  claim: ReimbursementClaimLike,
): ReimbursementStage {
  if (claim.status === "rejected") return "DITOLAK"
  if (claim.status === "paid" && claim.hasPaymentJournal) return "DIBAYAR"
  if (claim.status === "approved" || claim.status === "paid") return "DISETUJUI"
  return "DIAJUKAN"
}

export const REIMBURSEMENT_STAGE_LABELS: Record<ReimbursementStage, string> = {
  DIAJUKAN: "Diajukan",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
  DIBAYAR: "Dibayar",
}

/* ------------------------------------------------------------------ */
/* Gerbang bukti BR-RB-04                                              */
/* ------------------------------------------------------------------ */

export interface ReimbursementEvidenceLike {
  referenceNo: string | null
  receiptImage: string | null
  attachmentCount: number
}

export type ReimbursementGuardResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Bukti wajib SEBELUM approve (BR-RB-04): minimal satu bukti tertaut
 * (lampiran transaksi atau receiptImage) DAN referenceNo terisi.
 * Draft pengaju boleh lahir tanpa bukti; gerbang ini hanya di titik approve.
 */
export function evaluateReimbursementEvidence(
  claim: ReimbursementEvidenceLike,
): ReimbursementGuardResult {
  const hasEvidence =
    claim.attachmentCount > 0 ||
    (typeof claim.receiptImage === "string" && claim.receiptImage.trim() !== "")
  if (!hasEvidence) {
    return {
      ok: false,
      error:
        "Klaim reimbursement tidak dapat disetujui: bukti pengeluaran belum tertaut. Lampirkan nota/bukti lebih dulu (BR-RB-04).",
    }
  }
  if (!claim.referenceNo || claim.referenceNo.trim() === "") {
    return {
      ok: false,
      error:
        "Klaim reimbursement tidak dapat disetujui: nomor nota (referenceNo) wajib terisi (BR-RB-04).",
    }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* SoD BR-RB-07                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pengaju tidak boleh menyetujui klaimnya sendiri dalam mode apa pun,
 * walau memegang approve_expenses. Perbandingan per Employee id
 * (bukan user id) — pola SoD disiplin BR-DISC-06.
 */
export function evaluateReimbursementApprovalSod(input: {
  claimantEmployeeId: number | null
  approverEmployeeId: number | null
}): ReimbursementGuardResult {
  if (
    input.claimantEmployeeId != null &&
    input.approverEmployeeId != null &&
    input.claimantEmployeeId === input.approverEmployeeId
  ) {
    return {
      ok: false,
      error:
        "Klaim reimbursement tidak dapat disetujui oleh pengaju sendiri (SoD BR-RB-07). Minta persetujuan keuangan/atasan lain.",
    }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Kandidat dobel BR-RB-10                                             */
/* ------------------------------------------------------------------ */

export interface ReimbursementDuplicateCandidateLike {
  id: number
  documentNo: string
  employeeId: number | null
  /** Tanggal pengeluaran sebagai kunci hari (yyyy-mm-dd WIB). */
  dateKey: string
  amount: number
  referenceNo: string | null
  status: string
}

const TERMINAL_STATUSES = new Set(["paid", "rejected"])

/**
 * Kandidat dobel (BR-RB-10): pengaju + tanggal + nominal + referenceNo
 * sama pada klaim BELUM terminal. Hasilnya peringatan berisik saat ajukan
 * (kandidat ditampilkan ke pemanggil), bukan blokir dan bukan lolos diam.
 * referenceNo kosong tidak pernah dianggap kandidat — kunci dobel butuh
 * nomor nota yang sama persis.
 */
export function findReimbursementDuplicateCandidates(
  input: {
    employeeId: number
    dateKey: string
    amount: number
    referenceNo: string | null
  },
  existing: readonly ReimbursementDuplicateCandidateLike[],
): ReimbursementDuplicateCandidateLike[] {
  const ref = input.referenceNo?.trim()
  if (!ref) return []
  return existing.filter(
    (c) =>
      c.employeeId === input.employeeId &&
      c.dateKey === input.dateKey &&
      c.amount === input.amount &&
      (c.referenceNo ?? "").trim() === ref &&
      !TERMINAL_STATUSES.has(c.status),
  )
}

/* ------------------------------------------------------------------ */
/* Nominal (vonis 018-V Putusan 4)                                     */
/* ------------------------------------------------------------------ */

/**
 * Nominal disetujui = min(diajukan, terbukti). Bukti tahap 1 = nominal
 * dokumen itu sendiri (satu klaim satu dokumen, EC-2 spec), jadi penjaga
 * ini menolak persetujuan dokumen yang nominalnya diubah melebihi yang
 * diajukan/dibuktikan — selisih lebih bukan reimbursement (BR-RB-05).
 */
export function evaluateReimbursementApprovedAmount(input: {
  submittedAmount: number
  evidencedAmount: number
}): ReimbursementGuardResult {
  if (!(input.submittedAmount > 0)) {
    return { ok: false, error: "Nominal klaim harus lebih dari 0." }
  }
  if (input.submittedAmount > input.evidencedAmount) {
    return {
      ok: false,
      error:
        "Nominal disetujui melebihi nominal bukti — selisih lebih bukan reimbursement (BR-RB-05/vonis 018-V Putusan 4). Koreksi nominal sebelum menyetujui.",
    }
  }
  return { ok: true }
}

/** Bayar (J-RB2) tidak boleh melebihi akrual (J-RB1). */
export function evaluateReimbursementPaymentAmount(input: {
  accruedAmount: number
  paymentAmount: number
}): ReimbursementGuardResult {
  if (!(input.paymentAmount > 0)) {
    return { ok: false, error: "Nominal bayar harus lebih dari 0." }
  }
  if (input.paymentAmount > input.accruedAmount) {
    return {
      ok: false,
      error:
        "Nominal bayar melebihi nominal akrual klaim (vonis 018-V Putusan 4). Bayar sebagian menyisakan liabilitas, tidak boleh melebihi.",
    }
  }
  return { ok: true }
}
