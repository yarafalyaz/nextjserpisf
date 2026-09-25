#!/usr/bin/env node
/**
 * Assemble the Next.js standalone output so `node .next/standalone/server.js`
 * can serve the app.
 *
 * `output: "standalone"` (next.config.ts) is what production runs: the Dockerfile
 * copies `.next/standalone`, `.next/static` and `public` and starts `node server.js`.
 * Next.js deliberately does NOT copy the static assets into the standalone folder,
 * and `next start` is unsupported in this mode (it prints a warning), so local/e2e
 * runs must assemble the same tree - otherwise the tests exercise a different
 * runtime than production and a standalone-only breakage ships unnoticed.
 *
 * Idempotent: safe to run before every server start.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const nextDir = path.join(root, ".next")
const standalone = path.join(nextDir, "standalone")

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error(
    "[prepare-standalone] .next/standalone/server.js tidak ditemukan.\n" +
      "Jalankan `npm run build` lebih dulu (output: standalone menghasilkan folder ini).",
  )
  process.exit(1)
}

/** Copy a directory into the standalone tree unless it is already there. */
function sync(source, target, label) {
  if (!existsSync(source)) {
    console.warn(`[prepare-standalone] lewati ${label}: ${path.relative(root, source)} tidak ada`)
    return
  }
  mkdirSync(path.dirname(target), { recursive: true })
  cpSync(source, target, { recursive: true, force: true })
  console.log(`[prepare-standalone] ${label} -> ${path.relative(root, target)}`)
}

sync(path.join(nextDir, "static"), path.join(standalone, ".next", "static"), "static assets")
sync(path.join(root, "public"), path.join(standalone, "public"), "public files")
