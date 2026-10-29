// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { TaxAssessmentForm } from "../tax-assessment-form"
import { TaxDisputeStepForm } from "../tax-dispute-step-form"
import { TaxDisputeDecisionForm } from "../tax-dispute-decision-form"
import { showSuccess, showError } from "@/lib/utils/toast"
import { createTaxAssessment, createTaxDisputeStep, recordTaxDisputeDecision } from "@/actions/tax-dispute.actions"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/tax-dispute.actions", () => ({
  createTaxAssessment: vi.fn().mockResolvedValue({ success: true }),
  createTaxDisputeStep: vi.fn().mockResolvedValue({ success: true }),
  recordTaxDisputeDecision: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

const mockedCreate = vi.mocked(createTaxAssessment)
const mockedStep = vi.mocked(createTaxDisputeStep)
const mockedDecision = vi.mocked(recordTaxDisputeDecision)
const mockedShowError = vi.mocked(showError)
const mockedShowSuccess = vi.mocked(showSuccess)

function mount(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function teardown(container: HTMLDivElement, root: Root) {
  act(() => root.unmount())
  container.remove()
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCreate.mockResolvedValue({ success: true })
  mockedStep.mockResolvedValue({ success: true })
  mockedDecision.mockResolvedValue({ success: true })
})

