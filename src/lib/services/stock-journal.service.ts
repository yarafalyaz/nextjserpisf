import { JournalService } from '@/lib/services/journal.service'
import { generateDocumentNumber } from '@/lib/utils/document-number'
import { getSystemSettings } from '@/lib/utils/settings'
import type { Prisma } from '@prisma/client'

/**
 * Stock Journal Service — creates journal entries for inventory movements.
 * Called from stock hooks AFTER stock moves are created.
 *
 * Standard double-entry for each stock event type.
 * Account references come from SystemSettings (configurable per tenant).
 */

interface JournalItemInput {
  itemId?: number
  qty: number
  cost: number
}

type AccountIds = {
  inventory?: number | null
  stockAdj?: number | null
  cogs?: number | null
  wip?: number | null
  materialExpense?: number | null
  materialIssueExpense?: number | null
  purchaseInventory?: number | null
  purchaseReturn?: number | null
  salesReturn?: number | null
  purchaseShipping?: number | null
  purchaseAdminFee?: number | null
}

async function getAccountIds(): Promise<AccountIds> {
  const s = await getSystemSettings()
  return {
    inventory: s.inventoryAccountId,
    stockAdj: s.stockAdjustmentAccountId ?? s.inventoryAdjustmentAccountId,
    cogs: s.cogsAccountId,
    wip: s.wipAccountId,
    materialExpense: s.materialExpenseAccountId,
    materialIssueExpense: s.materialIssueExpenseAccountId,
    purchaseInventory: s.purchaseInventoryAccountId,
    purchaseReturn: s.purchaseReturnAccountId,
    salesReturn: s.salesReturnAccountId,
    purchaseShipping: s.purchaseShippingAccountId,
    purchaseAdminFee: s.purchaseAdminFeeAccountId,
  }
}

function sumValue(items: JournalItemInput[]): number {
  return items.reduce((s, i) => s + Number(i.qty) * Number(i.cost), 0)
}

// ────────────────────────────────────────────────────────────────────────────
// Stock Journal Service
// ────────────────────────────────────────────────────────────────────────────

