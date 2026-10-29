// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { showErrorMock } = vi.hoisted(() => ({ showErrorMock: vi.fn() }))
const fetchMock = vi.fn()

vi.mock("@/lib/utils/toast", () => ({ showError: showErrorMock, showSuccess: vi.fn() }))
vi.mock("@/components/ui/combobox", () => ({
  Combobox: (p: { id?: string; options: { value: string; label: string }[] }) => (
    <select id={p.id} aria-label={p.id}>
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}))

import { mount, act } from "@/components/payroll/__tests__/mount"
import type { Root } from "react-dom/client"
import { AddressPicker } from "../address-picker"

const roots: Root[] = []

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
})

describe("AddressPicker — HTTP error tidak diam", () => {
  it("fetch provinsi 500 → toast error (bukan daftar kosong diam-diam)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "boom" }) })
    const { container, root } = mount(<AddressPicker />)
    roots.push(root)
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledWith("/api/address?tipe=provinces")
    expect(showErrorMock).toHaveBeenCalledWith(
      "Gagal memuat data provinsi",
      "Periksa koneksi lalu coba lagi.",
    )
    expect(container.querySelectorAll("option")).toHaveLength(0)
  })

  it("fetch provinsi 200 → opsi terisi, tanpa toast error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ code: "31", name: "DKI Jakarta" }],
    })
    const { container, root } = mount(<AddressPicker />)
    roots.push(root)
    await act(async () => {})
    expect(showErrorMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain("DKI Jakarta")
  })
})
