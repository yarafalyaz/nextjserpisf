/**
 * Pemuatan data untuk laporan pemeriksaan **Barang Diterima Belum Ditagih** (GR/IR).
 *
 * Tiga keputusan yang menentukan angkanya:
 *
 * 1. **Nilai tagihan diambil dari `subtotal`, bukan `total`.** Jurnal penerimaan
 *    mendebit persediaan sebesar nilai barang (PPN dicatat terpisah), dan tagihan
 *    membersihkan akun GRNI sebesar nilai barang juga — memakai `total` akan
 *    memasukkan PPN ke perbandingan dan memunculkan selisih palsu sebesar pajak.
 * 2. **Hanya baris penerimaan dari penerimaan yang benar-benar masuk** (`verified`/`completed`).
 *    Penerimaan draft belum mengubah persediaan maupun GRNI.
 * 3. **Hanya tagihan yang sudah diposting yang dikurangkan.** Tagihan draft
 *    MURNI tanpa jurnal (kontrak P0-2 di `createVendorBill`/`updateVendorBill`):
 *    jurnal AP (Dr Clearing / Cr Hutang) baru lahir di `confirmVendorBill`,
 *    jadi draft belum membersihkan akun GRNI di buku besar — mengikutkannya
 *    membuat sisa dokumen lebih kecil daripada saldo akun dan memunculkan
 *    selisih palsu. Tagihan cancelled juga tidak dikurangkan karena jurnalnya
 *    sudah dibalik. (Penjaga 3-way match memang menghitung draft juga, tetapi
 *    sebagai reservasi plafon anti-tagih-ganda — bukan pengakuan GL, jadi
 *    perlakuan di laporan ini sengaja berbeda.)
 */

import { prisma } from "@/lib/db/prisma"
import { safeAdd } from "@/lib/utils/math"
import { getSystemSettings } from "@/lib/utils/settings"
import { sumNetForAccount } from "@/lib/services/report-aggregation.service"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  buildReceivedNotBilled,
  type ReceivedNotBilledResult,
} from "@/lib/reports/received-not-billed"

const POSTED_RECEIPT_STATUSES = ["verified", "completed"]

export interface ReceivedNotBilledReport {
  report: ReceivedNotBilledResult
  periodLabel: string
  periodCaption: string
}

export async function loadReceivedNotBilled(period: {
  start: Date
  end: Date
}): Promise<ReceivedNotBilledReport> {
  const settings = await getSystemSettings()
  const grniAccountId = settings.purchaseInventoryAccountId ?? null

  const receiptItems = await prisma.goodsReceiptItem.findMany({
    where: {
      goodsReceipt: {
        date: { gte: period.start, lte: period.end },
        status: { in: POSTED_RECEIPT_STATUSES },
      },
    },
    select: {
      id: true,
      goodsReceiptId: true,
      itemId: true,
      qty: true,
      unitCost: true,
      goodsReceipt: {
        select: {
          documentNo: true,
          date: true,
          purchaseOrder: { select: { vendor: { select: { name: true } } } },
        },
      },
    },
    orderBy: { id: "asc" },
  })

  const lineIds = receiptItems.map((item) => item.id)

  const billedItems = lineIds.length
    ? await prisma.vendorBillItem.findMany({
        where: {
          goodsReceiptItemId: { in: lineIds },
          // Lihat catatan 3 di atas: draft belum menjurnal (draft murni), jadi
          // hanya tagihan terposting (posted/partial/paid) yang dikurangkan.
          vendorBill: { status: { notIn: ["draft", "cancelled"] } },
        },
        select: { goodsReceiptItemId: true, subtotal: true },
      })
    : []

  const billedByLine = new Map<number, number>()
  for (const billed of billedItems) {
    if (billed.goodsReceiptItemId === null) continue
    const previous = billedByLine.get(billed.goodsReceiptItemId) ?? 0
    billedByLine.set(billed.goodsReceiptItemId, safeAdd(previous, billed.subtotal, 2))
  }

  const itemIds = [...new Set(receiptItems.map((item) => item.itemId))]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  const account = grniAccountId
    ? await prisma.account.findUnique({
        where: { id: grniAccountId },
        select: { code: true, name: true },
      })
    : null

  const ledgerBalance = grniAccountId
    ? await sumNetForAccount(grniAccountId, { date: { lte: period.end } })
    : null

  const today = new Date()
  const periodEndIsToday =
    period.end.getFullYear() === today.getFullYear() &&
    period.end.getMonth() === today.getMonth() &&
    period.end.getDate() === today.getDate()

  return {
    report: buildReceivedNotBilled({
      lines: receiptItems.map((line) => ({
        goodsReceiptId: line.goodsReceiptId,
        receiptNo: line.goodsReceipt.documentNo,
        receiptDate: line.goodsReceipt.date,
        vendorName: line.goodsReceipt.purchaseOrder?.vendor?.name ?? null,
        sku: itemById.get(line.itemId)?.sku ?? null,
        name: itemById.get(line.itemId)?.name ?? "Barang",
        receivedQty: Number(line.qty),
        unitCost: Number(line.unitCost),
        billedValue: billedByLine.get(line.id) ?? 0,
      })),
      ledger:
        ledgerBalance === null
          ? null
          : {
              accountLabel: account ? `${account.code} ${account.name}` : String(grniAccountId),
              balance: ledgerBalance,
            },
      asOf: period.end,
      periodEndIsToday,
    }),
    ...rangePeriodLabels(period),
  }
}
