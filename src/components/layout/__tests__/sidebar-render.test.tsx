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
let currentPath = "/master/barang"
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Uji", email: "uji@example.test" } }, status: "authenticated" }),
  signOut: vi.fn(),
}))

import { SidebarProvider } from "@/components/ui/shadcn/sidebar"
import { AppSidebar } from "../sidebar"

let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  document.body.replaceChildren()
})

async function renderSidebar(permissions: string[], roles: string[] = []) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <SidebarProvider>
        <AppSidebar permissions={permissions} roles={roles} />
      </SidebarProvider>,
    )
  })
  return container
}

describe("AppSidebar render (R8-NAV-01)", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
  })

  it("sidebar ter-render tepat satu kali (satu data-sidebar)", async () => {
    const container = await renderSidebar(["view_items"])
    expect(container.querySelectorAll('[data-sidebar="sidebar"]')).toHaveLength(1)
  })

  it("tautan anak grup muncul tepat satu per href", async () => {
    const container = await renderSidebar(["view_items"])
    expect(container.querySelectorAll('a[href="/master/barang"]')).toHaveLength(1)
  })

  it("grup SDM tidak terbuka hanya oleh tautan self-service (R8-NAV-01)", async () => {
    const container = await renderSidebar(["view_items"])
    const links = [...container.querySelectorAll('a[href^="/sdm"]')].map((a) => a.getAttribute("href"))
    expect(links).not.toContain("/sdm/penggajian")
    expect(container.querySelectorAll('a[href="/sdm/slip-gaji-saya"]')).toHaveLength(0)
    expect(container.querySelectorAll('a[href^="/sdm"]')).toHaveLength(0)
  })

  it("Slip Gaji Saya ikut tampil saat pengguna punya izin anak SDM", async () => {
    currentPath = "/sdm/absensi"
    const container = await renderSidebar(["view_attendance"])
    currentPath = "/master/barang"
    const links = [...container.querySelectorAll('a[href^="/sdm"]')].map((a) => a.getAttribute("href"))
    expect(links).toContain("/sdm/absensi")
    expect(links).toContain("/sdm/slip-gaji-saya")
    expect(links).not.toContain("/sdm/penggajian")
  })
})
