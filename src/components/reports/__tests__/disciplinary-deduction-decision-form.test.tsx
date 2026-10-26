// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// vi.hoisted: blok mock didefinisikan di factory supaya tidak byte-identik
// dengan tes form sibling (gerbang duplikasi Sonar).
const h = vi.hoisted(() => ({
  createAction: vi.fn(
    async (_input: unknown): Promise<{ success: boolean; error?: string }> => ({ success: true }),
  ),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  push: vi.fn(),
}))
const { createAction, showError, showSuccess, push } = h

vi.mock("@/actions/disciplinary-deduction.actions", () => ({
  createDisciplinaryDeductionDecisionAction: (input: unknown) => h.createAction(input),
}))
vi.mock("@/lib/utils/toast", () => ({
  showError: h.showError,
  showSuccess: h.showSuccess,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: h.push, back: vi.fn() }),
}))

import type { Root } from "react-dom/client"
import { act } from "react"

import { DisciplinaryDeductionDecisionForm } from "../disciplinary-deduction-decision-form"
import {
  renderCard,
  unmountCard,
  setFieldValue,
  stubPopoverDom,
  openComboboxOptions,
  pickComboboxOption,
} from "./card-test-utils"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => unmountCard(r))
  roots = []
  document.body.replaceChildren()
  vi.clearAllMocks()
})
beforeEach(() => {
  stubPopoverDom()
  createAction.mockResolvedValue({ success: true })
})

const EMPLOYEES = [
  { id: 10, name: "Budi Santoso" },
  { id: 20, name: "Sari Wulandari" },
]
const RECORDS = [
  { id: 5, employeeId: 10, documentNo: "SP/2026/001", label: "SP/2026/001 — Budi Santoso (sp1)" },
  { id: 6, employeeId: 20, documentNo: "SP/2026/002", label: "SP/2026/002 — Sari Wulandari (sp2)" },
]
const ACCOUNTS = [
  { id: 31, code: "510099", name: "Kompensasi Lain" },
  { id: 32, code: "710006", name: "Pendapatan Denda Karyawan" },
]

function renderForm() {
  const { container, root } = renderCard(
    <DisciplinaryDeductionDecisionForm employees={EMPLOYEES} records={RECORDS} accounts={ACCOUNTS} />,
  )
  roots.push(root)
  return container
}

function combo(container: HTMLElement, id: string) {
  const el = container.querySelector(`#${CSS.escape(id)}`)
  expect(el, `combobox #${id}`).toBeTruthy()
  return el!
}

async function submit(container: HTMLElement) {
  const form = container.querySelector("form")
  expect(form).toBeTruthy()
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

describe("DisciplinaryDeductionDecisionForm BR-DISC-09", () => {
  it("konteks SP hanya memuat SP milik karyawan terpilih", () => {
    const container = renderForm()
    openComboboxOptions(combo(container, "employeeId"))
    pickComboboxOption("Budi Santoso")
    const options = openComboboxOptions(combo(container, "disciplinaryRecordId"))
    expect(options).toContain("SP/2026/001 — Budi Santoso (sp1)")
    expect(options).not.toContain("SP/2026/002 — Sari Wulandari (sp2)")
  })

  it("submit sukses mengirim kontrak action apa adanya dan menavigasi ke daftar", async () => {
    const container = renderForm()
    setFieldValue(container, "#documentNo", "KEP/HRD/2026/010")
    openComboboxOptions(combo(container, "employeeId"))
    pickComboboxOption("Budi Santoso")
    openComboboxOptions(combo(container, "disciplinaryRecordId"))
    pickComboboxOption("SP/2026/001 — Budi Santoso (sp1)")
    openComboboxOptions(combo(container, "kind"))
    pickComboboxOption("Ganti Rugi")
    setFieldValue(container, "#amount", "250000")
    openComboboxOptions(combo(container, "compensationAccountId"))
    pickComboboxOption("510099 — Kompensasi Lain")
    openComboboxOptions(combo(container, "signedBy"))
    pickComboboxOption("Sari Wulandari")
    await submit(container)
    expect(createAction).toHaveBeenCalledTimes(1)
    expect(createAction).toHaveBeenCalledWith({
      documentNo: "KEP/HRD/2026/010",
      decidedAt: "",
      employeeId: 10,
      disciplinaryRecordId: 5,
      kind: "ganti_rugi",
      amount: 250000,
      compensationAccountId: 31,
      suspensionKind: null,
      suspensionPayTreatment: null,
      regulationReference: null,
      signedBy: 20,
    })
    expect(showSuccess).toHaveBeenCalledWith("Dokumen keputusan potongan disiplin tersimpan")
    expect(push).toHaveBeenCalledWith("/sdm/disiplin")
  })

  it("error guard service tampil verbatim tanpa fallback statis", async () => {
    createAction.mockResolvedValue({
      success: false,
      error: "Keputusan ganti rugi wajib menyebut akun kompensasi terkait dokumennya (bukan 710006).",
    })
    const container = renderForm()
    setFieldValue(container, "#documentNo", "KEP/HRD/2026/011")
    openComboboxOptions(combo(container, "employeeId"))
    pickComboboxOption("Budi Santoso")
    openComboboxOptions(combo(container, "kind"))
    pickComboboxOption("Ganti Rugi")
    setFieldValue(container, "#amount", "100000")
    openComboboxOptions(combo(container, "signedBy"))
    pickComboboxOption("Sari Wulandari")
    await submit(container)
    expect(createAction).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith(
      "Keputusan ganti rugi wajib menyebut akun kompensasi terkait dokumennya (bukan 710006).",
    )
    expect(showSuccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
