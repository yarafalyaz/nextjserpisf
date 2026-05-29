
import { describe, it, expect } from 'vitest'

/**
 * Idempotency Guard Tests (White-box validation)
 *
 * Validates that ALL hooks follow the idempotency pattern:
 * - existingMoves → return silently (never throw)
 * - status guard → return silently (never throw)
 *
 * These tests validate the CODE PATTERN, not runtime behavior.
 * Each hook is parsed to verify it uses 'return' not 'throw' in guards.
 */

import * as fs from 'fs'
import * as path from 'path'

function loadHook(filename: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, '..', filename),
    'utf-8'
  )
}

const HOOKS = [
  'goods-receipt.hook.ts',
  'material-issue.hook.ts',
  'purchase-return.hook.ts',
  'sales-return.hook.ts',
  'stock-adjustment.hook.ts',
  'work-order.hook.ts',
  'inventory-transfer.hook.ts',
  'down-payment.hook.ts',
  'expense.hook.ts',
]

describe('Idempotency: no throw in guards', () => {
  for (const hookFile of HOOKS) {
    it(`${hookFile} has no throw on duplicate/guard`, () => {
      const code = loadHook(hookFile)

      // Check: no "throw" near "sudah" (Indonesian error messages for duplicate)
      const throwOnDuplicate = code.match(
        /throw\s+new\s+Error\([^)]*(?:sudah|already)[^)]*\)/gi
      )

      expect(
        throwOnDuplicate,
        `${hookFile} has throw in duplicate guard — must use 'return' instead`
      ).toBeNull()
    })

    it(`${hookFile} uses 'return' after existing checks`, () => {
      const code = loadHook(hookFile)

      // All hooks should have some form of early return
      const hasReturn = code.includes('return;')
      expect(
        hasReturn,
        `${hookFile} has no early return — idempotency requires at least one 'return;'`
      ).toBe(true)
    })
  }
})

describe('Idempotency: Pattern consistency', () => {
  for (const hookFile of HOOKS) {
    it(`${hookFile} has idempotency comment or guard`, () => {
      const code = loadHook(hookFile)
      const patterns = [
        /[Ii]dempoten/i,
        /existingMoves\)/,
        /existing.*return/,
      ]
      const hasPattern = patterns.some((p) => p.test(code))
      expect(
        hasPattern,
        `${hookFile} has no idempotency check pattern`
      ).toBe(true)
    })
  }
})
