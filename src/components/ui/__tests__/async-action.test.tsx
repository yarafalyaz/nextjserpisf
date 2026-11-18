// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const showErrorMock = vi.fn()
vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => showErrorMock(...args),
  showSuccess: vi.fn(),
}))

import { runUiAction } from "../async-action"
import { PwaRegistrar } from "@/components/providers/pwa-registrar"

let root: Root | null = null

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe("runUiAction & PWA error handling (H12)", () => {
  it("reports Error rejections to showError and executes onFinally", async () => {
    const onFinally = vi.fn()
    await runUiAction(
      async () => {
        throw new Error("Koneksi terputus")
      },
      "Fallback error",
      onFinally,
    )

    expect(showErrorMock).toHaveBeenCalledWith("Koneksi terputus")
    expect(onFinally).toHaveBeenCalledTimes(1)
  })

  it("uses fallback message for non-Error throws", async () => {
    await runUiAction(async () => {
      throw "unknown"
    }, "Gagal memproses permintaan")

    expect(showErrorMock).toHaveBeenCalledWith("Gagal memproses permintaan")
  })

  it("rethrows NEXT_REDIRECT without calling showError while running onFinally", async () => {
    const onFinally = vi.fn()
    const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    })

    await expect(
      runUiAction(async () => {
        throw redirectErr
      }, "Fallback error", onFinally),
    ).rejects.toBe(redirectErr)

    expect(showErrorMock).not.toHaveBeenCalled()
    expect(onFinally).toHaveBeenCalledTimes(1)
  })

  it("PwaRegistrar registers /sw.js with updateViaCache:'none' and surfaces install prompt failure", async () => {
    const registerMock = vi.fn().mockResolvedValue({})
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      configurable: true,
    })

    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<PwaRegistrar />)
    })

    expect(registerMock).toHaveBeenCalledWith("/sw.js", { updateViaCache: "none" })

    const installEvent = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
    }
    installEvent.prompt = vi.fn().mockRejectedValue(new Error("Install prompt ditolak"))
    installEvent.userChoice = Promise.resolve({ outcome: "dismissed" })

    await act(async () => {
      window.dispatchEvent(installEvent)
    })

    const installBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Pasang"),
    )
    expect(installBtn).toBeDefined()
    expect(installBtn?.className).toContain("min-h-11")

    await act(async () => {
      installBtn!.click()
      await Promise.resolve()
    })

    expect(showErrorMock).toHaveBeenCalledWith("Install prompt ditolak")
  })
})
