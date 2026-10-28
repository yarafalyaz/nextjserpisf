import { JournalService } from '@/lib/services/journal.service'
import { safeAdd, safeMultiply } from '@/lib/utils/math'
import { generateDocumentNumber } from '@/lib/utils/document-number'
import { getSystemSettings } from '@/lib/utils/settings'
import { decideAbnormalScrapPosting } from '@/lib/services/scrap-classification'
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
  abnormalScrapExpense?: number | null
  abnormalScrapPostingEnabled?: boolean
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
    abnormalScrapExpense: s.abnormalScrapExpenseAccountId,
    abnormalScrapPostingEnabled: s.abnormalScrapPostingEnabled,
  }
}

function sumValue(items: JournalItemInput[]): number {
  // Nilai per baris dan akumulasinya tepat sen: float mentah membuat 17 baris
  // 1x0.24 menjadi 4.080000000000002 yang lolos sebagai debit/kredit jurnal.
  return items.reduce(
    (s, i) => safeAdd(s, safeMultiply(i.qty, i.cost, 2), 2),
    0,
  )
}

/** Pembulatan sen untuk setiap nilai jurnal (Decimal(15,2)). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Peringatan bernama untuk jalur landed cost GR (vonis F-2026-10-28-125-V).
 *
 * V2/V3 mewajibkan blended maupun pemetaan akun yang salah TIDAK senyap:
 * nilainya tetap benar (tidak ada uang hilang), tetapi perpecahan komponennya
 * hilang atau salah tipe, sehingga operator harus tahu dari log.
 */
export const GR_LANDED_COST_WARNING_SHIPPING_BLENDED =
  "PUR-BR-008 V1/V2: akun ongkir (purchaseShippingAccountId) kosong atau bukan akun persediaan/aset — ongkir digabung ke satu debit Persediaan sehingga rinciannya tidak tampil di jurnal. Petakan akun ongkir bertipe aset (mis. 110405 Persediaan — Ongkos Angkut Masuk) bila rincian ongkir diinginkan."

export const GR_LANDED_COST_WARNING_ADMIN_ASSET_ACCOUNT =
  "PUR-BR-008 V3: akun beban admin bank (purchaseAdminFeeAccountId) dipetakan ke akun bertipe ASSET/persediaan. Biaya admin bank adalah beban periode; memetakannya ke akun aset akan mengapitalisasinya lewat neraca. Petakan ke akun beban (mis. 720002 Beban Adm. Bank)."

/**
 * Tipe akun untuk sekumpulan id, dibaca di dalam transaksi pemanggil supaya
 * keputusan split (V2) tidak memakai snapshot di luar transaksi. Id kosong
 * diabaikan — pemanggil yang memutuskan apa artinya "akun belum dipetakan".
 */
async function accountTypeByIdTx(
  tx: Prisma.TransactionClient,
  ids: Array<number | null | undefined>,
): Promise<Map<number, string>> {
  const wanted = ids.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (wanted.length === 0) return new Map()
  const rows = await tx.account.findMany({
    where: { id: { in: wanted } },
    select: { id: true, type: true },
  })
  return new Map(rows.map((r) => [r.id, String(r.type)]))
}

/**
 * `Journal.referenceType` untuk jurnal yang lahir dari satu penerimaan barang.
 *
 * SATU penerimaan bisa menghasilkan DUA jurnal: jurnal persediaan (barang) dan
 * jurnal beban (baris jasa/subkontrak). `journals` punya unique
 * `(reference_type, reference_id)`, jadi memakai penanda yang sama untuk
 * keduanya membuat jurnal kedua gagal (duplicate entry) dan seluruh transaksi
 * verifikasi ter-rollback — penerimaan campuran barang+jasa tidak pernah bisa
 * diverifikasi. Penanda jasa karena itu dibedakan; keduanya tetap menunjuk
 * `reference_id` = id penerimaan yang sama.
 */
