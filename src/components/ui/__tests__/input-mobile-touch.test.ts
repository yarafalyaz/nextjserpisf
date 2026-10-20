import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("Input target sentuh 44px (360-430px)", () => {
  const src = source("src/components/ui/shadcn/input.tsx")

  it("tinggi 44px di mobile (h-11) dan 36px di md ke atas", () => {
    expect(src).toContain("h-11")
    expect(src).toContain("md:h-9")
    expect(src).not.toContain('"h-9 w-full')
  })
})
