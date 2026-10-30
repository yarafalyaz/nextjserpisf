// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

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
})
