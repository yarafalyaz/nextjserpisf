import { describe, it, expect } from "vitest"

import {
  classifyNpwp,
  deriveSnapshotMarkers,
  deriveTaxIdentityCompleteness,
  evaluateTaxInvoiceIssueGate,
  isValidNitkuShape,
  nitkuLink,
  normalizeNpwp,
  snapshotCounterpartyFromMaster,
  validateMasterTaxIdentity,
} from "@/lib/tax/customer-tax-identity"
import { pickTransactionCode } from "@/lib/tax/tax-invoice"

const NPWP16 = "0123456789123456"
const NITKU_LINKED = `${NPWP16}000000`

describe("F-2026-10-25-019-V §7.2 NPWP bentuk", () => {
  it("16 digit kanonik; format tampilan ternormalisasi digit saja", () => {
    expect(classifyNpwp("01.234.567.89-123.456")).toBe("canonical16")
    expect(normalizeNpwp("01.234.567.89-123.456")).toBe(NPWP16)
  })
  it("15 digit = legacy15 tertanda + peringatan, bukan lolos diam", () => {
    const v = validateMasterTaxIdentity({ taxId: "123456789012345" })
    expect(v.ok).toBe(true)
    expect(v.npwpFormat).toBe("legacy15")
    expect(v.warnings.join(" ")).toContain("NPWP 15 digit")
  })
  it("14/17 digit atau berhuruf = tolak simpan master", () => {
    expect(validateMasterTaxIdentity({ taxId: "12345678901234" }).ok).toBe(false)
    expect(validateMasterTaxIdentity({ taxId: "12345678901234567" }).ok).toBe(false)
    expect(validateMasterTaxIdentity({ taxId: "12345678901234AB" }).ok).toBe(false)
  })
  it("sistem TIDAK mengkonversi 15→16 dengan awalan 0", () => {
    expect(normalizeNpwp("123456789012345")).toBe("123456789012345")
  })
  it("kosong penuh = absent, sah opsional", () => {
    expect(classifyNpwp("")).toBe("absent")
    expect(classifyNpwp(null)).toBe("absent")
    expect(validateMasterTaxIdentity({}).ok).toBe(true)
  })
})

describe("F-2026-10-25-019-V §7.3 NITKU", () => {
  it("21/23 digit tolak; 22 digit sah", () => {
    expect(isValidNitkuShape("1".repeat(21))).toBe(false)
    expect(isValidNitkuShape("1".repeat(23))).toBe(false)
    expect(isValidNitkuShape(NITKU_LINKED)).toBe(true)
    expect(validateMasterTaxIdentity({ nitku: "1".repeat(21) }).ok).toBe(false)
  })
  it("awalan sama NPWP 16 = linked; beda = mismatch; NPWP 15 = unlinked (tanpa tebak 0)", () => {
    expect(nitkuLink({ taxId: NPWP16, nitku: NITKU_LINKED })).toBe("linked")
    expect(nitkuLink({ taxId: NPWP16, nitku: `${"9".repeat(16)}000001` })).toBe("mismatch")
    expect(nitkuLink({ taxId: "123456789012345", nitku: NITKU_LINKED })).toBe("unlinked")
    expect(nitkuLink({ taxId: NPWP16 })).toBe("absent")
  })
})

describe("F-2026-10-25-019-V §7.5 EC-3 + gerbang terbit §5", () => {
  it("nama kosong + NPWP terisi → TOLAK, fallback nama dagang tidak meloloskan", () => {
    const snap = snapshotCounterpartyFromMaster({ taxId: NPWP16, taxpayerName: null })
    expect(snap.counterpartyName).toBeNull()
    expect(evaluateTaxInvoiceIssueGate(snap).allowed).toBe(false)
  })
  it("nama diisi operator di form terbit → snapshot = isian itu byte-sama", () => {
    const snap = snapshotCounterpartyFromMaster({ taxId: NPWP16 }, { counterpartyName: "PT Lawan Sebenarnya" })
    expect(snap.counterpartyName).toBe("PT Lawan Sebenarnya")
    expect(evaluateTaxInvoiceIssueGate(snap).allowed).toBe(true)
  })
  it("NPWP kosong / bentuk cacat → tolak; 15 digit tanpa konfirmasi → tolak, dengan konfirmasi → lolos bertanda", () => {
    expect(evaluateTaxInvoiceIssueGate({ counterpartyName: "PT X" }).allowed).toBe(false)
    expect(evaluateTaxInvoiceIssueGate({ counterpartyName: "PT X", counterpartyTaxId: "123" }).allowed).toBe(false)
    const legacy = { counterpartyName: "PT X", counterpartyTaxId: "123456789012345" }
    expect(evaluateTaxInvoiceIssueGate(legacy).allowed).toBe(false)
    const ok = evaluateTaxInvoiceIssueGate(legacy, { legacy15Confirmed: true })
    expect(ok.allowed).toBe(true)
    if (ok.allowed) expect(ok.warnings.join(" ")).toContain("15 digit")
  })
  it("NITKU cacat → tolak; NITKU absen → lolos bertanda nitkuAbsent", () => {
    const base = { counterpartyName: "PT X", counterpartyTaxId: NPWP16 }
    expect(evaluateTaxInvoiceIssueGate({ ...base, counterpartyNitku: "123" }).allowed).toBe(false)
    const ok = evaluateTaxInvoiceIssueGate(base)
    expect(ok.allowed).toBe(true)
    if (ok.allowed) expect(ok.warnings.join(" ")).toContain("nitkuAbsent")
  })
  it("NITKU 22 digit awalan beda NPWP 16 (mismatch) → tolak terbit (probe QA PR #834)", () => {
    const res = evaluateTaxInvoiceIssueGate({
      counterpartyName: "PT X",
      counterpartyTaxId: NPWP16,
      counterpartyNitku: "9999999999999999000001",
    })
    expect(res.allowed).toBe(false)
    if (!res.allowed) expect(res.error).toContain("NITKU")
  })
  it("NITKU tertaut awalan sama → lolos; legacy15 + NITKU sah-bentuk bukan mismatch → lolos bertanda (§8A)", () => {
    const linked = evaluateTaxInvoiceIssueGate({
      counterpartyName: "PT X",
      counterpartyTaxId: NPWP16,
      counterpartyNitku: NITKU_LINKED,
    })
    expect(linked.allowed).toBe(true)
    const legacy = evaluateTaxInvoiceIssueGate(
      { counterpartyName: "PT X", counterpartyTaxId: "123456789012345", counterpartyNitku: "9999999999999999000001" },
      { legacy15Confirmed: true },
    )
    expect(legacy.allowed).toBe(true)
    if (legacy.allowed) expect(legacy.warnings.join(" ")).toContain("15 digit")
  })
  it("tanpa pengecualian ritel karangan — identitas absen tetap tolak (putusan Lead §8A-5)", () => {
    expect(evaluateTaxInvoiceIssueGate({}).allowed).toBe(false)
  })
})

