// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { AppDatePicker } from "../date-picker"
import { AppMonthPicker } from "../month-picker"
import { mountPicker, unmountPickers, getPickerLabel } from "./picker-test-utils"

afterEach(unmountPickers)

const PICKERS = [
  { judul: "AppDatePicker", Component: AppDatePicker, name: "tgl", label: "Tanggal" },
  { judul: "AppMonthPicker", Component: AppMonthPicker, name: "bln", label: "Bulan" },
] as const

describe.each(PICKERS)("$judul label bintang wajib", ({ Component, name, label }) => {
  function getTrigger(container: HTMLElement): HTMLButtonElement {
    const trigger = container.querySelector(`button[id="${name}-trigger"]`)
    if (!trigger) throw new Error("expected trigger button")
    return trigger as HTMLButtonElement
  }

  it(`label '${label} *' -> bintang dekoratif aria-hidden, teks label bersih`, () => {
    const container = mountPicker(<Component label={`${label} *`} name={name} required />)
    const el = getPickerLabel(container)
    const star = el.querySelector('span[aria-hidden="true"]')
    expect(star).not.toBeNull()
    expect(star?.textContent).toBe("*")
    expect(star?.className).toContain("text-destructive")
    const labelText = Array.from(el.childNodes)
      .filter((n) => !(n instanceof HTMLElement && n.getAttribute("aria-hidden") === "true"))
      .map((n) => n.textContent)
      .join("")
      .trim()
    expect(labelText).toBe(label)
    expect(el.textContent?.replace(/\s+/g, " ").trim()).toBe(`${label} *`)
  })

  it("label tanpa bintang -> tidak ada span bintang dekoratif", () => {
    const container = mountPicker(<Component label={label} name={name} />)
    const el = getPickerLabel(container)
    expect(el.querySelector('span[aria-hidden="true"]')).toBeNull()
    expect(el.textContent?.trim()).toBe(label)
  })

  it("required -> aria-required=true di trigger; makna wajib tetap terwakili saat bintang dekoratif", () => {
    const container = mountPicker(<Component label={`${label} *`} name={name} required />)
    expect(getTrigger(container).getAttribute("aria-required")).toBe("true")
  })

  it("tanpa required -> aria-required tidak true", () => {
    const container = mountPicker(<Component label={`${label} *`} name={name} />)
    expect(getTrigger(container).getAttribute("aria-required")).not.toBe("true")
  })
})
