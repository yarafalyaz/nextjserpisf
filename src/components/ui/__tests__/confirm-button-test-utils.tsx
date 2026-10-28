// Rangka uji jsdom bersama tombol konfirmasi klien (VoidButton,
// ReversePaymentButton, PostedLockNotice): mount/unmount + klik + reset
// document.body. Disimpan sekali di sini — menyalin blok render/click per
// berkas tes dihitung Sonar sebagai duplikasi kode baru.
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

export function newTestContainer(): { container: HTMLElement; root: Root } {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.body.innerHTML = ""
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  return { container, root }
}

export function renderTestUi(
  container: HTMLElement,
  root: Root,
  ui: React.ReactNode,
): void {
  act(() => {
    root.render(ui)
  })
}

export function clickTestEl(el: Element | null): void {
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

export function unmountTestUi(root: Root, container: HTMLElement): void {
  act(() => root.unmount())
  container.remove()
}

export function findButtonByText(scope: ParentNode, text: string): HTMLButtonElement | null {
  return (
    (Array.from(scope.querySelectorAll("button")).find(
      (b) => b.textContent === text,
    ) as HTMLButtonElement | undefined) ?? null
  )
}