describe("F-2026-10-25-019-V §7.4/§7.6 snapshot + PKP tidak menurunkan kode", () => {
  it("snapshot byte-sama master saat salin; penanda diturunkan dari nilai beku", () => {
    const snap = snapshotCounterpartyFromMaster({ taxId: "123456789012345", taxpayerName: "PT WP", nitku: null })
    expect(snap).toEqual({ counterpartyTaxId: "123456789012345", counterpartyName: "PT WP", counterpartyNitku: null })
    expect(deriveSnapshotMarkers(snap)).toMatchObject({ legacy15: true, nitkuAbsent: true })
    // Edit master sesudahnya tidak menyentuh objek snapshot (beku by-value).
    expect(deriveSnapshotMarkers({ ...snap, counterpartyTaxId: NPWP16 }).legacy15).toBe(false)
  })
  it("pkpStatus tidak masuk penentu kode — default tetap 04 untuk semua status", () => {
    // pickTransactionCode tidak menerima pkpStatus sama sekali (vonis §4/§5e).
    expect(pickTransactionCode({})).toBe("04")
    expect(pickTransactionCode({ otherValueBasis: true })).toBe("04")
  })
})

describe("F-2026-10-25-019-V §8A-3 penanda nitkuUnlinked dokumen", () => {
  it("legacy15 + NITKU sah-bentuk → nitkuUnlinked=true, nitkuAbsent=false", () => {
    expect(
      deriveSnapshotMarkers({ counterpartyTaxId: "123456789012345", counterpartyNitku: "9999999999999999000001" }),
    ).toEqual({ npwpFormat: "legacy15", legacy15: true, nitkuAbsent: false, nitkuUnlinked: true })
  })
  it("NPWP 16 + NITKU tertaut → nitkuUnlinked=false; NITKU absen → nitkuUnlinked=false + nitkuAbsent=true", () => {
    expect(deriveSnapshotMarkers({ counterpartyTaxId: NPWP16, counterpartyNitku: NITKU_LINKED }).nitkuUnlinked).toBe(false)
    expect(deriveSnapshotMarkers({ counterpartyTaxId: NPWP16, counterpartyNitku: null })).toEqual({
      npwpFormat: "canonical16",
      legacy15: false,
      nitkuAbsent: true,
      nitkuUnlinked: false,
    })
  })
  it("NITKU cacat bentuk → bukan unlinked (cacat, bukan belum-tertaut); NPWP kosong + NITKU sah → unlinked", () => {
    expect(
      deriveSnapshotMarkers({ counterpartyTaxId: "123456789012345", counterpartyNitku: "123" }).nitkuUnlinked,
    ).toBe(false)
    expect(deriveSnapshotMarkers({ counterpartyTaxId: null, counterpartyNitku: NITKU_LINKED }).nitkuUnlinked).toBe(true)
  })
})

describe("AC-TX-B4 penanda kelengkapan (BR-TX-08)", () => {
  it("nama WP kosong → kurang menyebut nama WP; NPWP kosong → menyebut NPWP; lengkap → siap", () => {
    expect(deriveTaxIdentityCompleteness({ taxId: NPWP16 }).missing).toContain("nama wajib pajak")
    expect(deriveTaxIdentityCompleteness({ taxpayerName: "PT WP" }).missing).toContain("NPWP")
    expect(deriveTaxIdentityCompleteness({ taxpayerName: "PT WP", taxId: NPWP16 }).ready).toBe(true)
  })
  it("fallback nama dagang tertanda, bukan dianggap nama WP", () => {
    const c = deriveTaxIdentityCompleteness({ taxId: NPWP16, tradeName: "Bengkel Jaya" })
    expect(c.ready).toBe(false)
    expect(c.usesTradeNameFallback).toBe(true)
  })
})
