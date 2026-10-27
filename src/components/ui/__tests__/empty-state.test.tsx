// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { EmptyState } from "../empty-state"

function render(container: HTMLElement, ui: React.ReactNode) {
  const root: Root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return root
}

describe("EmptyState", () => {
  it("render judul saja tanpa deskripsi/aksi/ikon", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <EmptyState title="Belum ada rak" />)
    expect(container.textContent).toContain("Belum ada rak")
    expect(container.querySelectorAll("p")).toHaveLength(1)
    act(() => root.unmount())
    container.remove()
  })

  it("render judul, deskripsi, ikon, dan aksi", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(
      container,
      <EmptyState
        title="Belum ada satuan"
        description="Tambahkan satuan pertama untuk mulai."
        icon={<span data-testid="ikon-kosong">ikon</span>}
        action={<button type="button">Tambah Satuan</button>}
      />,
    )
    expect(container.textContent).toContain("Belum ada satuan")
    expect(container.textContent).toContain("Tambahkan satuan pertama untuk mulai.")
    expect(container.querySelector("[data-testid='ikon-kosong']")).not.toBeNull()
    const button = container.querySelector("button")
    expect(button?.textContent).toBe("Tambah Satuan")
    act(() => root.unmount())
    container.remove()
  })

  it("menerapkan className tambahan pada wadah", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(container, <EmptyState title="Tidak ada lapisan aktif" className="py-10" />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain("py-10")
    expect(wrapper.className).not.toContain("py-16")
    act(() => root.unmount())
    container.remove()
  })
})
