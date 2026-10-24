// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

const createMock = vi.fn(async (..._args: unknown[]) => ({ success: true as const, id: 1 }))
const scrapMock = vi.fn(async (..._args: unknown[]) => ({ success: true as const }))
vi.mock("@/actions/inventory.actions", () => ({
  createRemnant: (...args: unknown[]) => createMock(...args),
  consumeRemnant: vi.fn(async () => ({ success: true })),
  scrapRemnant: (...args: unknown[]) => scrapMock(...args),
}))

vi.mock("@/lib/utils/toast", () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

import { RemnantForm, ScrapRemnantForm, REMNANT_SOURCE_OPTIONS } from "../remnant-forms"

function mount(node: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function setVal(container: HTMLElement, selector: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(selector)
  if (!el) throw new Error(`Field tidak ditemukan: ${selector}`)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

beforeEach(() => {
  createMock.mockClear()
  scrapMock.mockClear()
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("RemnantForm F-2026-10-24-098-S", () => {
  it("field wajib baru ter-render: dimensi, ukuran terukur, sumber + ID baris issue", () => {
    const html = renderToStaticMarkup(<RemnantForm />)
    expect(html).toContain('name="dimensions"')
    expect(html).toContain('name="measuredSize"')
    expect(html).toContain('name="sourceType"')
    expect(html).toContain('name="sourceId"')
    expect(html).toContain("Dimensi")
    expect(html).toContain("Ukuran Terukur")
    expect(html).toContain("ID Baris Issue Asal")
    expect(REMNANT_SOURCE_OPTIONS.map((o) => o.value)).toEqual([
      "material_issue_item",
      "production_order_material",
    ])
  })

  it("submit meneruskan FormData lengkap ke createRemnant", async () => {
    const { container, root } = mount(<RemnantForm />)
    setVal(container, '[name="itemId"]', "1")
    setVal(container, '[name="warehouseId"]', "1")
    setVal(container, '[name="qty"]', "2")
    setVal(container, '[name="dimensions"]', "1200x300 mm")
    setVal(container, '[name="measuredSize"]', "1200")
    setVal(container, '[name="sourceId"]', "42")
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="sourceType"]')
    if (!hidden) throw new Error("hidden sourceType tidak ditemukan")
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
    setter.call(hidden, "material_issue_item")
    hidden.dispatchEvent(new Event("input", { bubbles: true }))

    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(createMock).toHaveBeenCalledTimes(1)
    const fd = createMock.mock.calls[0][0] as unknown as FormData
    expect(fd.get("dimensions")).toBe("1200x300 mm")
    expect(fd.get("measuredSize")).toBe("1200")
    expect(fd.get("sourceType")).toBe("material_issue_item")
    expect(fd.get("sourceId")).toBe("42")
    act(() => root.unmount())
  })
})

describe("ScrapRemnantForm F-2026-10-24-098-S", () => {
  it("field berat besi tua kg wajib ter-render", () => {
    const html = renderToStaticMarkup(<ScrapRemnantForm id={4} />)
    expect(html).toContain('name="scrapWeightKg"')
    expect(html).toContain('aria-label="Berat besi tua (kg)"')
    expect(html).toContain('name="scrapReason"')
  })

  it("submit meneruskan scrapWeightKg ke scrapRemnant", async () => {
    const { container, root } = mount(<ScrapRemnantForm id={4} />)
    setVal(container, '[name="scrapReason"]', "tak terpakai")
    setVal(container, '[name="scrapWeightKg"]', "12.5")
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(scrapMock).toHaveBeenCalledTimes(1)
    expect(scrapMock.mock.calls[0][0]).toBe(4)
    const fd = scrapMock.mock.calls[0][1] as unknown as FormData
    expect(fd.get("scrapReason")).toBe("tak terpakai")
    expect(fd.get("scrapWeightKg")).toBe("12.5")
    act(() => root.unmount())
  })
})
