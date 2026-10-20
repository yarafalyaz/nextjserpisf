
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("header target sentuh 44px (360-430px)", () => {
  it("SidebarTrigger 44px", () => {
    const src = source("src/components/ui/shadcn/sidebar.tsx")
    const trigger = src.split("\n").find((line) => line.includes('data-sidebar="trigger"'))
    expect(trigger).toBeTruthy()
    // size-11 = 44px; size-9 = 36px di bawah target
    expect(src).toContain('className={cn("size-11", className)}')
    expect(src).not.toContain('className={cn("size-9", className)}')
  })

  it("tombol Cari mobile 44px", () => {
    const src = source("src/components/layout/header.tsx")
    const idx = src.indexOf('aria-label="Cari"')
    expect(idx).toBeGreaterThan(0)
    // className override wins via cn/tailwind-merge: size-11 = 44px; icon-sm = 32px
    expect(src.slice(Math.max(0, idx - 300), idx)).toContain("size-11 md:hidden")
    expect(src.slice(idx, idx + 50)).toContain('aria-label="Cari"')
  })

  it("tombol Menu pengguna mobile 44px", () => {
    const src = source("src/components/layout/header.tsx")
    const line = src.split("\n").find((l) => l.includes('aria-label="Menu pengguna"'))
    expect(line).toBeTruthy()
    expect(line).toContain('className="size-11')
    expect(line).toContain('aria-label="Menu pengguna"')
  })

  it("tombol Buka notifikasi 44px", () => {
    const src = source("src/components/layout/notification-dropdown.tsx")
    const line = src.split("\n").find((l) => l.includes('aria-label="Buka notifikasi"'))
    expect(line).toBeTruthy()
    expect(line).toContain("size-11")
    expect(line).toContain('aria-label="Buka notifikasi"')
  })

  it("tombol Ganti tema 44px", () => {
    const src = source("src/components/ui/theme-toggle.tsx")
    const line = src.split("\n").find((l) => l.includes('aria-label="Ganti tema"'))
    expect(line).toBeTruthy()
    expect(line).toContain('className="size-11 relative"')
    expect(line).toContain('aria-label="Ganti tema"')
  })
})
