// Silence React 19 act environment warning
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const roots: Root[] = []

export function mountPicker(ui: React.ReactNode): HTMLElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(ui)
  })
  return container
}

export function unmountPickers(): void {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.innerHTML = ""
}

export function getPickerLabel(container: HTMLElement): HTMLLabelElement {
  const label = container.querySelector("label")
  if (!label) throw new Error("expected label")
  return label
}
