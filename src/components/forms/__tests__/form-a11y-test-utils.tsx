// @vitest-environment jsdom
import { expect, vi } from "vitest"
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

export async function withContainerAsync(run: (container: HTMLElement) => Promise<void>) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  await run(container)
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

// Test bodies live in single-field-a11y-forms.test.tsx (S2187: Sonar does not
// count describe/it forwarded through a helper as tests in the calling file).
// This helper only mounts + asserts; the calling file owns the `it` blocks.
export type SingleFieldA11ySpec = A11yBrandFormSpec

export function assertSingleFieldA11yAdd(spec: A11yBrandFormSpec) {
  const element = createElement(spec.component, {})
  withContainer((container) => {
    const root = mountInto(container, element)
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe(spec.addLabel)
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
    expect(decorativeStars(form).length).toBe(1)
    expect(labelTexts(form)).toEqual(expect.arrayContaining([spec.requiredLabel]))
    unmount(root, container)
  })
}

export function assertSingleFieldA11yEdit(spec: A11yBrandFormSpec) {
  const element = createElement(spec.component, { [spec.propName]: { id: 3, name: spec.editName } })
  withContainer((container) => {
    const root = mountInto(container, element)
    expect(container.querySelector("form")?.getAttribute("aria-label")).toBe(spec.editLabel)
    expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe(spec.editName)
    unmount(root, container)
  })
}

// Add-mode asserts for two-required-field (code+name) forms. Kept here once:
// each per-form copy of this block trips Sonar new-code duplication.
export function assertCodeNameA11yAdd(form: Element, container: HTMLElement, addLabel: string) {
  expect(form.getAttribute("aria-label")).toBe(addLabel)
  expect(form.getAttribute("aria-busy")).toBe("false")
  expect(container.querySelector("#code")!.getAttribute("required")).not.toBeNull()
  expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
  expect(decorativeStars(form).length).toBe(2)
  expect(labelTexts(form)).toEqual(expect.arrayContaining(["Kode *", "Nama *"]))
}

// Add-mode asserts for combobox+name forms (1 aria-required combobox, #name
// required, 2 decorative stars). Same Sonar rationale as above.
export function assertComboboxNameA11yAdd(
  form: Element,
  container: HTMLElement,
  spec: { addLabel: string; labels: [string, string] },
) {
  expect(form.getAttribute("aria-label")).toBe(spec.addLabel)
  expect(form.getAttribute("aria-busy")).toBe("false")
  expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
  expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
  expect(decorativeStars(form).length).toBe(2)
  expect(labelTexts(form)).toEqual(expect.arrayContaining([...spec.labels]))
}

// Add-mode asserts for order-combobox-only forms (1 aria-required combobox,
// 1 decorative star, tidak ada #name). Same Sonar rationale as above.
export function assertOrderComboboxA11yAdd(
  form: Element,
  container: HTMLElement,
  spec: { addLabel: string; requiredLabel: string; decorativeStarCount?: number },
) {
  expect(form.getAttribute("aria-label")).toBe(spec.addLabel)
  expect(form.getAttribute("aria-busy")).toBe("false")
  expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
  expect(decorativeStars(form).length).toBe(spec.decorativeStarCount ?? 1)
  expect(labelTexts(form)).toEqual(expect.arrayContaining([spec.requiredLabel]))
}

export function assertFormEditLabel(container: HTMLElement, editLabel: string) {
  expect(container.querySelector("form")!.getAttribute("aria-label")).toBe(editLabel)
}

// Add-mode asserts for multi-field money forms (several aria-required
// comboboxes + one required currency input, decorative stars, optional
// fields clean). Kept here once: per-form copies trip Sonar duplication.
export function assertMoneyFormA11yAdd(
  form: Element,
  container: HTMLElement,
  spec: {
    addLabel: string
    starCount: number
    labels: string[]
    ariaRequiredIds: string[]
    requiredIds: string[]
    optionalIds: string[]
  },
) {
  expect(form.getAttribute("aria-label")).toBe(spec.addLabel)
  expect(form.getAttribute("aria-busy")).toBe("false")
  expect(decorativeStars(form).length).toBe(spec.starCount)
  expect(labelTexts(form)).toEqual(expect.arrayContaining(spec.labels))
  for (const id of spec.ariaRequiredIds) {
    expect(container.querySelector(`#${id}`)!.getAttribute("aria-required"), id).toBe("true")
  }
  for (const id of spec.requiredIds) {
    expect(container.querySelector(`#${id}`)!.hasAttribute("required"), id).toBe(true)
  }
  for (const id of spec.optionalIds) {
    expect(container.querySelector(`#${id}`)!.hasAttribute("required"), id).toBe(false)
  }
}

/** Isi #name/#phone lalu submit form pelanggan (flush transition + action). */
export async function submitFilledForm(container: HTMLElement) {
  setFieldValue(container.querySelector<HTMLInputElement>("#name")!, "Budi Baru")
  setFieldValue(container.querySelector<HTMLInputElement>("#phone")!, "0812000111")
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    )
  })
  await act(async () => {})
}

/** Set input/textarea value via native setter so React/RHF sees the change (jsdom). */
export function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}
