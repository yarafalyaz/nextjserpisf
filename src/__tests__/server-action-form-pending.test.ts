import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/**
 * Form yang men-submit ke server action harus punya penjaga pending.
 *
 * Kelas bug ini pernah nyata: form peran/persetujuan memakai
 * `<form action={serverAction}>` dengan `<Button type="submit">` biasa, dan
 * repo tidak memakai `useFormStatus`/`useActionState` sama sekali. Akibatnya
 * tombol tetap bisa diklik saat action berjalan — dua klik = dua kali aksi
 * (peran dibuat dobel, langkah approval diproses dobel).
 *
 * Aturannya: berkas yang menyerahkan server action ke form (`<form action={…}>`,
 * `formAction={…}`, atau `<ActionForm …>`) wajib memakai `SubmitButton`, satu-
 * satunya komponen di repo yang membaca `useFormStatus()`.
 */

const root = path.resolve(__dirname, "../..")
const SUBMITS_TO_SERVER_ACTION = /<form action=\{|\bformAction=\{|<ActionForm\s/
/** Pembungkus bersama: `ActionForm` sendiri tidak memilih tombolnya, dan
 *  `SubmitButton` justru komponen penjaganya — keduanya bukan pemakaian. */
const GUARD_COMPONENTS = ["components/ui/action-form.tsx", "components/ui/submit-button.tsx"]

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
    const rel = path.relative(root, file).split(path.sep).join("/")
    if (rel.includes("__tests__")) continue
    if (GUARD_COMPONENTS.some((guard) => rel.endsWith(guard))) continue
    const source = readFileSync(file, "utf8")
    if (!SUBMITS_TO_SERVER_ACTION.test(source)) continue
    if (source.includes("SubmitButton")) continue
    found.push(rel)
  }
  return found
}

describe("form server action punya penjaga pending", () => {
  it("penjaga tes itu sendiri menemukan form ber-server-action", () => {
    const files = tsxFiles(path.join(root, "src")).filter(
      (file) =>
        !file.includes("__tests__") &&
        SUBMITS_TO_SERVER_ACTION.test(readFileSync(file, "utf8")),
    )
    expect(files.length).toBeGreaterThan(0)
  })

  it("setiap form ber-server-action memakai SubmitButton", () => {
    expect(offenders()).toEqual([])
  })
})