describe("tax-assessment-form — a11y + submit", () => {
  it("label terikat + idempotencyKey terkirim + sukses navigasi", async () => {
    const { container, root } = mount(<TaxAssessmentForm />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir daftar ketetapan pajak")
    expect(form.getAttribute("aria-busy")).toBe("false")
    const nomorLabel = Array.from(form.querySelectorAll("label")).find((l) =>
      l.textContent?.includes("Nomor Ketetapan"),
    )!
    expect(nomorLabel.getAttribute("for")).toBe("assessmentNumber")
    expect(container.querySelector("#assessmentNumber")).not.toBeNull()

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(mockedCreate).toHaveBeenCalledTimes(1)
    const fd = mockedCreate.mock.calls[0]![0] as FormData
    expect(fd.get("idempotencyKey")).toBeTruthy()
    expect(fd.get("kind")).toBeDefined()
    expect(mockedShowSuccess).toHaveBeenCalledWith("Ketetapan pajak tersimpan")
    teardown(container, root)
  })

  it("masa pajak taxPeriod terkirim (format YYYY-MM dari input month)", async () => {
    const { container, root } = mount(<TaxAssessmentForm />)
    const form = container.querySelector("form")!
    const period = container.querySelector<HTMLInputElement>("#taxPeriod")!
    await act(async () => {
      setValue(period, "2026-10")
    })
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    const fd = mockedCreate.mock.calls[0]![0] as FormData
    expect(fd.get("taxPeriod")).toBe("2026-10")
    teardown(container, root)
  })

  it("error service tampil verbatim (bukan fallback)", async () => {
    mockedCreate.mockResolvedValueOnce({ success: false, error: "Nominal disengketakan tidak boleh melebihi nominal ketetapan." })
    const { container, root } = mount(<TaxAssessmentForm />)
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(mockedShowError).toHaveBeenCalledWith(
      "Nominal disengketakan tidak boleh melebihi nominal ketetapan.",
    )
    teardown(container, root)
  })
})

describe("tax-dispute-step-form — sub-jenis Pasal 36 kondisional", () => {
  it("tanpa kind PENGURANGAN_PEMBATALAN tidak ada field sub-jenis; submit menyertakan assessmentId", async () => {
    const { container, root } = mount(<TaxDisputeStepForm assessmentId={7} />)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir ajukan upaya sengketa")
    expect(container.querySelector("#article36Subkind")).toBeNull()
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    const fd = mockedStep.mock.calls[0]![0] as FormData
    expect(fd.get("assessmentId")).toBe("7")
    expect(fd.get("idempotencyKey")).toBeTruthy()
    expect(mockedShowSuccess).toHaveBeenCalledWith("Upaya sengketa tersimpan")
    teardown(container, root)
  })

  it("sukses → form reset (alasan + referensi bukti kosong lagi)", async () => {
    const { container, root } = mount(<TaxDisputeStepForm assessmentId={7} />)
    const form = container.querySelector("form")!
    const late = container.querySelector<HTMLTextAreaElement>("#lateReason")!
    const evidence = container.querySelector<HTMLInputElement>("#evidenceRef")!
    await act(async () => {
      setValue(late, "force majeure banjir")
      setValue(evidence, "BKT-001")
    })
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(mockedShowSuccess).toHaveBeenCalledWith("Upaya sengketa tersimpan")
    expect(late.value).toBe("")
    expect(evidence.value).toBe("")
    teardown(container, root)
  })

  it("error lewat-tenggat service tampil verbatim", async () => {
    mockedStep.mockResolvedValueOnce({
      success: false,
      error: "Upaya melewati tenggat: alasan keadaan di luar kekuasaan wajib diisi.",
    })
    const { container, root } = mount(<TaxDisputeStepForm assessmentId={7} />)
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(mockedShowError).toHaveBeenCalledWith(
      "Upaya melewati tenggat: alasan keadaan di luar kekuasaan wajib diisi.",
    )
    teardown(container, root)
  })
})

describe("hint terikat aria-describedby", () => {
  it("setiap hint punya id dan dirujuk input terkait", () => {
    const a = mount(<TaxAssessmentForm />)
    expect(a.container.querySelector("#disputedAmount")?.getAttribute("aria-describedby")).toBe("disputedAmount-hint")
    expect(a.container.querySelector("#disputedAmount-hint")?.textContent).toContain("melebihi nominal ketetapan")
    teardown(a.container, a.root)

    const d = mount(<TaxDisputeDecisionForm steps={[]} />)
    expect(d.container.querySelector("#decidedAmount")?.getAttribute("aria-describedby")).toBe("decidedAmount-hint")
    expect(d.container.querySelector("#decidedAmount-hint")?.textContent).toContain("melebihi nominal disengketakan")
    teardown(d.container, d.root)

    const s = mount(<TaxDisputeStepForm assessmentId={7} />)
    expect(s.container.querySelector("#lateReason")?.getAttribute("aria-describedby")).toBe("lateReason-hint")
    expect(s.container.querySelector("#lateReason-hint")?.textContent).toContain("di luar kekuasaan")
    teardown(s.container, s.root)
  })
})

describe("tax-dispute-decision-form — reset sesudah sukses", () => {
  it("sukses → catatan putusan kosong lagi", async () => {
    const { container, root } = mount(
      <TaxDisputeDecisionForm steps={[{ value: "3", label: "Keberatan" }]} />,
    )
    const form = container.querySelector("form")!
    const notes = container.querySelector<HTMLTextAreaElement>("#decisionNotes")!
    await act(async () => {
      setValue(notes, "catatan putusan awal")
    })
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(mockedShowSuccess).toHaveBeenCalledWith("Putusan sengketa tercatat")
    expect(notes.value).toBe("")
    teardown(container, root)
  })
})

describe("tax-dispute-decision-form — kunci decidedAtInput + empat mata", () => {
  it("submit memakai kunci decidedAtInput; error empat mata verbatim", async () => {
    mockedDecision.mockResolvedValueOnce({
      success: false,
      error: "Empat mata: perekam putusan harus berbeda dari pengaju upaya.",
    })
    const { container, root } = mount(
      <TaxDisputeDecisionForm steps={[{ value: "3", label: "Keberatan" }]} />,
    )
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir catat putusan sengketa")
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    const fd = mockedDecision.mock.calls[0]![0] as FormData
    expect(fd.get("decidedAtInput")).toBeTruthy()
    expect(fd.has("decidedAt")).toBe(false)
    expect(mockedShowError).toHaveBeenCalledWith(
      "Empat mata: perekam putusan harus berbeda dari pengaju upaya.",
    )
    teardown(container, root)
  })
})
