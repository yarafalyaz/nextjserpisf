/**
 * Display options for the financial statements (Laba Rugi / Neraca), mirroring
 * Accurate's "Parameter Laporan → Parameter Tambahan":
 *
 *   - Hanya Tampilkan Total   (totalsOnly)
 *   - Tampilkan Akun Induk    (showParents)
 *   - Tampilkan Akun Anak     (showChildren)
 *   - Tampilkan data dengan Saldo Nol (showZeroBalance)
 *   - Tampilkan Saldo Akun Induk      (showParentBalance)
 *
 * Pure by design (no Prisma) so the roll-up and indentation rules are
 * unit-testable — a wrong roll-up double-counts a parent's children into the
 * section total, which is exactly the kind of error that hides in a report.
 */

export interface StatementDisplayOptions {
  totalsOnly: boolean
  showParents: boolean
  showChildren: boolean
  showZeroBalance: boolean
  showParentBalance: boolean
}

export const DEFAULT_STATEMENT_OPTIONS: StatementDisplayOptions = {
  totalsOnly: false,
  showParents: true,
  showChildren: true,
  showZeroBalance: false,
  showParentBalance: true,
}

import { safeAdd } from "@/lib/utils/math"

const ZERO_EPSILON = 0.005

export interface StatementAccount {
  id: number
  code: string
  name: string
  parentId: number | null
  /** Saldo dari posting akun itu sendiri, TANPA anak-anaknya. */
  ownBalance: number
}

export interface StatementRow {
  id: number
  code: string
  name: string
  /** Saldo yang ditampilkan (roll-up induk atau saldo sendiri). */
  balance: number
  /** Indentasi tampilan (0 = tanpa induk terlihat). */
  level: number
  hasChildren: boolean
}

function byCode(a: { code: string }, b: { code: string }) {
  return a.code.localeCompare(b.code, "id-ID", { numeric: true })
}

/**
 * Flattens a chart of accounts into display rows: parents carry the rolled-up
 * balance of their children, children are indented beneath them.
 */
export function buildStatementRows(
  accounts: StatementAccount[],
  options: StatementDisplayOptions = DEFAULT_STATEMENT_OPTIONS,
): StatementRow[] {
  if (options.totalsOnly) return []

  const byId = new Map(accounts.map((account) => [account.id, account]))
  const childrenOf = new Map<number, StatementAccount[]>()
  const roots: StatementAccount[] = []

  for (const account of accounts) {
    // A parent that is not in the filtered list is treated as a root, so an
    // account is never silently dropped when its parent sits in another section.
    if (account.parentId !== null && byId.has(account.parentId)) {
      childrenOf.set(account.parentId, [...(childrenOf.get(account.parentId) ?? []), account])
    } else {
      roots.push(account)
    }
  }

  const rollupCache = new Map<number, number>()
  const rollup = (account: StatementAccount): number => {
    const cached = rollupCache.get(account.id)
    if (cached !== undefined) return cached
    const children = childrenOf.get(account.id) ?? []
    const total = children.reduce((sum, child) => safeAdd(sum, rollup(child), 2), account.ownBalance)
    rollupCache.set(account.id, total)
    return total
  }

  const rows: StatementRow[] = []

  const walk = (account: StatementAccount, level: number) => {
    const children = (childrenOf.get(account.id) ?? []).sort(byCode)
    const hasChildren = children.length > 0
    const balance = hasChildren && options.showParentBalance ? rollup(account) : account.ownBalance

    // Header rows describe the section structure, not data: they stay visible
    // whenever "Akun Induk" is on (an empty "BEBAN POKOK PENJUALAN" group is
    // still shown), so the zero-balance filter only applies to posting accounts.
    const rowVisible = hasChildren ? options.showParents : options.showChildren && (options.showZeroBalance || Math.abs(balance) >= ZERO_EPSILON)

    const childLevel = rowVisible ? level + 1 : level
    if (rowVisible) {
      rows.push({ id: account.id, code: account.code, name: account.name, balance, level, hasChildren })
    }
    // A hidden row promotes its children to its own level so no posting account
    // disappears from the report.
    for (const child of children) walk(child, childLevel)
  }

  for (const root of [...roots].sort(byCode)) walk(root, 0)

  return rows
}

/**
 * URL param per option. Short on purpose: these end up in the address bar, and
 * only non-default values are ever written (see `statementOptionsToParams`).
 */
export const STATEMENT_OPTION_PARAMS: Record<keyof StatementDisplayOptions, string> = {
  totalsOnly: "total",
  showParents: "induk",
  showChildren: "anak",
  showZeroBalance: "nol",
  showParentBalance: "saldo",
}

