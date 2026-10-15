import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/**
 * `text-white` hanya aman di atas permukaan yang tetap gelap di kedua tema.
 * Token semantik (`--color-primary`, `--color-success`, `--color-warning`,
 * `--color-danger`, `--color-info`) justru BERTERBALIK menjadi terang di dark
 * mode (globals.css `html.dark`), sehingga pasangan `bg-success text-white`
 * menghasilkan teks putih di atas hijau terang — terbaca ~1.9:1 dan praktis
 * hilang untuk `bg-primary text-white` (1.04:1).
 *
 * Aturannya: setiap baris yang memakai `text-white` bersama token tersebut harus
 * memakai token foreground pasangannya (`text-success-foreground`,
 * `text-warning-foreground`, `text-primary-foreground`, …) — atau, bila
 * permukaannya memang digelapkan kembali dengan `dark:bg-*`, pengecualian itu
 * dianggap sadar dan lolos.
 */

const root = path.resolve(__dirname, "../..")
const TOKENS = ["primary", "success", "warning", "danger", "destructive", "info"]
const BARE_TOKEN_BG = new RegExp(`\\bbg-(${TOKENS.join("|")})(?![\\w-])`)
const DARK_OVERRIDE = /\bdark:bg-/

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(full))
    else if (entry.name.endsWith(".tsx")) out.push(full)
  }
  return out
}

function offenders(): string[] {
  const found: string[] = []
  for (const file of tsxFiles(path.join(root, "src"))) {
    const lines = readFileSync(file, "utf8").split("\n")
    lines.forEach((line, index) => {
      if (!line.includes("text-white")) return
      if (!BARE_TOKEN_BG.test(line)) return
      if (DARK_OVERRIDE.test(line)) return
      found.push(`${path.relative(root, file)}:${index + 1}`)
    })
  }
  return found
}

describe("kontras token di dark mode", () => {
  it("penjaga tes itu sendiri memindai berkas .tsx", () => {
    expect(tsxFiles(path.join(root, "src")).length).toBeGreaterThan(100)
  })

  it("tidak ada `text-white` di atas token semantik yang jadi terang di dark", () => {
    expect(offenders()).toEqual([])
  })

  it("utility foreground pasangan token semantik terdaftar di globals.css", () => {
    const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8")
    for (const name of ["success", "warning"]) {
      expect(css).toContain(`--color-${name}-foreground: var(--${name}-foreground);`)
      expect(css).toMatch(new RegExp(`--${name}-foreground: #[0-9a-f]{6};`))
    }
  })
})
