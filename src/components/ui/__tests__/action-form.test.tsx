// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { ActionForm } from "../action-form"

function mount(ui: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { root, container }
}

function unmountAndRemove(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount()
  })
  container.remove()
}

describe("ActionForm", () => {
  it("renders children without an error alert initially", () => {
    const { root, container } = mount(
      <ActionForm action={async () => {}}>
        <button type="submit">Simpan</button>
      </ActionForm>,
    )
    expect(container.querySelector("[role='alert']")).toBeNull()
    expect(container.querySelector("button[type='submit']")).not.toBeNull()
    unmountAndRemove(root, container)
  })

  it("moves focus to the error alert when the action fails", async () => {
    const { root, container } = mount(
      <ActionForm action={async () => ({ success: false as const, error: "Nama sudah dipakai" })}>
        <button type="submit">Simpan</button>
      </ActionForm>,
    )
    await act(async () => {
      (container.querySelector("button[type='submit']") as HTMLButtonElement).click()
    })
    const alert = container.querySelector("[role='alert']")
    expect(alert?.textContent).toBe("Nama sudah dipakai")
    expect(document.activeElement).toBe(alert)
    unmountAndRemove(root, container)
  })
})
