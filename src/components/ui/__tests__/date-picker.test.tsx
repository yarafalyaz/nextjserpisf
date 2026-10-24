// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { AppDatePicker } from "../date-picker"
import { mountPicker, unmountPickers, getPickerLabel } from "./picker-test-utils"

afterEach(unmountPickers)

function getLabel(container: HTMLElement): HTMLLabelElement {
  return getPickerLabel(container)
}

function getTrigger(container: HTMLElement): HTMLButtonElement {
  const trigger = container.querySelector('button[id="tgl-trigger"]')
  if (!trigger) throw new Error("expected trigger button")
  return trigger as HTMLButtonElement
}

describe("AppDatePicker label bintang wajib", () => {
  it("label 'Tanggal *' -> bintang dekoratif aria-hidden, teks label bersih", () => {
    const container = mountPicker(<AppDatePicker label="Tanggal *" name="tgl" required />)
    const label = getLabel(container)
    const star = label.querySelector('span[aria-hidden="true"]')
    expect(star).not.toBeNull()
    expect(star?.textContent).toBe("*")
    expect(star?.className).toContain("text-destructive")
    // Bintang hanya dekoratif: teks yang dibaca dari label tanpa span adalah bersih.
    const labelText = Array.from(label.childNodes)
      .filter((n) => !(n instanceof HTMLElement && n.getAttribute("aria-hidden") === "true"))
      .map((n) => n.textContent)
      .join("")
      .trim()
    expect(labelText).toBe("Tanggal")
    // Teks terlihat tidak berubah.
    expect(label.textContent?.replace(/\s+/g, " ").trim()).toBe("Tanggal *")
  })

  it("label tanpa bintang -> tidak ada span bintang dekoratif", () => {
    const container = mountPicker(<AppDatePicker label="Tanggal" name="tgl" />)
    const label = getLabel(container)
    expect(label.querySelector('span[aria-hidden="true"]')).toBeNull()
    expect(label.textContent?.trim()).toBe("Tanggal")
  })

  it("required -> aria-required=true di trigger; makna wajib tetap terwakili saat bintang dekoratif", () => {
    const container = mountPicker(<AppDatePicker label="Tanggal *" name="tgl" required />)
    expect(getTrigger(container).getAttribute("aria-required")).toBe("true")
  })

  it("tanpa required -> aria-required tidak true", () => {
    const container = mountPicker(<AppDatePicker label="Tanggal *" name="tgl" />)
    expect(getTrigger(container).getAttribute("aria-required")).not.toBe("true")
  })
})
