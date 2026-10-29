// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"
import { act } from "react"
import { AppMonthPicker } from "../month-picker"
import { mountPicker, unmountPickers } from "./picker-test-utils"
import { stubPopoverDom } from "@/components/reports/__tests__/card-test-utils"

stubPopoverDom()
afterEach(unmountPickers)

async function openPicker(container: HTMLElement) {
  const btn = container.querySelector('button[id="periode-trigger"]') as HTMLButtonElement | null
  if (!btn) throw new Error("trigger tidak ditemukan")
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  // Tunggu rAF di picker memindahkan fokus ke bulan aktif.
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  })
}

function monthButton(container: HTMLElement, labelPart: string): HTMLButtonElement {
  const el = [...document.body.querySelectorAll("button")].find((b) =>
    (b.getAttribute("aria-label") ?? "").includes(labelPart),
  ) as HTMLButtonElement | undefined
  if (!el) throw new Error(`bulan ${labelPart} tidak ditemukan`)
  return el
}

async function keydown(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  })
}

describe("AppMonthPicker keyboard + target 44px (BUGHUNT 15)", () => {
  it("grid: role grid/gridcell, bulan min-h-11, roving tabindex satu tabbable", async () => {
    const container = mountPicker(
      <AppMonthPicker label="Bulan" name="periode" value="2026-03" onChange={() => {}} />,
    )
    await openPicker(container)
    expect(document.body.querySelector('[role="grid"]')).not.toBeNull()
    expect(document.body.querySelectorAll('[role="gridcell"]').length).toBe(12)
    const maret = monthButton(container, "Maret 2026")
    expect(maret.className).toContain("min-h-11")
    const tabbable = [...document.body.querySelectorAll("button")].filter(
      (b) => b.getAttribute("aria-label")?.match(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) /) && b.tabIndex === 0,
    )
    expect(tabbable.length).toBe(1)
    expect(tabbable[0]).toBe(maret)
    expect(document.activeElement).toBe(maret)
  })

  it("ArrowRight/ArrowDown/ArrowLeft pindah fokus, Enter memilih bulan fokus", async () => {
    const onChange = vi.fn()
    const container = mountPicker(
      <AppMonthPicker label="Bulan" name="periode" value="2026-03" onChange={onChange} />,
    )
    await openPicker(container)
    await keydown(document.activeElement as Element, "ArrowRight")
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toContain("April 2026")
    await keydown(document.activeElement as Element, "ArrowDown")
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toContain("Juli 2026")
    await keydown(document.activeElement as Element, "ArrowLeft")
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toContain("Juni 2026")
    act(() => {
      ;(document.activeElement as HTMLButtonElement).click()
    })
    expect(onChange).toHaveBeenCalledWith("2026-06")
  })

  it("Escape menutup grid", async () => {
    const container = mountPicker(
      <AppMonthPicker label="Bulan" name="periode" value="2026-03" onChange={() => {}} />,
    )
    await openPicker(container)
    expect(document.body.querySelector('[role="grid"]')).not.toBeNull()
    await keydown(document.activeElement as Element, "Escape")
    expect(document.body.querySelector('[role="grid"]')).toBeNull()
  })

  it("tombol tahun 44px (size-11)", async () => {
    const container = mountPicker(
      <AppMonthPicker label="Bulan" name="periode" value="2026-03" onChange={() => {}} />,
    )
    await openPicker(container)
    for (const label of ["Tahun sebelumnya", "Tahun berikutnya"]) {
      const el = document.body.querySelector(`button[aria-label="${label}"]`)
      expect(el?.className).toContain("size-11")
    }
  })

  it("trigger bernama dari label eksternal (aria-labelledby)", () => {
    const container = mountPicker(
      <AppMonthPicker label="Bulan" name="periode" value="2026-03" onChange={() => {}} />,
    )
    const label = container.querySelector('label[id="periode-label"]')
    const btn = container.querySelector('button[id="periode-trigger"]')
    expect(label).not.toBeNull()
    expect(btn?.getAttribute("aria-labelledby")).toBe("periode-label")
  })
})
