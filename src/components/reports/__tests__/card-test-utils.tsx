// @vitest-environment jsdom
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// Rangka render bersama tes kartu laporan. Sonar menandai blok mount
// salin-tempel tiap berkas tes sebagai duplikasi; simpan sekali di sini.
export function renderCard(node: ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

export function renderCardText<L extends string>(node: ReactNode, labels: Record<L | "card", string>) {
  const { container, root } = renderCard(node)
  const found = Object.fromEntries(
    Object.entries(labels).map(([key, selector]) => [key, container.querySelector(`[aria-label="${selector}"]`) !== null]),
  ) as Record<L | "card", boolean>
  const hasTable = container.querySelector("table") !== null
  const text = container.textContent ?? ""
  unmountCard(root)
  return { text, found, hasTable }
}

export function unmountCard(root: Root) {
  act(() => root.unmount())
}

export function clearRenderedCards() {
  document.body.replaceChildren()
}

/**
 * Reset rangka tes kartu: bersihkan DOM hasil render + seluruh mock.
 * Dipakai langsung sebagai `afterEach(resetCardHarness)` supaya blok
 * `afterEach(() => { clearRenderedCards(); vi.clearAllMocks() })` tidak
 * disalin ke tiap berkas tes.
 */
export function resetCardHarness() {
  clearRenderedCards()
  vi.clearAllMocks()
}

/**
 * Klik tombol kartu berdasarkan `aria-label` persis, lalu kembalikan elemennya.
 * Menggantikan helper `openDialog` salin-tempel di tiap berkas tes; gagal keras
 * dengan pesan jelas bila tombolnya tidak ada.
 */
export function openDialogByLabel(container: HTMLElement, label: string) {
  const btn = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
  if (!btn) throw new Error(`Tombol ber-aria-label tidak ditemukan: ${label}`)
  act(() => {
    btn.click()
  })
  return btn
}

/**
 * Factory mock `ReportPageShell` untuk tes halaman laporan: render judul +
 * filter + aksi + anak apa adanya. Dipakai lewat
 * `vi.mock("@/components/reports/report-page-shell", async () => (await import("@/components/reports/__tests__/card-test-utils")).reportPageShellModule)`.
 */
export const reportPageShellModule = {
  ReportPageShell: ({
    children,
    filter,
    actions,
    title,
  }: {
    children: ReactNode
    filter?: ReactNode
    actions?: ReactNode
    title: string
  }) => (
    <div>
      <h1>{title}</h1>
      {filter}
      {actions}
      {children}
    </div>
  ),
}

export function renderPageNode(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

/** Isi input/textarea React terkontrol di jsdom (setter native + event input). */
export function setFieldValue(container: HTMLElement, selector: string, value: string) {
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  if (!el) throw new Error(`Field tidak ditemukan: ${selector}`)
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  return el
}

/** Klik tombol pertama yang teksnya persis sama. */
export function clickButtonByText(container: HTMLElement, text: string) {
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === text)
  if (!btn) throw new Error(`Tombol tidak ditemukan: ${text}`)
  btn.click()
  return btn as HTMLButtonElement
}

/** Stub jsdom untuk Radix Popover/Command (combobox proyek, FormSelect). */
export function stubPopoverDom() {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= () => {}
}

/** Buka combobox (button[role=combobox]) dan kembalikan teks opsinya. */
export function openComboboxOptions(combo: Element): string[] {
  act(() => {
    combo.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  return [...document.body.querySelectorAll('[role="option"]')].map(
    (o) => o.textContent?.trim() ?? "",
  )
}

/** Pilih opsi combobox berdasarkan teks label. */
export function pickComboboxOption(label: string) {
  const option = [...document.body.querySelectorAll('[role="option"]')].find(
    (o) => (o.textContent?.trim() ?? "") === label,
  )
  if (!option) throw new Error(`Opsi combobox tidak ditemukan: ${label}`)
  act(() => {
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}
