import { vi } from "vitest"

// Shared stock-journal test scaffolding (Sonar duplication gate): mock
// fns + full account fixture used by stock-journal suite.
export function createStockJournalMocks() {
  return {
    getSystemSettings: vi.fn(),
    generateDocumentNumber: vi.fn(),
    createJournal: vi.fn(),
  }
}

export const STOCK_JOURNAL_FULL_ACCOUNTS = {
  inventoryAccountId: 100,
  stockAdjustmentAccountId: 200,
  inventoryAdjustmentAccountId: null,
  cogsAccountId: 300,
  wipAccountId: 400,
  materialExpenseAccountId: 500,
  materialIssueExpenseAccountId: 510,
  purchaseInventoryAccountId: 600,
  purchaseReturnAccountId: 700,
  salesReturnAccountId: 800,
  purchaseShippingAccountId: 620,
  purchaseAdminFeeAccountId: 630,
}

export function seedStockJournalMocks(
  mocks: ReturnType<typeof createStockJournalMocks>,
) {
  mocks.getSystemSettings.mockResolvedValue(STOCK_JOURNAL_FULL_ACCOUNTS)
  mocks.generateDocumentNumber.mockResolvedValue("JRN-001")
  mocks.createJournal.mockResolvedValue({ id: 1, journalNumber: "JRN-001" })
}
