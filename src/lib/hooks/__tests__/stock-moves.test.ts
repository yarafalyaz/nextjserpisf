
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function loadHook(filename: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf-8')
}

describe('Stock Move Hooks: posted status parity', () => {
  const stockHooks = [
    'goods-receipt.hook.ts',
    'material-issue.hook.ts',
    'purchase-return.hook.ts',
    'sales-return.hook.ts',
    'stock-adjustment.hook.ts',
    'work-order.hook.ts',
    'inventory-transfer.hook.ts',
  ]

  for (const hookFile of stockHooks) {
    it(`${hookFile} creates posted stock moves`, () => {
      const code = loadHook(hookFile)

      if (!code.includes('stockMove.create')) {
        return
      }

      expect(code).toMatch(/status:\s*["']posted["']/)
    })
  }
})

describe('FIFO layer handling parity', () => {
  const inboundHooks = ['goods-receipt.hook.ts', 'sales-return.hook.ts', 'inventory-transfer.hook.ts']
  const outboundHooks = [
    'material-issue.hook.ts',
    'purchase-return.hook.ts',
    'stock-adjustment.hook.ts',
    'work-order.hook.ts',
    'inventory-transfer.hook.ts',
  ]

  for (const hookFile of inboundHooks) {
    it(`${hookFile} creates inventory layer on IN moves`, () => {
      const code = loadHook(hookFile)
      expect(code).toContain('inventoryLayer.create')
      expect(code).toMatch(/qtyIn/)
      expect(code).toMatch(/remaining/)
    })
  }

  for (const hookFile of outboundHooks) {
    it(`${hookFile} consumes FIFO layers on OUT moves`, () => {
      const code = loadHook(hookFile)
      expect(code).toContain('inventoryLayer.findMany')
      expect(code).toContain('remaining')
      expect(code).toContain('qtyOut')
      expect(code).toMatch(/orderBy:\s*\{\s*createdAt:\s*["']asc["']/)
    })
  }
})

describe('Qty on hand updates', () => {
  const stockHooks = [
    'goods-receipt.hook.ts',
    'material-issue.hook.ts',
    'purchase-return.hook.ts',
    'sales-return.hook.ts',
    'stock-adjustment.hook.ts',
    'work-order.hook.ts',
    'inventory-transfer.hook.ts',
  ]

  for (const hookFile of stockHooks) {
    it(`${hookFile} updates items.qty_on_hand`, () => {
      const code = loadHook(hookFile)
      expect(code).toContain('qty_on_hand')
    })
  }
})
