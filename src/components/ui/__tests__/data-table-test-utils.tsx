import type { ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

/**
 * Rangka uji jsdom bersama untuk komponen DataTable (Radix): pasang stub
 * observer/matchMedia yang tidak tersedia di jsdom, lalu mount/unmount
 * elemen. Disimpan sekali di sini — menyalin blok ini per berkas tes
 * dihitung Sonar sebagai duplikasi kode baru.
 */
export function setupJsdomTableStubs() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver
  globalThis.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

export function mountTable(element: ReactElement): { container: HTMLElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(element)
  })
  return { container, root }
}

export function unmountTable(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}
