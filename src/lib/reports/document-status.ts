/**
 * Document statuses that count as "recognised" in AR/AP & tax reports.
 *
 * A sales invoice / vendor bill only creates a receivable/payable and a tax
 * liability once it is ISSUED (posted). Draft, `sent` and `approved` documents
 * are not yet real obligations (and have no GL entry), so they must NOT leak
 * into financial reports — the previous `{ not: 'cancelled' }` /
 * `{ notIn: ['draft', 'cancelled'] }` filters wrongly admitted them.
 */
export const RECOGNISED_AR_STATUSES = ["posted", "partial", "paid"] as const
export const RECOGNISED_AP_STATUSES = ["posted", "partial", "paid"] as const
