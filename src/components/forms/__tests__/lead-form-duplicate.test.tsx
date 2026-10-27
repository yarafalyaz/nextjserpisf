// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot } from "react-dom/client"
import { act } from "react"
import { LeadForm } from "../lead-form"
import { showError, showSuccess } from "@/lib/utils/toast"
import { setFieldValue } from "./form-a11y-test-utils"

const createLeadMock = vi.fn()
const updateLeadMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/actions/master.actions", () => ({
  createLead: (...args: unknown[]) => createLeadMock(...args),
  updateLead: (...args: unknown[]) => updateLeadMock(...args),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

const warning = {
  title: "Kemungkinan lead duplikat",
  body: "Kontak ini cocok dengan lead yang sudah ada. Periksa dulu — membuat ganda membagi tindak lanjut antar sales.",
  candidates: [
    {
      id: 7,
      leadNumber: "LEAD-0007",
      slug: "budi-santoso",
      name: "Budi Santoso",
      company: "PT Maju",
      status: "new",
      isConverted: false,
      isLost: false,
      assignedTo: 2,
      assignedToName: "Sari Sales",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      matchKind: "phone",
      matchLabel: "Nomor telepon sama",
      phone: "••90",
      email: "•••@maju.id",
      canOpen: true,
    },
    {
      id: 8,
      leadNumber: "LEAD-0008",
      slug: "andi-wijaya",
      name: "Andi Wijaya",
      company: null,
      status: "won",
      isConverted: true,
      isLost: false,
      assignedTo: null,
      assignedToName: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      matchKind: "email",
      matchLabel: "Sudah dikonversi menjadi pelanggan",
      phone: null,
      email: "•••@wijaya.id",
      canOpen: false,
    },
  ],
  lostCandidates: [
    {
      id: 9,
      leadNumber: "LEAD-0009",
      slug: "cici",
      name: "Cici",
      company: null,
      status: "lost",
      isConverted: false,
      isLost: true,
      assignedTo: null,
      assignedToName: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      matchKind: "email",
      matchLabel: "Email sama",
      phone: null,
      email: "•••@cici.id",
      canOpen: false,
    },
  ],
  requiresReason: true,
  minReasonLength: 10,
}

function mountForm() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<LeadForm />)
  })
  return { container, root }
}

function submitForm(container: HTMLElement) {
  act(() => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    )
  })
}

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  )!
}

describe("LeadForm — panel duplikat DUP-F1", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createLeadMock.mockResolvedValue({
      success: false,
      duplicateWarning: warning,
      error: "Alasan tetap membuat lead baru wajib diisi.",
    })
  })

  it("peringatan tampil verbatim + kandidat termask + input tidak reset; canOpen=false tanpa tautan", async () => {
    const { container, root } = mountForm()
    act(() => setFieldValue(container.querySelector<HTMLInputElement>("#name")!, "Budi Baru"))
    act(() => setFieldValue(container.querySelector<HTMLInputElement>("#phone")!, "081234567890"))
    submitForm(container)
    await act(async () => {})
    await act(async () => {})

    expect(container.textContent).toContain("Kemungkinan lead duplikat")
    expect(container.textContent).toContain(
      "Kontak ini cocok dengan lead yang sudah ada. Periksa dulu — membuat ganda membagi tindak lanjut antar sales.",
    )
    expect(container.textContent).toContain("LEAD-0007 — Budi Santoso (PT Maju)")
    expect(container.textContent).toContain("Status: Baru · Pemilik: Sari Sales · Nomor telepon sama")
    expect(container.textContent).toContain("••90")
    expect(container.textContent).toContain("•••@maju.id")
    expect(container.textContent).toContain("Sudah dikonversi menjadi pelanggan")
    expect(container.textContent).toContain("Lead lama berstatus lost — bukan duplikat aktif")
    expect(container.textContent).toContain("Alasan tetap membuat lead baru (wajib, tercatat)")

    const links = Array.from(container.querySelectorAll("a")).filter(
      (a) => a.textContent?.trim() === "Buka lead existing",
    )
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute("href")).toBe("/crm/leads/budi-santoso")

    // Input user dipertahankan sesudah panel tampil (jangan reset).
    expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe("Budi Baru")
    expect(container.querySelector<HTMLInputElement>("#phone")!.value).toBe("081234567890")
    expect(showError).not.toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()
  })

  it("alasan kosong/pendek ditolak UI; alasan sah dikirim sebagai duplicateOverrideReason", async () => {
    const { container, root } = mountForm()
    act(() => setFieldValue(container.querySelector<HTMLInputElement>("#name")!, "Budi Baru"))
    submitForm(container)
    await act(async () => {})
    await act(async () => {})
    expect(container.querySelector("#duplicateOverrideReason")).not.toBeNull()

    // Kosong -> error lokal, action tidak dipanggil ulang.
    createLeadMock.mockClear()
    act(() => {
      findButton(container, "Tetap buat lead baru").click()
    })
    expect(createLeadMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Alasan tetap membuat lead baru wajib diisi.")

    // Pendek (<10) -> error minimal.
    act(() =>
      setFieldValue(container.querySelector<HTMLTextAreaElement>("#duplicateOverrideReason")!, "singkat"),
    )
    act(() => {
      findButton(container, "Tetap buat lead baru").click()
    })
    expect(createLeadMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Alasan tetap membuat lead baru minimal 10 karakter.")

    // Sah -> submit ulang membawa alasan + input form utuh.
    createLeadMock.mockResolvedValue({ success: true })
    act(() =>
      setFieldValue(
        container.querySelector<HTMLTextAreaElement>("#duplicateOverrideReason")!,
        "Nomor sentral perusahaan, kontak orang berbeda",
      ),
    )
    act(() => {
      findButton(container, "Tetap buat lead baru").click()
    })
    await act(async () => {})
    await act(async () => {})
    expect(createLeadMock).toHaveBeenCalledTimes(1)
    const formData = createLeadMock.mock.calls[0][0] as FormData
    expect(formData.get("duplicateOverrideReason")).toBe(
      "Nomor sentral perusahaan, kontak orang berbeda",
    )
    expect(formData.get("name")).toBe("Budi Baru")
    expect(showSuccess).toHaveBeenCalled()
    act(() => root.unmount())
    container.remove()
  })

  it("error server tanpa peringatan tetap lewat showError verbatim", async () => {
    createLeadMock.mockResolvedValue({ success: false, error: "Nama lead wajib diisi." })
    const { container, root } = mountForm()
    submitForm(container)
    await act(async () => {})
    await act(async () => {})
    expect(showError).toHaveBeenCalledWith("Nama lead wajib diisi.")
    expect(container.querySelector("#duplicateOverrideReason")).toBeNull()
    act(() => root.unmount())
    container.remove()
  })
})
