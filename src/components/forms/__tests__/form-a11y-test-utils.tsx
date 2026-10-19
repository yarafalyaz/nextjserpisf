// @vitest-environment jsdom
import { vi } from "vitest"
import { createRoot, type Root } from "react-dom/client"
import { act, type ReactElement } from "react"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// Shared scaffolding for form a11y tests. Sonar flags each form test's
// copy-pasted mount/mock blocks as duplication; keep them here once.
export const routerModule = {
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}

export const toastModule = { showSuccess: vi.fn(), showError: vi.fn() }

export const quickAddRegistryModule = {
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}

export function mountInto(container: HTMLElement, element: ReactElement): Root {
  const root = createRoot(container)
  act(() => { root.render(element) })
  return root
}

export function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

export function withContainer(run: (container: HTMLElement) => void) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  run(container)
}

export function decorativeStars(form: Element) {
  return form.querySelectorAll('span[aria-hidden="true"].text-destructive')
}

export function labelTexts(form: Element) {
  return Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
}

export function combobox(container: HTMLElement) {
  return container.querySelector('[role="combobox"]')!
}
