import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8")
const lineWith = (rel: string, needle: string) =>
  read(rel).split("\n").find((l) => l.includes(needle))

describe("header target sentuh 44px (360-430px)", () => {
  it("SidebarTrigger 44px", () => {
    const src = read("src/components/ui/shadcn/sidebar.tsx")
    expect(src).toContain('data-sidebar="trigger"')
    // size-11 = 44px; size-9 = 36px di bawah target
    expect(src).toContain('className={cn("size-11", className)}')
    expect(src).not.toContain('className={cn("size-9", className)}')
  })

  it("tombol Cari mobile 44px", () => {
    const src = read("src/components/layout/header.tsx")
    const idx = src.indexOf('aria-label="Cari"')
    expect(idx).toBeGreaterThan(0)
    // className override wins via cn/tailwind-merge: size-11 = 44px; icon-sm = 32px
    expect(src.slice(Math.max(0, idx - 300), idx)).toContain("size-11 md:hidden")
  })

  it.each([
    ["Menu pengguna", "src/components/layout/header.tsx", 'className="size-11'],
    ["Buka notifikasi", "src/components/layout/notification-dropdown.tsx", "size-11"],
    ["Ganti tema", "src/components/ui/theme-toggle.tsx", 'className="size-11 relative'],
  ])("tombol %s 44px", (label, file, cls) => {
    const line = lineWith(file, `aria-label="${label}"`)
    expect(line).toContain(cls)
    expect(line).toContain(`aria-label="${label}"`)
  })
})
