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
