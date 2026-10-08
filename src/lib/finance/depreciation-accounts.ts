/**
 * Resolve the GL accounts an asset depreciation journal must post to.
 *
 * Precedence (first non-zero wins), per account:
 *   1. The asset's CATEGORY mapping  (`AssetCategory.depreciationExpenseAccountId`
 *      / `accumulatedDepreciationAccountId`). This is the most specific and the
 *      only per-asset-class control an accountant has (e.g. vehicles vs
 *      machinery may sit in different accumulated-depreciation accounts).
 *   2. The global SystemSetting mapping (UI: Pengaturan → Mapping Akun).
 *   3. The legacy environment variables, kept for backwards compatibility with
 *      deployments that configured depreciation before the UI existed.
 *
 * Returns 0 for a slot that is unset everywhere; the caller decides whether that
 * is a hard error (cron) or a silent skip (opportunistic posting). Extracted
 * from the cron route so the precedence can be unit-tested without Prisma.
 */

export interface DepreciationAccountSources {
  /** AssetCategory.depreciationExpenseAccountId (or null when no category). */
  categoryExpenseAccountId?: number | null
  /** AssetCategory.accumulatedDepreciationAccountId (or null). */
  categoryAccumDepAccountId?: number | null
  /** SystemSetting.depreciationExpenseAccountId (or null). */
  settingsExpenseAccountId?: number | null
  /** SystemSetting.accumulatedDepreciationAccountId (or null). */
  settingsAccumDepAccountId?: number | null
  /** process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID (raw string or number). */
  envExpenseAccountId?: string | number | null
  /** process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID (raw string or number). */
  envAccumDepAccountId?: string | number | null
}

export interface ResolvedDepreciationAccounts {
  expenseAccountId: number
  accumulatedAccountId: number
}

/** Coerce to a positive integer id, or 0 when unset/invalid/zero. */
function toAccountId(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
}

/**
 * Pick the first positive id among the candidates (order = precedence).
 */
function firstPositive(...candidates: (string | number | null | undefined)[]): number {
  for (const c of candidates) {
    const id = toAccountId(c)
    if (id > 0) return id
  }
  return 0
}

export function resolveDepreciationAccounts(
  sources: DepreciationAccountSources,
): ResolvedDepreciationAccounts {
  return {
    expenseAccountId: firstPositive(
      sources.categoryExpenseAccountId,
      sources.settingsExpenseAccountId,
      sources.envExpenseAccountId,
    ),
    accumulatedAccountId: firstPositive(
      sources.categoryAccumDepAccountId,
      sources.settingsAccumDepAccountId,
      sources.envAccumDepAccountId,
    ),
  }
}

/** True when BOTH depreciation accounts resolved to a real id. */
export function hasCompleteDepreciationAccounts(accounts: ResolvedDepreciationAccounts): boolean {
  return accounts.expenseAccountId > 0 && accounts.accumulatedAccountId > 0
}
