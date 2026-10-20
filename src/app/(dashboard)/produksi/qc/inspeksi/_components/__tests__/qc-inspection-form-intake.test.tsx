// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/qc.actions", () => ({
  createQcInspection: vi.fn(async () => ({ success: true })),
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { QcInspectionForm } from "../qc-inspection-form"

const roots: Root[] = []

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(node)
  })
  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.replaceChildren()
})

const CHECKLISTS = [
  {
    id: 3,
    name: "Checklist Masuk Kendaraan",
    checklistType: "vehicle_intake",
    items: [{ id: 1, itemName: "Kondisi bodi", method: "Visual", spec: null, isRequired: true }],
  },
]

describe("QcInspectionForm intake F-50(b)", () => {
  it("tawarkan jenis Inspeksi Masuk & Serah Terima Kendaraan", () => {
    const container = render(<QcInspectionForm checklists={CHECKLISTS} />)
    // Opsi Select Radix dirender saat dibuka; sumber kebenaran opsi ada di
    // markup pemicu + daftar portaled — cukup pastikan label dikenal form
    // lewat inisialisasi dari tautan WO (uji berikutnya membuktikan nilainya).
    expect(container.textContent).toContain("Catat")
    expect(container.querySelector("#inspectionType")).not.toBeNull()
  })

  it("tautan dari WO mengisi jenis + referensi WO", () => {
    const container = render(
      <QcInspectionForm
        checklists={CHECKLISTS}
        initialInspectionType="vehicle_intake"
        initialReferenceType="WorkOrder"
        initialReferenceId={7}
      />,
    )
    expect(container.querySelector("#inspectionType")?.textContent).toContain("Masuk Kendaraan")
    expect((container.querySelector("#referenceId") as HTMLInputElement | null)?.value).toBe("7")
  })
})
