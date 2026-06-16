import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

/**
 * Regression test for a TOCTOU race condition in updateDownPayment.
 *
 * Bug: `updateDownPayment` opened a `prisma.$transaction` that performed the
 * `SELECT ... FOR UPDATE` lock and the cumulative aggregate, then RETURNED the
 * aggregate. The transaction committed (and the row lock was released) BEFORE
 * the cap check and the actual `downPayment.update` executed. Two concurrent
 * updates — or a create racing an update — could therefore both pass the
 * cumulative cap and together over-pay the quotation grandTotal. The action's
 * own comment claimed it "Mirrors the createDownPayment lock pattern", but
 * createDownPayment keeps lock + check + write INSIDE the same transaction.
 *
 * This is a static structural test (no DB required): it parses
 * sales.actions.ts, isolates the body of `updateDownPayment`, brace-matches
 * its `prisma.$transaction(async (tx) => { ... })` block, and asserts the
 * down-payment WRITE happens inside that block — i.e. the lock spans the whole
 * read-check-write critical section. Before the fix this fails (write sits
 * after the tx closes); after the fix it passes.
 */
describe("updateDownPayment transactional lock scope", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../actions/sales.actions.ts"),
    "utf8"
  )

  /** Extract a top-level `export async function <name>` body via index slicing. */
  function extractFn(name: string): string {
    const startMarker = `export async function ${name}(`
    const start = src.indexOf(startMarker)
    if (start === -1) throw new Error(`Could not locate ${name} in sales.actions.ts`)
    // Next top-level function declaration after this one (or EOF).
    const next = src.indexOf("\nexport async function ", start + startMarker.length)
    return src.slice(start, next === -1 ? undefined : next)
  }

  /**
   * Given a string and the index of an opening `{`, return the index just
   * past its matching `}` using brace counting (string/template literals in
   * this codebase don't contain unbalanced braces in these blocks).
   */
  function matchBrace(s: string, openIdx: number): number {
    let depth = 0
    for (let i = openIdx; i < s.length; i++) {
      const ch = s[i]
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) return i + 1
      }
    }
    throw new Error("Unbalanced braces")
  }

  it("wraps lock + cap check + down-payment WRITE in the SAME transaction", () => {
    const fn = extractFn("updateDownPayment")

    const txCall = fn.indexOf("prisma.$transaction(async (tx) =>")
    expect(txCall, "updateDownPayment must open a prisma.$transaction").toBeGreaterThan(-1)

    // Locate the opening brace of the transaction callback body.
    const bodyOpen = fn.indexOf("{", txCall)
    expect(bodyOpen).toBeGreaterThan(-1)
    const txEnd = matchBrace(fn, bodyOpen)
    const inside = fn.slice(bodyOpen, txEnd)

    // Lock + aggregate must be inside the transaction (pre-existing, correct).
    expect(inside, "FOR UPDATE lock must be inside the tx").toMatch(/FOR\s+UPDATE/i)
    expect(inside, "cumulative aggregate must be inside the tx").toMatch(/downPayment\.aggregate/)

    // The cumulative cap check must be inside the transaction so the lock
    // still covers it.
    expect(inside, "cap check must be inside the tx").toMatch(/melebihi nilai quotation/)

    // The WRITE must also be inside the transaction. THIS is what the bug
    // violated — the update sat after the tx callback closed, outside the
    // lock. `.downPayment.update` matches both `tx.` and `prisma.` callers.
    expect(inside, "down-payment update must be inside the tx").toMatch(/\.downPayment\.update/)
  })
})
