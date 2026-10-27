// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const captured: { theme?: unknown } = {}

vi.mock("sonner", () => ({
  Toaster: (props: { theme?: unknown }) => {
    captured.theme = props.theme
    return null
  },
}))

import { Toaster } from "../sonner"
import { ThemeProvider } from "@/components/providers/theme-provider"

function render(node: HTMLElement, ui: React.ReactNode) {
  const root: Root = createRoot(node)
  act(() => {
    root.render(ui)
  })
  return root
}

describe("Toaster Sonner tema (provider kustom)", () => {
  beforeEach(() => {
    captured.theme = undefined
    localStorage.clear()
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  it.each([
    ["dark", "dark"],
    ["light", "light"],
    [null, "system"],
  ])("pilihan tema %s diteruskan ke Sonner sebagai %s", (stored, expected) => {
    if (stored) localStorage.setItem("theme", stored)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = render(
      container,
      <ThemeProvider>
        <Toaster />
      </ThemeProvider>,
    )
    expect(captured.theme).toBe(expected)
    act(() => root.unmount())
    container.remove()
  })
})
