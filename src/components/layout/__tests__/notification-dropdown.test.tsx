// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, ...props }: { onPress?: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} onClick={onPress}>{children}</button>
  ),
}))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
const pushMock = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }))

import { NotificationDropdown } from "../notification-dropdown"

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ notifications: [], unreadCount: 25 }),
  })) as never
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe("NotificationDropdown", () => {
  it("R6WN-08: mengambil unread count saat mount tanpa membuka dropdown", async () => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<NotificationDropdown />)
    })
    expect(global.fetch).toHaveBeenCalledWith("/api/notifications")
    expect(container.querySelector('[aria-label="25 notifikasi belum dibaca"]')).not.toBeNull()
  })

  it("R6WN-10: klik notifikasi body-path menavigasi ke dokumen terkait", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        notifications: [{
          id: 3,
          title: "Penawaran diterima pelanggan",
          body: "/penjualan/penawaran/5",
          type: "info",
          readAt: null,
          createdAt: new Date().toISOString(),
        }],
        unreadCount: 1,
      }),
    })) as never
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<NotificationDropdown />)
    })
    const bell = container.querySelector("button")
    await act(async () => {
      bell!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(container.textContent).toContain("Buka dokumen terkait")
    const row = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Penawaran diterima"),
    )
    await act(async () => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(pushMock).toHaveBeenCalledWith("/penjualan/penawaran/5")
  })
})
