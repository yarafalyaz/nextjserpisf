import { CATALOG_VERB_ORDER, type CatalogVerb } from "./module-catalog.generated"

/** Sel matriks: satu permission (verba × entitas) pada satu modul. */
export interface MatrixCell {
  verb: CatalogVerb
  permissionKey: string
  /** `null` = permission ada di katalog tapi belum ada barisnya di database. */
  permissionId: number | null
}

/** Baris matriks = entitas. */
export interface MatrixRow {
  resource: string
  label: string
  cells: MatrixCell[]
}

/** Satu kartu modul pada matriks izin. */
export interface MatrixModule {
  key: string
  name: string
  route: string | null
  icon: string | null
  columns: CatalogVerb[]
  rows: MatrixRow[]
}

/** Baris katalog seperti yang dibaca dari tabel `module_actions`. */
export interface CatalogRow {
  key: string
  resource: string
  permissionKey: string
  label: string
}

export interface CatalogModuleInput {
  key: string
  name: string
  route: string | null
  icon: string | null
  actions: CatalogRow[]
}

/**
 * Menyusun matriks izin dari katalog: baris digabung per `resource`, kolom = verba
 * yang benar-benar dipakai modul itu, urut mengikuti `CATALOG_VERB_ORDER`.
 *
 * `permissionIdByName` memetakan nama permission → id baris `permissions` (yang dipakai
 * checkbox untuk menulis `Role.permissions`). Permission yang belum ada di DB tetap
 * dilaporkan lewat `missingPermissionKeys` supaya UI bisa memperingatkan, bukan diam-diam
 * menampilkan kotak centang yang tidak menyimpan apa pun.
 */
export function buildPermissionMatrix(
  modules: CatalogModuleInput[],
  permissionIdByName: Map<string, number>,
): { matrix: MatrixModule[]; missingPermissionKeys: string[] } {
  const missingPermissionKeys: string[] = []

  const matrix = modules.map((mod) => {
    const rows: MatrixRow[] = []
    let current: MatrixRow | null = null

    for (const action of mod.actions) {
      if (!current || current.resource !== action.resource) {
        current = { resource: action.resource, label: action.label, cells: [] }
        rows.push(current)
      }
      const permissionId = permissionIdByName.get(action.permissionKey) ?? null
      if (permissionId === null) missingPermissionKeys.push(action.permissionKey)
      current.cells.push({
        verb: action.key as CatalogVerb,
        permissionKey: action.permissionKey,
        permissionId,
      })
    }

    const columns = CATALOG_VERB_ORDER.filter((verb) =>
      mod.actions.some((action) => (action.key as CatalogVerb) === verb),
    )

    return {
      key: mod.key,
      name: mod.name,
      route: mod.route,
      icon: mod.icon,
      columns,
      rows,
    }
  })

  return { matrix, missingPermissionKeys }
}
