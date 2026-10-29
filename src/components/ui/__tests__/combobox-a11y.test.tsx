// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "../combobox"
import { mountPicker, unmountPickers } from "./picker-test-utils"
import { stubPopoverDom } from "@/components/reports/__tests__/card-test-utils"

stubPopoverDom()
afterEach(unmountPickers)

const OPTIONS = [
  { value: "1", label: "Gudang Utama" },
  { value: "2", label: "Gudang Cabang" },
]

function trigger(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector('[role="combobox"]')
  if (!el) throw new Error("combobox trigger tidak ditemukan")
  return el as HTMLButtonElement
}

describe("Combobox nama screen-reader (BUGHUNT 14)", () => {
  it("label eksternal htmlFor -> aria-labelledby menunjuk id label itu", () => {
    const container = mountPicker(
      <div>
        <Label htmlFor="gudang">Gudang</Label>
        <Combobox id="gudang" options={OPTIONS} value={null} placeholder="Pilih gudang" />
      </div>,
    )
    const el = trigger(container)
    // htmlFor saja tidak menamai <button role=combobox> (bukan labelable).
    expect(el.getAttribute("aria-labelledby")).toBe("gudang-label")
    expect(el.getAttribute("aria-label")).toBeNull()
  })

  it("aria-labelledby eksplisit dipakai apa adanya", () => {
    const container = mountPicker(
      <div>
        <span id="label-kustom">Pelanggan</span>
        <Combobox id="pelanggan" aria-labelledby="label-kustom" options={OPTIONS} value={null} />
      </div>,
    )
    expect(trigger(container).getAttribute("aria-labelledby")).toBe("label-kustom")
  })

  it("aria-label eksplisit menang atas aria-labelledby", () => {
    const container = mountPicker(
      <Combobox id="jam" aria-label="Jam" aria-labelledby="label-lain" options={OPTIONS} value={null} />,
    )
    const el = trigger(container)
    expect(el.getAttribute("aria-label")).toBe("Jam")
    expect(el.getAttribute("aria-labelledby")).toBeNull()
  })

  it("tanpa id dan tanpa aria-label -> tidak ada nama palsu", () => {
    const container = mountPicker(<Combobox options={OPTIONS} value={null} />)
    const el = trigger(container)
    expect(el.getAttribute("aria-labelledby")).toBeNull()
    expect(el.getAttribute("aria-label")).toBeNull()
  })

})
