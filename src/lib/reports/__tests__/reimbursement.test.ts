import { describe, it, expect } from "vitest"

import {
  deriveReimbursementStage,
  evaluateReimbursementApprovalSod,
  evaluateReimbursementApprovedAmount,
  evaluateReimbursementEvidence,
  evaluateReimbursementPaymentAmount,
  findReimbursementDuplicateCandidates,
} from "../reimbursement"

describe("deriveReimbursementStage (Q-RB-4 turunan)", () => {
  it("draft/pending = DIAJUKAN", () => {
    expect(deriveReimbursementStage({ status: "draft", hasPaymentJournal: false })).toBe("DIAJUKAN")
  })
  it("approved = DISETUJUI", () => {
    expect(deriveReimbursementStage({ status: "approved", hasPaymentJournal: false })).toBe("DISETUJUI")
  })
  it("paid TANPA jurnal bayar tetap DISETUJUI (status bukan bukti uang keluar)", () => {
    expect(deriveReimbursementStage({ status: "paid", hasPaymentJournal: false })).toBe("DISETUJUI")
  })
  it("paid + jurnal bayar = DIBAYAR", () => {
    expect(deriveReimbursementStage({ status: "paid", hasPaymentJournal: true })).toBe("DIBAYAR")
  })
  it("rejected = DITOLAK", () => {
    expect(deriveReimbursementStage({ status: "rejected", hasPaymentJournal: false })).toBe("DITOLAK")
  })
})

describe("evaluateReimbursementEvidence (BR-RB-04, AC-RB-B3)", () => {
  it("tanpa bukti dan tanpa referenceNo = MERAH", () => {
    expect(evaluateReimbursementEvidence({ referenceNo: null, receiptImage: null, attachmentCount: 0 }).ok).toBe(false)
  })
  it("bukti ada tapi referenceNo kosong = MERAH", () => {
    expect(evaluateReimbursementEvidence({ referenceNo: "  ", receiptImage: "/nota.jpg", attachmentCount: 0 }).ok).toBe(false)
  })
  it("lampiran tertaut + referenceNo = hijau", () => {
    expect(evaluateReimbursementEvidence({ referenceNo: "NOTA-1", receiptImage: null, attachmentCount: 1 }).ok).toBe(true)
  })
  it("receiptImage + referenceNo = hijau", () => {
    expect(evaluateReimbursementEvidence({ referenceNo: "NOTA-1", receiptImage: "/nota.jpg", attachmentCount: 0 }).ok).toBe(true)
  })
})

describe("evaluateReimbursementApprovalSod (BR-RB-07, AC-RB-B4)", () => {
  it("pengaju menyetujui sendiri = MERAH walau izin ada", () => {
    expect(evaluateReimbursementApprovalSod({ claimantEmployeeId: 5, approverEmployeeId: 5 }).ok).toBe(false)
  })
  it("penyetuju orang lain = hijau", () => {
    expect(evaluateReimbursementApprovalSod({ claimantEmployeeId: 5, approverEmployeeId: 9 }).ok).toBe(true)
  })
  it("penyetuju tanpa record karyawan (HR all-access) = hijau", () => {
    expect(evaluateReimbursementApprovalSod({ claimantEmployeeId: 5, approverEmployeeId: null }).ok).toBe(true)
  })
})

describe("findReimbursementDuplicateCandidates (BR-RB-10, AC-RB-B6)", () => {
  const base = { employeeId: 5, dateKey: "2026-10-25", amount: 150000, referenceNo: "NOTA-9" }
  const cand = (over: object = {}) => ({
    id: 1, documentNo: "EXP-1", employeeId: 5, dateKey: "2026-10-25",
    amount: 150000, referenceNo: "NOTA-9", status: "draft", ...over,
  })
  it("kandidat sama belum terminal terdeteksi", () => {
    expect(findReimbursementDuplicateCandidates(base, [cand()])).toHaveLength(1)
  })
  it("kandidat terminal (paid/rejected) bukan kandidat", () => {
    expect(findReimbursementDuplicateCandidates(base, [cand({ status: "paid" }), cand({ id: 2, status: "rejected" })])).toHaveLength(0)
  })
  it("referenceNo kosong tidak pernah kandidat", () => {
    expect(findReimbursementDuplicateCandidates({ ...base, referenceNo: null }, [cand()])).toHaveLength(0)
  })
  it("nominal/tanggal/pengaju beda bukan kandidat", () => {
    expect(findReimbursementDuplicateCandidates(base, [
      cand({ amount: 1 }), cand({ id: 2, dateKey: "2026-10-24" }), cand({ id: 3, employeeId: 6 }),
    ])).toHaveLength(0)
  })
})

describe("nominal (vonis 018-V Putusan 4, E-RB5-5)", () => {
  it("approve melebihi bukti = MERAH", () => {
    expect(evaluateReimbursementApprovedAmount({ submittedAmount: 200, evidencedAmount: 150 }).ok).toBe(false)
  })
  it("bayar melebihi akrual = MERAH; bayar sebagian hijau (sisa liabilitas)", () => {
    expect(evaluateReimbursementPaymentAmount({ accruedAmount: 150, paymentAmount: 200 }).ok).toBe(false)
    expect(evaluateReimbursementPaymentAmount({ accruedAmount: 150, paymentAmount: 100 }).ok).toBe(true)
  })
})
