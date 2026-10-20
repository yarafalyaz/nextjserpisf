// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { createElement, type ComponentType, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

type A11yBrandFormSpec = {
  // ponytail: any-component cast needed, per-form props differ (brand/category)
  component: ComponentType<any>
  propName: string
  addLabel: string
  editLabel: string
  editName: string
  requiredLabel: string
}

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

// Dedup helper: Sonar hit each single-field brand/category form test's
// near-identical 12-line block as duplication (33.3% on PR #83 lines 16-27).
export function describeSingleFieldA11y(title: string, spec: A11yBrandFormSpec) {
  const mountForm = (record?: { id: number; name: string }) =>
    createElement(spec.component, record ? { [spec.propName]: record } : {})
  describe(`${title} — a11y wiring`, () => {
    it("form aria-label tambah + aria-busy false; input required; bintang dekoratif aria-hidden", () => {
      withContainer((container) => {
        const root = mountInto(container, mountForm())
        const form = container.querySelector("form")!
        expect(form.getAttribute("aria-label")).toBe(spec.addLabel)
        expect(form.getAttribute("aria-busy")).toBe("false")
        expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
        expect(decorativeStars(form).length).toBe(1)
        expect(labelTexts(form)).toEqual(expect.arrayContaining([spec.requiredLabel]))
        unmount(root, container)
      })
    })
    it("mode ubah: label ubah + nama terisi", () => {
      withContainer((container) => {
        const root = mountInto(container, mountForm({ id: 3, name: spec.editName }))
        expect(container.querySelector("form")?.getAttribute("aria-label")).toBe(spec.editLabel)
        expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe(spec.editName)
        unmount(root, container)
      })
    })
  })
}
