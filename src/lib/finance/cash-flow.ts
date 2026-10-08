/**
 * Pure cash-flow activity classification, extracted from the Arus Kas report
 * (`src/app/(dashboard)/laporan/arus-kas/page.tsx`) so the split into
 * operating / investing / financing can be unit-tested without Prisma.
 *
 * Method (indirect, per journal): for each journal that touches a cash account,
 * the cash delta is attributed to an activity based on the DOMINANT non-cash
 * counterpart line (largest absolute amount). This is the standard "dominant
 * counterpart" heuristic used when the accounting system has no explicit
 * cash-flow tagging: a cash sale attributes to operating (counterpart revenue /
 * receivable), buying a machine attributes to investing (counterpart fixed
 * asset), drawing a loan attributes to financing (counterpart liability/equity).
 */

export type CashFlowActivity = "operating" | "investing" | "financing"

export interface JournalLine {
  accountId: number
  /** Account type, e.g. ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE. */
  type: string
  /** Chart-of-accounts code, e.g. "1300" or "1-3-01". */
  code: string
  name: string
  debit: number
  credit: number
}

export interface ActivityTotals {
  operating: number
  investing: number
  financing: number
}

/**
 * Classify a single non-cash counterpart account into a cash-flow activity.
 *
 * Priority:
 *   - EQUITY                         -> financing
 *   - LIABILITY (pinjaman/loan/utang bank/modal) -> financing, else operating
 *   - ASSET: fixed-asset codes (1-3 / 13) or "aset tetap" name -> investing,
 *            else operating (receivables, inventory, prepayments)
 *   - everything else (REVENUE/EXPENSE) -> operating
 */
export function classifyCounterpart(acc: { type: string; code: string; name: string }): CashFlowActivity {
  const code = acc.code || ""
  const name = (acc.name || "").toLowerCase()
  if (acc.type === "EQUITY") return "financing"
  if (acc.type === "ASSET") {
    if (
      code.startsWith("1-3") ||
      code.startsWith("13") ||
      name.includes("aset tetap") ||
      name.includes("tetap")
    )
      return "investing"
    return "operating"
  }
  if (acc.type === "LIABILITY") {
    if (
      name.includes("pinjaman") ||
      name.includes("hutang bank") ||
      name.includes("loan") ||
      name.includes("modal")
    )
      return "financing"
    return "operating"
  }
  return "operating"
}

/**
 * Attribute the net cash change of a single journal to one activity.
 *
 * Returns `null` for journals that are not cash-relevant — i.e. no net cash
 * movement (inter-cash transfer, e.g. Kas -> Bank) or no non-cash counterpart.
 * Callers must skip `null` rather than adding 0, so a pure-cash movement cannot
 * be attributed to an arbitrary activity.
 *
 * NOTE: the returned value is the SIGNED cash delta (debit - credit over the
 * cash lines), so a cash outflow is negative.
 */
export function classifyJournal(
  lines: JournalLine[],
  isCashAccount: (accountId: number) => boolean,
): { activity: CashFlowActivity; cashDelta: number } | null {
  let cashDelta = 0
  const counterparts: { type: string; code: string; name: string; weight: number }[] = []

  for (const e of lines) {
    const d = Number(e.debit) || 0
    const c = Number(e.credit) || 0
    if (isCashAccount(e.accountId)) {
      cashDelta += d - c
    } else {
      counterparts.push({ type: e.type, code: e.code, name: e.name, weight: Math.abs(d - c) })
    }
  }

  if (cashDelta === 0 || counterparts.length === 0) return null

  const dominant = counterparts.reduce((a, b) => (b.weight > a.weight ? b : a))
  return { activity: classifyCounterpart(dominant), cashDelta }
}

/** Fold a set of classified journals into per-activity totals. */
export function foldActivities(
  classified: ({ activity: CashFlowActivity; cashDelta: number } | null)[],
): ActivityTotals {
  const totals: ActivityTotals = { operating: 0, investing: 0, financing: 0 }
  for (const c of classified) {
    if (c) totals[c.activity] += c.cashDelta
  }
  return totals
}
