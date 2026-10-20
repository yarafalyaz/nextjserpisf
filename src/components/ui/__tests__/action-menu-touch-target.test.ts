
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ACTION_BUTTONS = [
  "src/components/ui/action-dropdown.tsx",
  "src/components/ui/draft-release-actions.tsx",
  "src/app/(dashboard)/produksi/bom-revisi/_components/bom-revision-actions.tsx",
]

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("tombol menu aksi target sentuh 44px (360-430px)", () => {
  it.each(ACTION_BUTTONS)("trigger Buka menu aksi berukuran 44px: %s", (rel) => {
    const src = source(rel)
    const trigger = src.split("\n").find((line) => line.includes('aria-label="Buka menu aksi"'))
    expect(trigger, `${rel}: trigger tidak ditemukan`).toBeTruthy()
    // size-11 = 44px; size="icon" saja = size-9 = 36px (<44px)
    expect(trigger).toContain('className="size-11"')
    expect(trigger).toContain('aria-label="Buka menu aksi"')
  })
})
