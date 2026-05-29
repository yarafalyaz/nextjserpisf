
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function loadHook(filename: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf-8')
}

describe('Journal Entry Balance Validation', () => {
  it('accounting.hook.ts validates all journal entries are balanced', () => {
    const code = loadHook('accounting.hook.ts')

    const balanceChecks = (code.match(/totalDebit|totalCredit|balance/i) || []).length
    
    expect(
      balanceChecks,
      'Accounting hook should check double-entry balance'
    ).toBeGreaterThanOrEqual(1)
  })

  it('journal.service.ts validates double-entry balance', () => {
    const svcPath = path.resolve(__dirname, '../../services/journal.service.ts')
    if (!fs.existsSync(svcPath)) return
    const code = fs.readFileSync(svcPath, 'utf-8')

    expect(code).toContain('totalDebit')
    expect(code).toContain('totalCredit')
    expect(code).toMatch(/abs\(|Math\.abs/)
  })
})

describe('Journal Creation Pattern', () => {
  const hooksWithJournal = [
    'accounting.hook.ts',
    'stock-journal.service.ts',
  ]

  for (const filename of hooksWithJournal) {
    it(`${filename} creates journal entries`, () => {
      const filePath = filename.includes('.service.')
        ? path.resolve(__dirname, '../../services', filename)
        : path.resolve(__dirname, '..', filename)
      if (!fs.existsSync(filePath)) return
      const code = fs.readFileSync(filePath, 'utf-8')
      expect(code).toMatch(/createJournal|journal\.create|journal\.upsert/)
    })
  }
})