export const GOODS_RECEIPT_JOURNAL_REF_TYPE = "GoodsReceipt"
export const GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE = "GoodsReceiptService"

/**
 * `Journal.referenceType` untuk jurnal yang lahir dari SATU rilis penyelesaian
 * produksi. Satu perintah produksi bisa dirilis berkali-kali (parsial), sementara
 * `journals` unik pada `(reference_type, reference_id)`, jadi memakai penanda
 * telanjang yang sama untuk tiap rilis membuat rilis kedua gagal (duplicate
 * entry) dan seluruh transaksinya ter-rollback — perintah produksi parsial tidak
 * pernah bisa diselesaikan lewat UI. Karena itu id rilis (`StockMove.id` yang
 * unik per rilis) masuk ke `referenceType`, sedangkan `referenceId` tetap
 * menunjuk perintah produksi sumbernya agar pelacakan balik tetap bekerja.
 */
export const PRODUCTION_ORDER_COMPLETION_JOURNAL_REF_PREFIX = "ProductionOrder_"
export const PRODUCTION_ORDER_COST_VARIANCE_JOURNAL_REF_PREFIX = "ProductionOrderCostVariance_"

export function productionOrderCompletionJournalRef(stockMoveId: number): string {
  return `${PRODUCTION_ORDER_COMPLETION_JOURNAL_REF_PREFIX}${stockMoveId}`
}

export function productionOrderCostVarianceJournalRef(stockMoveId: number): string {
  return `${PRODUCTION_ORDER_COST_VARIANCE_JOURNAL_REF_PREFIX}${stockMoveId}`
}

/**
 * `Journal.referenceType` jurnal scrap abnormal P2(b) (F-2026-10-21-008,
 * vonis BOT 4 F-2026-10-22-066-V). Satu jurnal per KEJADIAN issue PO;
 * `referenceId` = StockMove.id pertama kejadian itu (unik per kejadian,
 * pola `ProductionOrderMaterialIssue`). Unique (referenceType,
 * referenceId) + cek existing di dalam tx = anti-dobel per kejadian.
 */
export const PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE = "ProductionOrderAbnormalScrap"

/**
 * `Journal.referenceType` jurnal serapan biaya produksi non-material.
 * `referenceId` = id baris `ProductionCost` (atau id perintah produksi untuk
 * jurnal agregat tarikan timesheet tanpa baris tunggal). Indeks unik aktif
 * `journals_active_reference_unique` hanya mengizinkan SATU jurnal aktif per
 * (referenceType, referenceId), jadi baris biaya yang bisa berubah tidak
 * boleh menumpuk jurnal delta aktif baru di kunci yang sama — lihat
 * `onProductionCostAbsorbed`: jurnal aktif lama di-reversal dulu, lalu
 * jurnal pengganti berisi nilai KUMULATIF baris diposting di kunci yang
 * sama (pola reversal repo, `reverseJournalsByReferenceTx`).
 */
export const PRODUCTION_COST_JOURNAL_REF_TYPE = "ProductionCost"

// ────────────────────────────────────────────────────────────────────────────
// Stock Journal Service
// ────────────────────────────────────────────────────────────────────────────

