// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { showErrorMock } = vi.hoisted(() => ({ showErrorMock: vi.fn() }))
const fetchMock = vi.fn()

vi.mock("@/lib/utils/toast", () => ({ showError: showErrorMock, showSuccess: vi.fn() }))
vi.mock("@/components/ui/combobox", () => ({
  Combobox: (p: {
    id?: string
    options: { value: string; label: string }[]
    onChange?: (key: string | null) => void
  }) => (
    <select
      id={p.id}
      aria-label={p.id}
      onChange={(e) => p.onChange?.(e.target.value || null)}
    >
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

  it("ganti provinsi cepat: respons kota lama yang telat tidak menimpa daftar baru", async () => {
    const resolvers: Record<string, (v: unknown) => void> = {}
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("tipe=provinces")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            { code: "31", name: "DKI Jakarta" },
            { code: "32", name: "Jawa Barat" },
          ],
        })
      }
      return new Promise((resolve) => {
        resolvers[url] = resolve
      })
    })
    const { container, root } = mount(<AddressPicker />)
    roots.push(root)
    await act(async () => {})

    const provinceSelect = container.querySelector<HTMLSelectElement>("select")!
    const pick = async (name: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!
        setter.call(provinceSelect, name)
        provinceSelect.dispatchEvent(new Event("change", { bubbles: true }))
      })
    }
    await pick("DKI Jakarta")
    await pick("Jawa Barat")
    expect(resolvers["/api/address?tipe=regencies&kodeInduk=32"]).toBeTypeOf("function")

    // Respons provinsi baru selesai duluan, lalu respons lama menyusul.
    await act(async () => {
      resolvers["/api/address?tipe=regencies&kodeInduk=32"]({
        ok: true,
        status: 200,
        json: async () => [{ code: "3201", name: "Kota Bandung" }],
      })
    })
    await act(async () => {
      resolvers["/api/address?tipe=regencies&kodeInduk=31"]({
        ok: true,
        status: 200,
        json: async () => [{ code: "3101", name: "Kota Jakarta" }],
      })
    })

    expect(container.textContent).toContain("Kota Bandung")
    expect(container.textContent).not.toContain("Kota Jakarta")
  })
})
