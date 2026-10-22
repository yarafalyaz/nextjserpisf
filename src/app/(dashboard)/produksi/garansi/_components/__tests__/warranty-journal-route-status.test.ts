import { describe, it, expect } from "vitest"

import {
  canPostWarrantyClaimCost,
  canPostWarrantySupplierRecovery,
  warrantyJournalRoutes,
  type WarrantyJournalRow,
} from "../warranty-journal-route-status"

const row = (over: Partial<WarrantyJournalRow> = {}): WarrantyJournalRow => ({
  id: 1,
  journalNumber: "JRN-0001",
  transactionDate: "22 Oktober 2026",
  status: "POSTED",
  totalDebitLabel: "Rp 1.500.000",
  referenceType: "WarrantyClaimCost",
  referenceId: 5,
  ...over,
})

describe("warrantyJournalRoutes — status dari jurnal nyata, bukan flag klaim", () => {
  it("tanpa jurnal: kedua rute BELUM DIPOSTING", () => {
    const r = warrantyJournalRoutes([])
    expect(r.claimCost.posted).toBe(false)
    expect(r.supplierRecovery.posted).toBe(false)
    expect(r.claimCost.amountLabel).toBeNull()
  })

  it("jurnal POSTED E2: SUDAH DIPOSTING + nomor + tanggal + nominal server", () => {
    const r = warrantyJournalRoutes([row()])
    expect(r.claimCost.posted).toBe(true)
    expect(r.claimCost.journalNumber).toBe("JRN-0001")
    expect(r.claimCost.transactionDate).toBe("22 Oktober 2026")
    expect(r.claimCost.amountLabel).toBe("Rp 1.500.000")
    expect(r.supplierRecovery.posted).toBe(false)
  })

  it("jurnal REVERSED: rute kembali BELUM DIPOSTING, reversal tampil apa adanya", () => {
    const r = warrantyJournalRoutes([
      row({ id: 9, status: "REVERSED", journalNumber: "JRN-0009" }),
      row({
        id: 10,
        referenceType: "Journal",
        referenceId: 9,
        journalNumber: "JRN-0010",
        transactionDate: "22 Oktober 2026",
      }),
    ])
    expect(r.claimCost.posted).toBe(false)
    expect(r.claimCost.reversed?.journalNumber).toBe("JRN-0009")
    expect(r.claimCost.reversal?.journalNumber).toBe("JRN-0010")
  })

  it("jurnal DRAFT tidak dihitung sebagai sudah diposting", () => {
    const r = warrantyJournalRoutes([row({ status: "DRAFT" })])
    expect(r.claimCost.posted).toBe(false)
  })

  it("rute E3 terpisah dari E2", () => {
    const r = warrantyJournalRoutes([
      row({ referenceType: "WarrantySupplierRecovery", journalNumber: "JRN-0002" }),
    ])
    expect(r.claimCost.posted).toBe(false)
    expect(r.supplierRecovery.posted).toBe(true)
    expect(r.supplierRecovery.journalNumber).toBe("JRN-0002")
  })
})

describe("prasyarat render kontrol posting (spec §3)", () => {
  it("E2: approved/in_repair/closed + keputusan + WO repair", () => {
    expect(
      canPostWarrantyClaimCost({ status: "approved", decisionRecorded: true, repairWorkOrderId: 7 }),
    ).toBe(true)
    expect(
      canPostWarrantyClaimCost({ status: "eligibility", decisionRecorded: false, repairWorkOrderId: 7 }),
    ).toBe(false)
    expect(
      canPostWarrantyClaimCost({ status: "closed", decisionRecorded: true, repairWorkOrderId: null }),
    ).toBe(false)
    expect(
      canPostWarrantyClaimCost({ status: "rejected", decisionRecorded: true, repairWorkOrderId: 7 }),
    ).toBe(false)
  })

  it("E3: hanya accepted/closed_recovered + WO repair", () => {
    expect(
      canPostWarrantySupplierRecovery({ supplierClaimStatus: "accepted", repairWorkOrderId: 7 }),
    ).toBe(true)
    expect(
      canPostWarrantySupplierRecovery({ supplierClaimStatus: "closed_recovered", repairWorkOrderId: 7 }),
    ).toBe(true)
    expect(
      canPostWarrantySupplierRecovery({ supplierClaimStatus: "sent", repairWorkOrderId: 7 }),
    ).toBe(false)
    expect(
      canPostWarrantySupplierRecovery({ supplierClaimStatus: "accepted", repairWorkOrderId: null }),
    ).toBe(false)
  })
})