export const stockJournalService = {
  /**
   * Goods Receipt (verified) — Stock IN from vendor.
   *
   * Vonis Accountant F-2026-10-28-125-V (PUR-BR-008) menentukan perlakuan ini:
   *
   *   Dr Persediaan                  (inventoryAccountId)         — barang + ongkir
   *   Dr Beban Admin Bank            (purchaseAdminFeeAccountId)  — BEBAN PERIODE
   *   Cr Clearing Pembelian          (purchaseInventoryAccountId)
   *
   * Aturan vonis yang ditegakkan di sini:
   * - V1/V2: komponen ongkir hanya SAH dipecah ke akun tujuannya bila akun itu
   *   bertipe persediaan/aset (ASSET). Akun beban (6xxx/7xxx) DILARANG dipakai
   *   untuk nilai yang sudah masuk InventoryLayer — kalau akun kosong atau
   *   bertipe beban, jurnal memakai SATU debit Persediaan gabungan DAN
   *   mengeluarkan peringatan bernama (bukan blended senyap).
   * - V3: biaya admin bank BUKAN biaya perolehan, jadi TIDAK pernah masuk
   *   kapitalisasi (`items` hanya berisi barang + ongkir) dan tetap didebit ke
   *   akun beban sebagai beban periode. Bila fee > 0 tetapi akunnya belum
   *   dipetakan, jalur ini fail-closed (tidak menebak akun, tidak
   *   mengapitalisasi diam-diam) — selaras accounting.hook.ts:2798-2856.
   * - V6/V10: kredit clearing = Σ debit, dan debit Persediaan tepat sama dengan
   *   Σ (qty × unitCost) yang ditulis ke StockMove + InventoryLayer.
   *
   * `goodsOnlyLines` dipertahankan demi kompatibilitas pemanggil (hook masih
   * mengirimnya untuk rincian cetak), tetapi TIDAK lagi dipakai sebagai
   * penentu split: nilai barang dihitung sebagai sisa nilai kapitalisasi
   * setelah ongkir yang sah, sehingga Σ debit persediaan selalu = `items`
   * (V10: GL == Σ layer).
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

    // `items` = nilai yang BENAR-BENAR dikapitalisasi (barang + ongkir yang sah).
    const inventoryValue = round2(sumValue(items))
    // V3: admin fee adalah beban periode — di luar `items`, selalu.
    const adminValue = round2(adminLines ? sumValue(adminLines) : 0)
    if (inventoryValue <= 0 && adminValue <= 0) return null
    const totalRounded = round2(inventoryValue + adminValue)

    const entries: {
      accountId: number
      debit: number
      credit: number
      memo: string
    }[] = []

    // V1/V2: split ongkir hanya sah bila akun tujuan bertipe persediaan/aset.
    const shippingValue = round2(shippingLines ? sumValue(shippingLines) : 0)
    const accountTypes = await accountTypeByIdTx(tx, [
      accounts.purchaseShipping,
      accounts.purchaseAdminFee,
    ])
    const shippingAccountIsInventory =
      shippingValue !== 0 &&
      shippingValue > 0 &&
      accounts.purchaseShipping != null &&
      accountTypes.get(accounts.purchaseShipping) === "ASSET"

    if (shippingValue !== 0 && !shippingAccountIsInventory) {
      // Nilai tidak hilang: ongkir tetap didebit ke Persediaan (satu baris),
      // tetapi perpecahannya hilang — jadi wajib berisik.
      console.warn(GR_LANDED_COST_WARNING_SHIPPING_BLENDED)
    }

    const goodsValue = round2(inventoryValue - (shippingAccountIsInventory ? shippingValue : 0))
    if (goodsValue > 0) {
      entries.push({
        accountId: accounts.inventory,
        debit: goodsValue,
        credit: 0,
        memo: shippingAccountIsInventory
          ? `Debit Persediaan (barang) - GR ${grDocumentNo}`
          : `Debit Persediaan (barang + ongkir digabung) - GR ${grDocumentNo}`,
      })
    }
    if (shippingAccountIsInventory) {
      entries.push({
        accountId: accounts.purchaseShipping!,
        debit: shippingValue,
        credit: 0,
        memo: `Debit Ongkir (persediaan) - GR ${grDocumentNo}`,
      })
    }

    if (adminValue !== 0) {
      if (accounts.purchaseAdminFee == null) {
        // V3 melarang kapitalisasi admin; tanpa akun beban tidak ada perlakuan
        // sah yang tersisa, jadi tolak dengan pesan bernama (fail-closed).
        throw new Error(
          "Akun beban admin bank (purchaseAdminFeeAccountId) belum dipetakan di Pengaturan → Mapping Akun. Biaya admin bank adalah beban periode — tidak boleh dikapitalisasi ke persediaan — sehingga penerimaan ini tidak bisa dijurnal.",
        )
      }
      if (accountTypes.get(accounts.purchaseAdminFee) === "ASSET") {
        console.warn(GR_LANDED_COST_WARNING_ADMIN_ASSET_ACCOUNT)
      }
      entries.push({
        accountId: accounts.purchaseAdminFee,
        debit: adminValue,
        credit: 0,
        memo: `Debit Beban Admin Bank (beban periode) - GR ${grDocumentNo}`,
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
      referenceType: GOODS_RECEIPT_JOURNAL_REF_TYPE,
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
      // Penanda KHUSUS jasa: penerimaan campuran barang+jasa memposting dua
      // jurnal untuk GR yang sama, dan unique (reference_type, reference_id)
      // akan menolak yang kedua bila penandanya sama (lihat konstanta di atas).
      referenceType: GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE,
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
    transactionDate?: Date
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.stockAdj) {
      throw new Error(
        "Akun Persediaan dan Akun Penyesuaian Stok harus diatur di Pengaturan → Akuntansi sebelum penyesuaian stok bisa dijurnal.",
      )
    }

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
    if (!accounts.inventory || !expenseAcct) {
      throw new Error(
        "Akun Persediaan dan akun Beban Material harus diatur di Pengaturan → Akuntansi sebelum pengeluaran material bisa dijurnal.",
      )
    }

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

    // Baris biaya produksi BISA berubah (edit/hapus/sync): jurnal aktif
    // sebelumnya atas kunci yang sama wajib dibebaskan dulu, kalau tidak
    // jurnal kedua menabrak `journals_active_reference_unique` (P2002).
    // Pola repo (reverseJournalsByReferenceTx): jurnal lawan POSTED
    // (referenceType "Journal" → id asli, debit↔kredit, tanggal asli) lalu
    // asli menjadi REVERSED — histori utuh dan laporan POSTED+REVERSED
    // men-net-kan pasangan itu ke nol. Jurnal pengganti di bawah berisi
    // nilai kumulatif (lama + delta), jadi tetap tepat SATU jurnal aktif
    // `ProductionCost` per baris biaya. Jurnal lama yang sudah terposting
    // tidak pernah diubah referensinya.
    let currentAmount = 0
    const journalDelegate = tx.journal as typeof tx.journal | undefined
    if (journalDelegate && typeof journalDelegate.findFirst === "function") {
      const existing = await journalDelegate.findFirst({
        where: {
          referenceType: PRODUCTION_COST_JOURNAL_REF_TYPE,
          referenceId,
          deletedAt: null,
          status: { not: "REVERSED" },
        },
        include: { entries: true },
      })
      if (existing) {
        if (existing.status === "POSTED") {
          currentAmount =
            Math.round(
              existing.entries.reduce(
                (sum, e) =>
                  e.accountId === accounts.wip
                    ? sum + Number(e.debit) - Number(e.credit)
                    : sum,
                0,
              ) * 100,
            ) / 100
          const reversalNumber = await generateDocumentNumber('JRN')
          const reversal = await tx.journal.create({
            data: {
              journalNumber: reversalNumber,
              transactionDate: existing.transactionDate,
              referenceType: 'Journal',
              referenceId: existing.id,
              description: `Reversal of ${existing.journalNumber}`,
              type: existing.type,
              status: 'POSTED',
              totalDebit: existing.totalCredit,
              totalCredit: existing.totalDebit,
              createdBy: userId ?? null,
            },
          })
          await tx.journalEntry.createMany({
            data: existing.entries.map((e) => ({
              journalId: reversal.id,
              accountId: e.accountId,
              debit: Number(e.credit),
              credit: Number(e.debit),
              memo: `Reversal: ${e.memo ?? ''}`.trim(),
              costCenterId: e.costCenterId ?? null,
              profitCenterId: e.profitCenterId ?? null,
            })),
          })
          await tx.journal.update({
            where: { id: existing.id },
            data: { status: 'REVERSED' },
          })
        } else {
          // Belum menyentuh GL (mis. DRAFT): hapus aman, dokumen sumber
          // (baris biaya) tetap ada sebagai jejak audit.
          await tx.journalEntry.deleteMany({ where: { journalId: existing.id } })
          await tx.journal.delete({ where: { id: existing.id } })
        }
      }
    }

    const newAmount = Math.round((currentAmount + amount) * 100) / 100
    if (newAmount === 0) return null

    const isAbsorb = newAmount > 0
    const newValue = Math.abs(newAmount)
    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: PRODUCTION_COST_JOURNAL_REF_TYPE,
      referenceId,
      type: 'PROD',
      description: `Biaya Produksi Non-Material ${productionOrderNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: isAbsorb ? accounts.wip : absorption,
          debit: newValue,
          credit: 0,
          memo: `${isAbsorb ? 'Debit' : 'Kredit'} Barang Dalam Proses - ${productionOrderNo}`,
        },
        {
          accountId: isAbsorb ? absorption : accounts.wip,
          debit: 0,
          credit: newValue,
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
    stockMoveId?: number,
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
      referenceType: stockMoveId != null ? productionOrderCompletionJournalRef(stockMoveId) : 'ProductionOrder',
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
    stockMoveId?: number,
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
      referenceType: stockMoveId != null ? productionOrderCostVarianceJournalRef(stockMoveId) : 'ProductionOrderCostVariance',
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

  /**
   * Scrap ABNORMAL produksi (F-2026-10-21-008, vonis BOT 4
   * F-2026-10-22-066-V P2(b)) — beban periode keluar dari WIP:
   *
   *   Dr Beban Kerugian Produksi (abnormalScrapExpenseAccountId)
   *   Cr Barang Dalam Proses (wipAccountId)
   *
   * Putusan flag Lead MODE CATAT-DULU: flag OFF (default) → fungsi ini
   * TIDAK posting dan TIDAK melempar (complete lolos; nilai abnormal
   * tampil sebagai temuan laporan scrap). Flag ON → fail-closed persis
   * `decideAbnormalScrapPosting` (akun kosong = throw, tx pemanggil
   * rollback, nol jurnal parsial). Idempotensi: cek jurnal existing
   * (referenceType, referenceId) di dalam tx sebelum posting.
   * Pemanggil WAJIB `assertPeriodOpen` lebih dulu (pola issue existing).
   */
  async onProductionOrderAbnormalScrap(
    tx: Prisma.TransactionClient,
    abnormalValue: number,
    productionOrderNo: string,
    referenceStockMoveId: number,
    userId?: number,
    transactionDate?: Date,
  ) {
    const accounts = await getAccountIds()
    const decision = decideAbnormalScrapPosting(
      {
        abnormalScrapPostingEnabled: accounts.abnormalScrapPostingEnabled ?? false,
        abnormalScrapExpenseAccountId: accounts.abnormalScrapExpense ?? null,
        wipAccountId: accounts.wip ?? null,
      },
      abnormalValue,
    )
    if (decision.mode === "off") return null

    const existing = await tx.journal.findFirst({
      where: {
        referenceType: PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE,
        referenceId: referenceStockMoveId,
      },
      select: { id: true },
    })
    if (existing) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: transactionDate ?? new Date(),
      referenceType: PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE,
      referenceId: referenceStockMoveId,
      type: 'PROD',
      description: `Scrap abnormal produksi ${productionOrderNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: decision.expenseAccountId,
          debit: decision.journalAmount,
          credit: 0,
          memo: `Debit Beban Kerugian Produksi (scrap abnormal) - ${productionOrderNo}`,
        },
        {
          accountId: decision.wipAccountId,
          debit: 0,
          credit: decision.journalAmount,
          memo: `Kredit Barang Dalam Proses (scrap abnormal) - ${productionOrderNo}`,
        },
      ],
    })
  },
}
