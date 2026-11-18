// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))

import { Button } from "@/components/ui/button"
import { Button as ShadButton } from "@/components/ui/shadcn/button"
import { FormActions } from "@/components/ui/form-section"
import { CalendarBoard } from "@/app/(dashboard)/kalender/_components/calendar-board"
import { NotificationDropdown } from "@/components/layout/notification-dropdown"

let root: Root | null = null

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe("Touch targets, FormActions & A11y semantic nesting (H13 / H14 / M7)", () => {
  it("Button, ShadButton, and FormActions enforce >=44px mobile touch targets and md-up desktop breakpoints", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <div>
          <Button>Aksi</Button>
          <ShadButton size="sm">Kecil</ShadButton>
          <FormActions>
            <Button type="button">Batal</Button>
          </FormActions>
        </div>,
      )
    })

    const buttons = container.querySelectorAll("button")
    expect(buttons[0].className).toContain("min-h-11")
    expect(buttons[0].className).toContain("md:min-h-9")
    expect(buttons[1].className).toContain("min-h-11")
    expect(buttons[1].className).toContain("md:min-h-8")

    const bar = buttons[2].parentElement!
    expect(bar.className).toContain("md:static")
    expect(bar.className).not.toContain("sm:static")
  })

  it("CalendarBoard separates day-selection button from event Link chips (no Link inside button/[role=button])", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <CalendarBoard
          weeks={[
            [
              {
                key: "2026-11-18",
                dayNumber: 18,
                inMonth: true,
                isToday: true,
                fullDateLabel: "18 November 2026",
              },
            ],
          ]}
          events={[
            {
              id: "ev-1",
              dayKey: "2026-11-18",
              kind: "invoice",
              label: "INV-001",
              amount: 100000,
              href: "/penjualan/faktur/1",
            },
          ]}
          availableKinds={["invoice"]}
          canViewArSummary={false}
          canViewApSummary={false}
          defaultSelectedDayKey="2026-11-18"
        />,
      )
    })

    const dayBtn = container.querySelector('button[aria-pressed="true"]')
    expect(dayBtn).not.toBeNull()

    const links = Array.from(container.querySelectorAll("a"))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.closest('button, [role="button"]')).toBeNull()
    }
  })

  it("NotificationDropdown uses role='status' while loading and removes aria-disabled on read items", async () => {
    let resolveNotifications!: (value: unknown) => void
    let callCount = 0
    global.fetch = vi.fn(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ notifications: [], unreadCount: 1 }),
        })
      }
      return new Promise((resolve) => {
        resolveNotifications = resolve
      })
    }) as never

    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<NotificationDropdown />)
    })

    const toggleBtn = container.querySelector("#notification-btn") as HTMLButtonElement
    expect(toggleBtn).not.toBeNull()

    act(() => {
      toggleBtn.click()
    })

    const loadingStatus = container.querySelector('[role="status"]')
    expect(loadingStatus).not.toBeNull()
    expect(loadingStatus?.textContent).toContain("Memuat notifikasi...")

    await act(async () => {
      resolveNotifications({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 7,
              title: "Faktur Dibayar",
              body: "/penjualan/faktur/7",
              type: "info",
              readAt: "2026-11-17T08:00:00Z",
              createdAt: "2026-11-17T08:00:00Z",
            },
          ],
          unreadCount: 0,
        }),
      })
      await Promise.resolve()
    })

    const notifBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Faktur Dibayar"),
    )
    expect(notifBtn).toBeDefined()
    expect(notifBtn?.getAttribute("aria-disabled")).toBeNull()
  })
})
