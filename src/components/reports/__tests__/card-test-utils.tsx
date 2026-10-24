// @vitest-environment jsdom
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

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

export function unmountCard(root: Root) {
  act(() => root.unmount())
}

export function clearRenderedCards() {
  document.body.replaceChildren()
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
