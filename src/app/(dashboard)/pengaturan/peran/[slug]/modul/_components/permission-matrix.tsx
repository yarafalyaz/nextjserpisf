"use client"

import { useActionState, useMemo, useState } from "react"

import { ICON_MAP } from "@/lib/auth/modules"
import { permissionGroupLabel, permissionLabel } from "@/lib/auth/permission-labels"
import type { MatrixModule } from "@/lib/auth/permission-matrix"
import { SubmitButton } from "@/components/ui/submit-button"

/**
 * Matriks izin per peran: baris = entitas, kolom = verba aksi.
 *
 * Semua checkbox dikirim dalam SATU form ke `updateRole` (permission = `set`, jadi
 * yang tidak dicentang otomatis dicabut). Karena itu penyaringan (pencarian) hanya
 * MENYEMBUNYIKAN baris lewat CSS — kalau baris di-unmount, checkbox-nya ikut hilang
 * dari form dan izin yang sebenarnya masih dicentang akan tercabut tanpa disadari.
 */
export function PermissionMatrix({
  action,
  roleName,
  modules,
  checkedPermissionIds,
  missingPermissionKeys,
}: {
  action: (formData: FormData) => Promise<{ success: false; error: string } | void>
  roleName: string
  modules: MatrixModule[]
  checkedPermissionIds: number[]
  missingPermissionKeys: string[]
}) {
  const [query, setQuery] = useState("")
  const [checked, setChecked] = useState<Set<number>>(() => new Set(checkedPermissionIds))

  const [error, formAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const result = await action(formData)
      return result && result.success === false ? result.error : null
    },
    null,
  )

  const total = useMemo(
    () => modules.reduce((sum, mod) => sum + mod.rows.reduce((n, row) => n + row.cells.length, 0), 0),
    [modules],
  )

  const toggle = (permissionId: number, next: boolean) => {
    setChecked((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(permissionId)
      else copy.delete(permissionId)
      return copy
    })
  }

  const setMany = (ids: number[], next: boolean) => {
    setChecked((prev) => {
      const copy = new Set(prev)
      for (const id of ids) {
        if (next) copy.add(id)
        else copy.delete(id)
      }
      return copy
    })
  }

  const q = query.trim().toLowerCase()

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Form posts the role name unchanged (updateRole memvalidasi field ini). */}
      <input type="hidden" name="name" value={roleName} />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}

      {missingPermissionKeys.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <strong>{missingPermissionKeys.length} izin belum ada di database</strong> — matriks di
          bawah menampilkannya tanpa kotak centang sampai katalog di-seed
          (<code className="font-mono text-xs">npm run db:seed</code>). Contoh:{" "}
          <span className="font-mono text-xs">{missingPermissionKeys.slice(0, 3).join(", ")}</span>
        </div>
      )}

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-default bg-surface/95 px-4 py-3 backdrop-blur">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari izin (mis. faktur, barang, pesanan pembelian)…"
          aria-label="Cari izin"
          className="h-9 w-full max-w-xs rounded-lg border border-default bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <span className="text-sm text-muted-foreground">
          {checked.size} dari {total} izin dicentang
        </span>
        <SubmitButton className="ml-auto" variant="primary" pendingLabel="Menyimpan...">
          Simpan Perubahan
        </SubmitButton>
      </div>

      {modules.map((mod) => {
        const Icon = mod.icon ? ICON_MAP[mod.icon] : null
        const moduleIds = mod.rows.flatMap((row) => row.cells.map((c) => c.permissionId).filter((id): id is number => id !== null))
        const visibleRows = q
          ? mod.rows.filter(
              (row) =>
                row.label.toLowerCase().includes(q) ||
                row.resource.includes(q) ||
                row.cells.some((c) => c.permissionKey.includes(q)),
            )
          : mod.rows

        return (
          <section key={mod.key} className="rounded-xl border border-default bg-surface shadow-sm">
            <header className="flex flex-wrap items-center gap-3 border-b border-default px-4 py-3">
              {Icon && <Icon className="size-5 text-primary" />}
              <h2 className="text-[0.9375rem] font-semibold text-foreground">{mod.name}</h2>
              {mod.route && (
                <code className="font-mono text-xs text-muted-foreground">{mod.route}</code>
              )}
              <span className="text-xs text-muted-foreground">{mod.rows.length} baris</span>
              <button
                type="button"
                onClick={() => setMany(moduleIds, !moduleIds.every((id) => checked.has(id)))}
                className="ml-auto rounded-md border border-default px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-secondary"
              >
                {moduleIds.every((id) => checked.has(id)) ? "Kosongkan modul" : "Pilih semua modul"}
              </button>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Entitas</th>
                    {mod.columns.map((verb) => (
                      <th key={verb} className="px-3 py-2 text-center font-medium">
                        {permissionGroupLabel(verb)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mod.rows.map((row) => {
                    const hidden = q.length > 0 && !visibleRows.includes(row)
                    const rowIds = row.cells.map((c) => c.permissionId).filter((id): id is number => id !== null)
                    return (
                      <tr
                        key={`${mod.key}-${row.resource}`}
                        className={hidden ? "hidden" : "border-t border-default/60"}
                      >
                        <td className="px-4 py-2">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={rowIds.length > 0 && rowIds.every((id) => checked.has(id))}
                              onChange={(e) => setMany(rowIds, e.target.checked)}
                              className="size-3.5 accent-primary"
                              aria-label={`Pilih semua aksi untuk ${row.label}`}
                            />
                            <span className="font-medium text-foreground">{row.label}</span>
                            <code className="font-mono text-[0.6875rem] text-muted-foreground">
                              {row.resource}
                            </code>
                          </label>
                        </td>
                        {mod.columns.map((verb) => {
                          const cell = row.cells.find((c) => c.verb === verb)
                          if (!cell) return <td key={verb} className="px-3 py-2" />
                          if (cell.permissionId === null) {
                            return (
                              <td key={verb} className="px-3 py-2 text-center text-xs text-muted-foreground">
                                belum di-seed
                              </td>
                            )
                          }
                          const id = cell.permissionId
                          return (
                            <td key={verb} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                name="permissions"
                                value={id}
                                checked={checked.has(id)}
                                onChange={(e) => toggle(id, e.target.checked)}
                                className="size-4 accent-primary"
                                aria-label={`${row.label} — ${permissionGroupLabel(verb)}`}
                                title={permissionLabel(cell.permissionKey)}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </form>
  )
}
