// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const createAction = vi.fn(
  async (_input: unknown): Promise<{ success: boolean; error?: string }> => ({ success: true }),
)
const showError = vi.fn()
const showSuccess = vi.fn()

vi.mock("@/actions/disciplinary.actions", () => ({
  createDisciplinaryRecord: (input: unknown) => createAction(input),
  submitDisciplinaryRecord: vi.fn(),
  approveDisciplinaryRecord: vi.fn(),
  rejectDisciplinaryRecord: vi.fn(),
  acknowledgeDisciplinaryRecord: vi.fn(),
  respondDisciplinaryRecord: vi.fn(),
  recordLateDisciplinaryResponse: vi.fn(),
  voidDisciplinaryRecord: vi.fn(),
}))
vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => showError(...(args as [])),
  showSuccess: (...args: unknown[]) => showSuccess(...(args as [])),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}))

import type { Root } from "react-dom/client"
import { act } from "react"

import { DisciplinaryRequestForm } from "../disciplinary-request-form"
import {
  renderCard,
  unmountCard,
  setFieldValue,
  stubPopoverDom,
  openComboboxOptions,
  pickComboboxOption,
} from "./card-test-utils"
import {
  DISCIPLINARY_SEVERE_CATEGORIES,
  DISCIPLINARY_GENERAL_CATEGORIES,
} from "@/lib/reports/disciplinary"

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

const LEVELS = [
  { value: "sp1", label: "Surat Peringatan 1 (SP1)" },
  { value: "sp2", label: "Surat Peringatan 2 (SP2)" },
  { value: "sp3", label: "Surat Peringatan 3 (SP3)" },
  { value: "sp_first_final", label: "SP Pertama dan Terakhir" },
]
const CATEGORIES = [...DISCIPLINARY_GENERAL_CATEGORIES, ...DISCIPLINARY_SEVERE_CATEGORIES]

function renderForm() {
  const { container, root } = renderCard(
    <DisciplinaryRequestForm
      employees={[{ id: 10, name: "Budi Santoso" }]}
      levels={LEVELS}
      categories={CATEGORIES}
    />,
  )
  roots.push(root)
  return container
}

function combo(container: HTMLElement, id: string) {
  const el = container.querySelector(`#${CSS.escape(id)}`)
  expect(el, `combobox #${id}`).toBeTruthy()
  return el!
}

describe("DisciplinaryRequestForm DISC-F1", () => {
  it("opsi SP pertama dan terakhir hanya tampil untuk kategori berat (AC-DISC-9)", () => {
    const container = renderForm()
    const catOptions = openComboboxOptions(combo(container, "violationCategory"))
    expect(catOptions).toContain("mangkir tanpa keterangan berulang")
    pickComboboxOption("mangkir tanpa keterangan berulang")
    const umumLevels = openComboboxOptions(combo(container, "level"))
    expect(umumLevels).not.toContain("SP Pertama dan Terakhir")
    expect(umumLevels).toContain("Surat Peringatan 1 (SP1)")

    openComboboxOptions(combo(container, "violationCategory"))
    pickComboboxOption("pelecehan seksual")
    const beratLevels = openComboboxOptions(combo(container, "level"))
    expect(beratLevels).toContain("SP Pertama dan Terakhir")
  })

  it("submit error server tampil verbatim; tanpa field gaji (AC-DISC-8)", async () => {
    createAction.mockResolvedValue({
      success: false,
      error: "Jenjang peringatan harus mengikuti urutan: usulan yang sah saat ini adalah Surat Peringatan 2 (SP2)",
    })
    const container = renderForm()
    expect((container.textContent ?? "").toLowerCase()).not.toContain("gaji")
    openComboboxOptions(combo(container, "employeeId"))
    pickComboboxOption("Budi Santoso")
    openComboboxOptions(combo(container, "violationCategory"))
    pickComboboxOption("mangkir tanpa keterangan berulang")
    setFieldValue(container, "#description", "Mangkir tiga hari")
    const form = container.querySelector("form")
    expect(form).toBeTruthy()
    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(createAction).toHaveBeenCalledTimes(1)
    expect(createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 10,
        description: "Mangkir tiga hari",
      }),
    )
    expect(showError).toHaveBeenCalledWith(
      "Jenjang peringatan harus mengikuti urutan: usulan yang sah saat ini adalah Surat Peringatan 2 (SP2)",
    )
    expect(showSuccess).not.toHaveBeenCalled()
  })
})