export const stockJournalService = {
  /**
   * Goods Receipt (verified) — Stock IN from vendor.
   *
   *   Dr Inventory Account          (inventoryAccountId)          — goods value
   *   Dr Ongkos Kirim Account       (purchaseShippingAccountId)   — freight/other
   *   Dr Beban Admin Bank Account   (purchaseAdminFeeAccountId)   — bank/admin fee
   *   Cr Purchase Inventory Account  (purchaseInventoryAccountId — clearing)
   *
   * The three debits always sum to the credit. When the split arrays are not
   * supplied, or the freight/admin accounts are not configured, the whole value
   * is posted as a single blended Inventory debit (legacy behaviour) so the
   * journal still balances.
   *
   * Purchase Inventory account acts as clearing/suspense and gets reversed
   * when vendor bill is entered.
   */
  async onGoodsReceipt(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    grDocumentNo: string,
    grId: number,
    userId?: number,
    costCenterId?: number | null,
    transactionDate?: Date,
    goodsOnlyLines?: JournalItemInput[],
    shippingLines?: JournalItemInput[],
    adminLines?: JournalItemInput[],
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.purchaseInventory) {
      throw new Error(
        "Akun Persediaan dan Akun Clearing Pembelian (purchaseInventory) harus diatur di Pengaturan → Akuntansi sebelum penerimaan barang bisa dijurnal.",
      )
    }

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const entries: {
      accountId: number
      debit: number
      credit: number
      memo: string
    }[] = []

    // Split the debit into goods / freight / admin when both the line slices and
    // the target accounts are available; otherwise post one blended Inventory
    // debit. All components are rounded to 2dp and the goods leg is the exact
    // residual of the ROUNDED total, so Σdebits === totalValue exactly (JournalService
    // rejects any imbalance > 0.001 — sub-cent landed-cost splits used to break it).
    const round2 = (n: number) => Math.round(n * 100) / 100
    const totalRounded = round2(totalValue)
    const shippingValue = round2(shippingLines ? sumValue(shippingLines) : 0)
    const adminValue = round2(adminLines ? sumValue(adminLines) : 0)
    const canSplit =
      !!goodsOnlyLines &&
      accounts.purchaseAdminFee != null &&
      adminValue > 0

    if (canSplit) {
      // Persediaan absorbs whatever is left after the rounded freight/admin, so
      // the debits always sum back to totalRounded.
      const residualGoods = round2(
        totalRounded -
          (shippingValue !== 0 && accounts.purchaseShipping != null ? shippingValue : 0) -
          adminValue,
      )
      entries.push({
        accountId: accounts.inventory,
        debit: residualGoods,
        credit: 0,
        memo: `Debit Persediaan (barang) - GR ${grDocumentNo}`,
      })
      if (shippingValue !== 0 && accounts.purchaseShipping != null) {
        entries.push({
          accountId: accounts.purchaseShipping,
          debit: shippingValue,
          credit: 0,
          memo: `Debit Ongkir - GR ${grDocumentNo}`,
        })
      }
      if (adminValue !== 0) {
        entries.push({
          accountId: accounts.purchaseAdminFee!,
          debit: adminValue,
          credit: 0,
          memo: `Debit Beban Admin Bank - GR ${grDocumentNo}`,
        })
      }
    } else {
      entries.push({
        accountId: accounts.inventory,
        debit: totalRounded,
        credit: 0,
        memo: `Debit Persediaan - GR ${grDocumentNo}`,
      })
    }

    entries.push({
      accountId: accounts.purchaseInventory!,
      debit: 0,
      credit: totalRounded,
      memo: `Kredit Hutang Pembelian (clearing) - GR ${grDocumentNo}`,
    })

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'GoodsReceipt',
      referenceId: grId,
      type: 'GR',
      description: `Penerimaan Barang ${grDocumentNo}`,
      createdBy: userId,
      entries,
    })
  },

  /**
   * Service Goods Receipt (verified) — a vendor performs labour/subcontract
   * (coating, machining, laser cutting). There is NO stock movement; the cost is
   * expensed directly.
   *
   *   Dr Material/Service Expense   (materialExpense → materialIssueExpense → cogs)
   *   Cr Purchase Inventory Account  (clearing)
   *
   * The credit side mirrors onGoodsReceipt so the vendor bill reverses the same
   * clearing account, keeping inventory purchases and service purchases on one
   * suspense account (PRD FAB-08 / PUR-17).
   */
  async onServiceGoodsReceipt(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    grDocumentNo: string,
    grId: number,
    userId?: number,
    costCenterId?: number | null,
    transactionDate?: Date
  ) {
    const accounts = await getAccountIds()
    const expenseAcct = accounts.materialExpense ?? accounts.materialIssueExpense ?? accounts.cogs
    if (!expenseAcct || !accounts.purchaseInventory) {
      throw new Error(
        "Akun beban (Beban Material/HPP) dan Akun Clearing Pembelian harus diatur di Pengaturan → Akuntansi sebelum penerimaan jasa bisa dijurnal.",
      )
    }

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'GoodsReceipt',
      referenceId: grId,
      type: 'GR',
      description: `Penerimaan Jasa ${grDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: expenseAcct,
          debit: totalValue,
          credit: 0,
          memo: `Debit Biaya Jasa/Subkontrak - GR ${grDocumentNo}`,
        },
        {
          accountId: accounts.purchaseInventory!,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Hutang Pembelian (clearing) - GR ${grDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Stock Adjustment (processed) — Stock IN/OUT from physical count.
   *
   *   If net increase (count > system):
   *     Dr Inventory Account
   *     Cr Stock Adjustment Account
   *
   *   If net decrease (count < system):
   *     Dr Stock Adjustment Account
   *     Cr Inventory Account
   */
  async onStockAdjustment(
    tx: Prisma.TransactionClient,
    items: Array<JournalItemInput & { difference: number }>,
    adjDocumentNo: string,
    adjId: number,
    userId?: number,
    costCenterId?: number | null,
    transactionDate?: Date
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.stockAdj) return null

    // Net value change = sum of (difference × unitCost)
    const netValue = items.reduce(
      (s, i) => s + Number(i.difference) * Number(i.cost),
      0
    )
    if (Math.abs(netValue) <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)

    const isIncrease = netValue > 0
    const absValue = Math.abs(netValue)

    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'StockAdjustment',
      referenceId: adjId,
      type: 'ADJ',
      description: `Penyesuaian Stok ${adjDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: isIncrease ? accounts.inventory : accounts.stockAdj!,
          debit: absValue,
          credit: 0,
          memo: `Debit - Adj ${adjDocumentNo}`,
        },
        {
          accountId: isIncrease ? accounts.stockAdj! : accounts.inventory,
          debit: 0,
          credit: absValue,
          memo: `Kredit - Adj ${adjDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Material Issue (completed) — Stock OUT for production.
   *
   *   Dr Material Expense / COGS
   *   Cr Inventory Account
   */
  async onMaterialIssue(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    miDocumentNo: string,
    miId: number,
    userId?: number,
    costCenterId?: number | null,
    transactionDate?: Date
  ) {
    const accounts = await getAccountIds()
    const expenseAcct = accounts.materialIssueExpense ?? accounts.materialExpense ?? accounts.cogs
    if (!accounts.inventory || !expenseAcct) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'MaterialIssue',
      referenceId: miId,
      type: 'MI',
      description: `Pengeluaran Material ${miDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: expenseAcct,
          debit: totalValue,
          credit: 0,
          memo: `Debit Beban Material - MI ${miDocumentNo}`,
          costCenterId: costCenterId ?? null,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Persediaan - MI ${miDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Sales Return (completed) — Stock IN from customer.
   *
   *   Dr Inventory Account
   *   Cr Sales Return Account
   */
  async onSalesReturn(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    srDocumentNo: string,
    srId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.salesReturn) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'SalesReturn',
      referenceId: srId,
      type: 'SR',
      description: `Retur Penjualan ${srDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.inventory,
          debit: totalValue,
          credit: 0,
          memo: `Debit Persediaan - Retur ${srDocumentNo}`,
        },
        {
          accountId: accounts.salesReturn!,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Retur Penjualan - ${srDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Purchase Return (processed) — Stock OUT to vendor.
   *
   *   Dr Purchase Return Account
   *   Cr Inventory Account
   */
  async onPurchaseReturn(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    prDocumentNo: string,
    prId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.purchaseReturn) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'PurchaseReturn',
      referenceId: prId,
      type: 'PR',
      description: `Retur Pembelian ${prDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.purchaseReturn!,
          debit: totalValue,
          credit: 0,
          memo: `Debit Retur Pembelian - ${prDocumentNo}`,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Persediaan - ${prDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Work Order (completed) — Materials OUT to WIP.
   *
   *   Dr WIP Account
   *   Cr Inventory Account
   */
  /** Production-order material issue — transfer material value from inventory to WIP. */
  async onProductionOrderMaterialIssue(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    productionOrderNo: string,
    referenceStockMoveId: number,
    userId?: number,
    transactionDate?: Date,
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.wip) {
      throw new Error("Akun Persediaan dan Barang Dalam Proses harus diatur sebelum material produksi dikeluarkan.")
    }

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'ProductionOrderMaterialIssue',
      // A stock move ID is unique per issue transaction and provides a stable
      // journal reference even when one order is issued in several batches.
      referenceId: referenceStockMoveId,
      type: 'PROD',
      description: `Pemakaian Material Produksi ${productionOrderNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.wip,
          debit: totalValue,
          credit: 0,
          memo: `Debit Barang Dalam Proses - ${productionOrderNo}`,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Persediaan - ${productionOrderNo}`,
        },
      ],
    })
  },

  /**
   * Non-material production cost absorbed into WIP (labor/machine/overhead/
   * subcontract/service/rework — PRD FAB-06..09).
   *
   * Material value enters WIP via `onProductionOrderMaterialIssue`; the finished-
   * goods receipt later credits WIP by the order's FULL actual cost (material +
   * non-material). Without this debit the non-material portion would be credited
   * out of WIP without ever being debited, driving WIP negative per job and
   * leaving the GL unbalanced. Credits the configured absorption account
   * (materialExpense → materialIssueExpense → cogs). Fails closed when WIP or the
   * absorption account is unconfigured. Positive `amount` absorbs cost; negative
   * reverses it (debit/credit swapped).
   */
  async onProductionCostAbsorbed(
    tx: Prisma.TransactionClient,
    amount: number,
    productionOrderNo: string,
    referenceId: number,
    userId?: number,
    transactionDate?: Date,
  ) {
    const accounts = await getAccountIds()
    const absorption = accounts.materialExpense ?? accounts.materialIssueExpense ?? accounts.cogs
    if (!accounts.wip || !absorption) {
      throw new Error(
        "Akun Barang Dalam Proses dan akun Beban Material harus diatur untuk membukukan biaya produksi non-material.",
      )
    }
    const value = Math.round(Math.abs(amount) * 100) / 100
    if (value <= 0) return null

    const isAbsorb = amount > 0
    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'ProductionCost',
      referenceId,
      type: 'PROD',
      description: `Biaya Produksi Non-Material ${productionOrderNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: isAbsorb ? accounts.wip : absorption,
          debit: value,
          credit: 0,
          memo: `${isAbsorb ? 'Debit' : 'Kredit'} Barang Dalam Proses - ${productionOrderNo}`,
        },
        {
          accountId: isAbsorb ? absorption : accounts.wip,
          debit: 0,
          credit: value,
          memo: `${isAbsorb ? 'Kredit' : 'Debit'} Beban Material - ${productionOrderNo}`,
        },
      ],
    })
  },

  /** Finished goods receipt — transfer accumulated production cost out of WIP. */
  async onProductionOrderCompleted(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    productionOrderNo: string,
    productionOrderId: number,
    userId?: number,
    transactionDate?: Date,
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.wip) {
      throw new Error("Akun Persediaan dan Barang Dalam Proses harus diatur sebelum order produksi diselesaikan.")
    }
    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'ProductionOrder',
      referenceId: productionOrderId,
      type: 'PROD',
      description: `Penerimaan Hasil Produksi ${productionOrderNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.inventory,
          debit: totalValue,
          credit: 0,
          memo: `Debit Persediaan Produk Jadi - ${productionOrderNo}`,
        },
        {
          accountId: accounts.wip,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Barang Dalam Proses - ${productionOrderNo}`,
        },
      ],
    })
  },

  /** Settle sub-cent/unit-cost rounding left between WIP and stock valuation. */
  async onProductionOrderCostRoundingVariance(
    tx: Prisma.TransactionClient,
    variance: number,
    productionOrderNo: string,
    productionOrderId: number,
    userId?: number,
    transactionDate?: Date,
  ) {
    if (Math.abs(variance) < 0.005) return null
    const accounts = await getAccountIds()
    const varianceAccount = accounts.materialExpense ?? accounts.cogs
    if (!accounts.wip || !varianceAccount) {
      throw new Error("Akun WIP dan Beban Material/COGS harus diatur untuk membukukan selisih pembulatan biaya produksi.")
    }
    const amount = Math.abs(variance)
    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    const actualCostExceedsInventoryValue = variance > 0
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: 'ProductionOrderCostVariance',
      referenceId: productionOrderId,
      type: 'PROD',
      description: `Selisih pembulatan biaya produksi ${productionOrderNo}`,
      createdBy: userId,
      entries: actualCostExceedsInventoryValue
        ? [
            { accountId: varianceAccount, debit: amount, credit: 0, memo: `Selisih pembulatan biaya ${productionOrderNo}` },
            { accountId: accounts.wip, debit: 0, credit: amount, memo: `Penyelesaian selisih WIP ${productionOrderNo}` },
          ]
        : [
            { accountId: accounts.wip, debit: amount, credit: 0, memo: `Penyelesaian selisih WIP ${productionOrderNo}` },
            { accountId: varianceAccount, debit: 0, credit: amount, memo: `Selisih pembulatan biaya ${productionOrderNo}` },
          ],
    })
  },
}