/** Param names used before the shortening — still accepted so old links work. */
const LEGACY_OPTION_PARAMS: Record<keyof StatementDisplayOptions, string> = {
  totalsOnly: "hanyaTotal",
  showParents: "akunInduk",
  showChildren: "akunAnak",
  showZeroBalance: "saldoNol",
  showParentBalance: "saldoInduk",
}

/** All option param names (current + legacy) for clearing them before rewriting. */
export function allStatementOptionParamNames(): string[] {
  return [...Object.values(STATEMENT_OPTION_PARAMS), ...Object.values(LEGACY_OPTION_PARAMS)]
}

/** Reads the display options from URL search params (all default to Accurate's defaults). */
export function parseStatementOptions(params: Record<string, string | undefined>): StatementDisplayOptions {
  const read = (key: keyof StatementDisplayOptions) => {
    const raw = params[STATEMENT_OPTION_PARAMS[key]] ?? params[LEGACY_OPTION_PARAMS[key]]
    return raw === undefined ? DEFAULT_STATEMENT_OPTIONS[key] : raw === "1"
  }
  return {
    totalsOnly: read("totalsOnly"),
    showParents: read("showParents"),
    showChildren: read("showChildren"),
    showZeroBalance: read("showZeroBalance"),
    showParentBalance: read("showParentBalance"),
  }
}

/** Serialises the options back into query params, skipping every default value. */
export function statementOptionsToParams(options: StatementDisplayOptions): Record<string, string> {
  const params: Record<string, string> = {}
  for (const key of Object.keys(STATEMENT_OPTION_PARAMS) as (keyof StatementDisplayOptions)[]) {
    if (options[key] !== DEFAULT_STATEMENT_OPTIONS[key]) {
      params[STATEMENT_OPTION_PARAMS[key]] = options[key] ? "1" : "0"
    }
  }
  return params
}

/**
 * How many display options differ from Accurate's defaults (0 = untouched).
 *
 * Drives the collapsed parameter panel's badge. It counts *deviations*, not
 * ticked boxes: three of the five options default to "on", so a tick count would
 * read "3 disesuaikan" on a report nobody has touched.
 */
export function countChangedStatementOptions(
  options: StatementDisplayOptions,
  percentColumn = false,
): number {
  const changed = (Object.keys(STATEMENT_OPTION_PARAMS) as (keyof StatementDisplayOptions)[])
    .filter((key) => options[key] !== DEFAULT_STATEMENT_OPTIONS[key]).length
  return changed + (percentColumn ? 1 : 0)
}

/**
 * Cookie that remembers the display options.
 *
 * These are viewing preferences, not part of "which report" — keeping them out
 * of the URL is what lets the address stay a pretty slug
 * (`/laporan/laba-rugi/2026-10`) while the toggles still stick across visits.
 */
export const STATEMENT_OPTIONS_COOKIE = "yara_laporan_tampilan"

const PERCENT_TOKEN = "persen"

/** Encodes only the enabled tokens, e.g. "total,nol,persen" (empty = all defaults off). */
export function encodeStatementOptions(options: StatementDisplayOptions, percentColumn = false): string {
  const tokens: string[] = []
  for (const key of Object.keys(STATEMENT_OPTION_PARAMS) as (keyof StatementDisplayOptions)[]) {
    const name = STATEMENT_OPTION_PARAMS[key]
    const isDefault = options[key] === DEFAULT_STATEMENT_OPTIONS[key]
    // A default-off option only needs a token when it is on; a default-on
    // option needs one when it is off (encoded as "!name").
    if (isDefault) continue
    tokens.push(options[key] ? name : `!${name}`)
  }
  if (percentColumn) tokens.push(PERCENT_TOKEN)
  return tokens.join(",")
}

export function decodeStatementOptions(value: string | undefined): {
  options: StatementDisplayOptions
  percentColumn: boolean
} {
  const options = { ...DEFAULT_STATEMENT_OPTIONS }
  if (!value) return { options, percentColumn: false }

  const tokens = value.split(",").map((token) => token.trim()).filter(Boolean)
  const byName = new Map(Object.entries(STATEMENT_OPTION_PARAMS).map(([key, name]) => [name, key as keyof StatementDisplayOptions]))

  for (const token of tokens) {
    if (token === PERCENT_TOKEN) continue
    const negated = token.startsWith("!")
    const key = byName.get(negated ? token.slice(1) : token)
    if (!key) continue
    options[key] = !negated
  }

  return { options, percentColumn: tokens.includes(PERCENT_TOKEN) }
}
