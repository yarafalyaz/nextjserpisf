
"use server";

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error";
import { requirePermission } from "@/lib/auth/permissions";
import { getWarehouseScope, assertWarehouseAccess, assertWarehouseAccessMulti } from "@/lib/auth/warehouse-scope";
import {
  safeAdd,
  safeSubtract,
  safeMultiply,
  safeRound,
} from "@/lib/utils/math";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { toBaseFactor } from "@/lib/services/uom.service";
import { checkIdempotency } from "@/lib/utils/idempotency";
import { Prisma } from "@prisma/client";
import {
  onPurchaseReturnProcessed,
  onVendorBillPosted,
  onVendorPaymentCreated,
  deleteJournalByReferenceTx,
  reverseJournalsByReferenceTx,
  VENDOR_BILL_TAX_INVOICE_WARNING,
} from "@/lib/hooks/accounting.hook";
import {
  isValidVendorTaxInvoiceNumber,
  taxPeriodFromDate,
  checkCreditEligibility,
} from "@/lib/tax/tax-invoice";
import {
  bindIdempotencyKey,
  claimIdempotencyKey,
  payloadFingerprint,
} from "@/lib/services/financial-idempotency.service";
import { onGoodsReceiptVerified } from "@/lib/hooks/goods-receipt.hook";
import { onPurchaseOrderCreated } from "@/lib/hooks/purchase-order.hook";
import { onPurchaseReturnProcessed as onPurchaseReturnStock, resolvePurchaseReturnWarehouse, loadPurchaseReturnWarehouseContext } from "@/lib/hooks/purchase-return.hook";
import { notificationService } from "@/lib/services/notification.service";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { nextSlug } from "@/lib/utils/slug-db";
import { revalidatePath } from "next/cache";
import { safeJsonParse } from "@/lib/utils/safe-parse";
import { findOverReturn } from "@/lib/sales/return-validation";
import { computeBillLineAmounts, isValidTermsReference, summarizeBillItems, VENDOR_BILL_TERMS_REF_ERROR } from "@/lib/finance/vendor-bill";
import { allocatePaymentToBills } from "@/lib/finance/payment-allocation";
import { isSettled, SETTLEMENT_TOLERANCE_IDR } from "@/lib/finance/settlement-status";
import { syncServicePurchaseOrderCost } from "@/lib/services/production-cost.service";
import {
  GOODS_RECEIPT_JOURNAL_REF_TYPE,
  GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE,
} from "@/lib/services/stock-journal.service";
import {
  assertApproved,
  requestApprovalIfConfigured,
} from "@/lib/services/approval-workflow.service";
import { attachPendingTransactionAttachments, deleteTransactionAttachmentsTx, removeAttachmentFiles } from "@/lib/services/transaction-attachment.service";
import { parseFormData } from "@/lib/validations/parse-form";
import {
  L3_MSG,
  parseL3Tag,
  resolveL3WorkOrder,
  assertNoDuplicateL3,
  writeL3ActivityLog,
} from "@/lib/services/late-cost-l3.service";
import { getSystemSettings } from "@/lib/utils/settings";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";
import { parseLocaleNumber, parseMoneyAmount } from "@/lib/utils/parse-money";
import { PurchaseStatus, Status } from "@/lib/constants";
import {
  purchaseRequestSchema,
  purchaseOrderSchema,
  goodsReceiptSchema,
  vendorBillSchema,
  vendorPaymentSchema,
  purchaseReturnSchema,
  grItemExpiryDate,
} from "@/lib/validations/purchase.schemas";

type GrItemInput = {
  itemId: number;
  qty: number;
  unitCost: number;
  warehouseId?: number | null;
  rackId?: number | null;
  rackRowId?: number | null;
  uom?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  serialNumbers?: string[] | null;
};

/**
 * Baris PO/GR dari JSON FormData `items` (qty/harga/biaya bisa string
 * berformat Indonesia dari klien non-form: "2.000" = 2000, "150.000" =
 * 150000) — wajib lewat parser repo; Number() mentah membaca "2.000"
 * jadi 2 dan "abc" jadi NaN yang lolos filter >0, lalu total/penjaga
 * over-receive ikut menilai angka rusak dan qty/harga tersimpan menyusut
 * diam-diam. Baris berkode item dengan angka tak terbaca ditolak
 * berpesan, bukan dibuang/dinclamp diam-diam. Baris tanpa item
 * (itemId kosong/0) tetap dibuang (baris kosong form); qty <= 0 pada
 * baris berkode tetap dibuang (perilaku lama: baris belum diisi).
 * `parsePurchaseOrderItems` dipakai create+update PO; `parseGrItems`
 * dipakai create+update GR (satu sumber per dokumen, pola retur).
 */
function parsePoGrItemId(raw: unknown): number | null {
  const itemId = parseLocaleNumber(raw as string | number | null | undefined);
  return itemId === null || itemId <= 0 ? null : itemId;
}

function parsePoGrQty(raw: unknown, itemId: number, label: string): number {
  const qty = parseLocaleNumber(raw as string | number | null | undefined);
  if (qty === null) {
    throw new Error(
      `Kuantitas ${label} item #${itemId} tidak valid — isi angka lebih dari 0 (mis. 2 atau 2.000).`,
    );
  }
  return qty;
}

function parsePoGrMoney(
  raw: unknown,
  itemId: number,
  label: string,
): number {
  if (raw == null || raw === "") return 0;
  const value = parseMoneyAmount(raw as string | number | null | undefined);
  if (value === null || value < 0) {
    throw new Error(
      `${label} item #${itemId} tidak valid — isi angka 0 atau lebih (mis. 150.000).`,
    );
  }
  return value;
}

function parsePurchaseOrderItems(
  itemsJson: string | null | undefined,
): PurchaseOrderLine[] {
  const rows =
    safeJsonParse<
      { itemId?: unknown; qty?: unknown; unitPrice?: unknown; discount?: unknown }[]
    >(itemsJson ?? null) ?? [];
  const items: PurchaseOrderLine[] = [];
  for (const row of rows) {
    const itemId = parsePoGrItemId(row?.itemId);
    if (itemId === null) continue;
    const qty = parsePoGrQty(row.qty, itemId, "pesanan");
    if (qty <= 0) continue;
    items.push({
      itemId,
      qty,
      unitPrice: parsePoGrMoney(row.unitPrice, itemId, "Harga beli pesanan"),
      discount: parsePoGrMoney(row.discount, itemId, "Diskon pesanan"),
    });
  }
  return items;
}

// expiryDate baris lolos JSON tanpa validasi kalender: "2026-02-30"
// bergulir ke 2 Mar oleh new Date, string acak jadi Invalid Date.
function assertGrItemExpiryDates(items: GrItemInput[]) {
  for (const i of items) {
    if (!grItemExpiryDate.safeParse(i.expiryDate).success)
      throw new Error("Tanggal kedaluwarsa tidak valid");
  }
}

function goodsReceiptItemData(i: GrItemInput, orderedQtyByItem: Map<number, number>) {
  return {
    itemId: i.itemId,
    qty: i.qty,
    qtyOrdered: orderedQtyByItem.get(i.itemId) ?? 0,
    unitCost: i.unitCost || 0,
    warehouseId: i.warehouseId ? Number(i.warehouseId) : null,
    rackId: i.rackId ? Number(i.rackId) : null,
    rackRowId: i.rackRowId ? Number(i.rackRowId) : null,
    uom: i.uom || null,
    batchNumber: i.batchNumber || null,
    expiryDate: i.expiryDate ? wibDateToUtcMidnight(i.expiryDate) : null,
    serialNumbers:
      i.serialNumbers && i.serialNumbers.length > 0 ? i.serialNumbers : undefined,
  };
}

function parseGrItems(items: string | null | undefined): GrItemInput[] {
  const rows =
    safeJsonParse<
      (Omit<GrItemInput, "itemId" | "qty" | "unitCost"> & {
        itemId?: unknown;
        qty?: unknown;
        unitCost?: unknown;
      })[]
    >(items ?? null) ?? [];
  const parsed: GrItemInput[] = [];
  for (const row of rows) {
    const itemId = parsePoGrItemId(row?.itemId);
    if (itemId === null) continue;
    const qty = parsePoGrQty(row.qty, itemId, "penerimaan");
    if (qty <= 0) continue;
    parsed.push({
      ...row,
      itemId,
      qty,
      unitCost: parsePoGrMoney(row.unitCost, itemId, "Biaya satuan penerimaan"),
    });
  }
  return parsed;
}

/**
 * F-004: harga beli beku per item utk snapshot DPP retur beli — dari
 * VendorBillItem.unitPrice tagihan PO terbaru (non-cancelled). Item tanpa
 * baris tagihan → tak ada entri (baris retur legacy, bukan ditebak dari
 * Item.cost/HPP). Payload `item.price` eksplisit menang di pemanggil.
 */
async function loadBillUnitPriceByItem(
  tx: Prisma.TransactionClient,
  purchaseOrderId: number | null | undefined,
  itemIds: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!purchaseOrderId || itemIds.length === 0) return out;
  const bills = await tx.vendorBill.findMany({
    where: { purchaseOrderId, status: { not: "cancelled" } },
    orderBy: { id: "desc" },
    select: { items: { where: { itemId: { in: itemIds } }, select: { itemId: true, unitPrice: true } } },
  });
  for (const bill of bills) {
    for (const line of bill.items) {
      if (line.itemId != null && !out.has(line.itemId)) out.set(line.itemId, Number(line.unitPrice));
    }
  }
  return out;
}

/**
 * 3-way match guard (PO ↔ Goods Receipt ↔ Vendor Bill).
 * When a vendor bill is linked to a PO, ensure: (1) goods were actually received
 * (a verified GR exists), and (2) the cumulative billed amount does not exceed
 * the value of goods received. Prevents paying for undelivered/over-billed goods.
 */
async function assertThreeWayMatch(
  tx: Prisma.TransactionClient,
  purchaseOrderId: number | null | undefined,
  billGoodsValue: number,
  excludeBillId?: number,
): Promise<void> {
  if (!purchaseOrderId) return; // bills without a PO link are not matched

  // PO jasa tidak punya penerimaan barang sama sekali — menuntut GR
  // terverifikasi membuat tagihan jasa yang tertaut PO mustahil disimpan.
  // Untuk jasa, kecocokan yang ditegakkan adalah plafon total PO.
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { isService: true, grandTotal: true, documentNo: true },
  });
  if (po?.isService) {
    const otherBills = await tx.vendorBill.aggregate({
      where: {
        purchaseOrderId,
        status: { notIn: ["cancelled"] },
        ...(excludeBillId ? { id: { not: excludeBillId } } : {}),
      },
      _sum: { subtotal: true },
    });
    const alreadyBilled = Number(otherBills._sum.subtotal ?? 0);
    const poTotal = Number(po.grandTotal ?? 0);
    const tolerance = safeRound(Math.max(1000, safeMultiply(poTotal, 0.01, 2)), 0);
    if (safeAdd(alreadyBilled, billGoodsValue, 0) > safeAdd(poTotal, tolerance, 0)) {
      throw new Error(
        `3-way match gagal: total tagihan jasa (${safeAdd(alreadyBilled, billGoodsValue, 0).toLocaleString("id-ID")}) ` +
          `melebihi total PO ${po.documentNo} (${poTotal.toLocaleString("id-ID")}).`,
      );
    }
    return;
  }

  const grs = await tx.goodsReceipt.findMany({
    where: { purchaseOrderId, status: { in: ["verified", "completed"] } },
    include: { items: true },
  });
  if (grs.length === 0) {
    throw new Error(
      "3-way match gagal: belum ada penerimaan barang (GR terverifikasi) untuk PO ini.",
    );
  }

  const receivedValue = grs.reduce(
    (sum, gr) =>
      safeAdd(
        sum,
        gr.items.reduce(
          (s, it) => safeAdd(s, safeMultiply(it.qty, it.unitCost ?? 0, 0), 0),
          0,
        ),
        0,
      ),
    0,
  );

  // Count EVERY non-cancelled bill, not just posted/paid. Draft memang MURNI
  // tanpa jurnal (P0-2), tetapi tagihan draft tetap dihitung di sini sebagai
  // RESERVASI plafon: bila hanya tagihan terposting yang dihitung, dua draft
  // yang dibuat berurutan sama-sama lolos dari angka lama lalu sama-sama
  // diposting dan menagih PO berlebih. notIn:['cancelled'] =
  // draft|posted|partial|paid = setiap tagihan yang masih bisa menjadi AP
  // untuk PO ini.
  //
  // Match goods-value to goods-value: receivedValue is Σ qty×unitCost (tax- and
  // discount-exclusive), so compare it against each bill's `subtotal` (Σ
  // qty×unitPrice, also pre-tax/pre-discount). Using grandTotal here would add
  // PPN/discount to one side only and wrongly reject every bill that carries tax.
  const otherBills = await tx.vendorBill.aggregate({
    where: {
      purchaseOrderId,
      status: { notIn: ["cancelled"] },
      ...(excludeBillId ? { id: { not: excludeBillId } } : {}),
    },
    _sum: { subtotal: true },
  });
  const alreadyBilled = Number(otherBills._sum.subtotal ?? 0);

  // Allow a small tolerance for rounding/freight differences.
  const tolerance = safeRound(
    Math.max(1000, safeMultiply(receivedValue, 0.01, 2)),
    0,
  );
  if (
    safeAdd(alreadyBilled, billGoodsValue, 0) >
    safeAdd(receivedValue, tolerance, 0)
  ) {
    throw new Error(
      `3-way match gagal: total tagihan (${safeAdd(alreadyBilled, billGoodsValue, 0).toLocaleString("id-ID")}) ` +
        `melebihi nilai barang diterima (${receivedValue.toLocaleString("id-ID")}).`,
    );
  }
}

/**
 * Penjaga tagih-ganda PER-GR (BUG-09): total nilai yang sudah ditagih untuk
 * SATU penerimaan — Σ `VendorBillItem.subtotal` non-cancelled yang menunjuk
 * baris GR ini — DITAMBAH nilai tagihan baru tidak boleh melebihi nilai barang
 * yang diterima pada GR itu (Σ qty × unitCost). Penjaga 3-way level PO saja
 * tidak cukup: PO dengan banyak GR bisa tetap di bawah plafon PO sementara
 * satu GR ditagih dua kali lipat.
 *
 * Baris GR dikunci `FOR UPDATE` lebih dulu (pola kunci yang sama dengan
 * penjaga over-receive/over-return), sehingga dua pembuatan/pengeditan
 * tagihan konkuren atas GR yang sama terserialisasi: panggilan kedua membaca
 * baris tagihan pertama sesudah terkunci, bukan sama-sama lolos dari angka
 * lama. `excludeBillId` dipakai jalur edit supaya tagihan tidak menghitung
 * dirinya sendiri (baris lamanya akan diganti).
 */
async function assertGrBillingWithinReceived(
  tx: Prisma.TransactionClient,
  goodsReceiptId: number,
  receiptLabel: string,
  newBillValue: number,
  excludeBillId?: number,
): Promise<void> {
  await tx.$executeRaw`SELECT id FROM goods_receipts WHERE id = ${goodsReceiptId} FOR UPDATE`;

  const queueLines = await tx.goodsReceiptItem.findMany({
    where: { goodsReceiptId },
    select: { id: true },
  });
  const lineIds = queueLines.map((line) => line.id);
  const grLines = lineIds.length
    ? await tx.goodsReceiptItem.findMany({
        where: { id: { in: lineIds } },
        select: { qty: true, unitCost: true },
      })
    : [];
  const receivedValue = grLines.reduce(
    (s, line) => safeAdd(s, safeMultiply(line.qty, line.unitCost ?? 0, 2), 2),
    0,
  );
  const billed = lineIds.length
    ? await tx.vendorBillItem.aggregate({
        where: {
          goodsReceiptItemId: { in: lineIds },
          vendorBill: {
            status: { notIn: ["cancelled"] },
            ...(excludeBillId ? { id: { not: excludeBillId } } : {}),
          },
        },
        _sum: { subtotal: true },
      })
    : null;
  const billedValue = Number(billed?._sum.subtotal ?? 0);

  // Toleransi 1 sen untuk pembulatan, sama seperti penjaga sebelumnya.
  if (receivedValue > 0 && billedValue >= receivedValue - 0.01) {
    throw new Error(
      `Penerimaan ${receiptLabel} sudah ditagih penuh (${billedValue.toLocaleString("id-ID")} dari ${receivedValue.toLocaleString("id-ID")}).`,
    );
  }
  if (
    receivedValue > 0 &&
    safeAdd(billedValue, newBillValue, 2) > safeAdd(receivedValue, 0.01, 2)
  ) {
    throw new Error(
      `Penagihan melebihi nilai penerimaan ${receiptLabel}: sudah ditagih ${billedValue.toLocaleString("id-ID")} + tagihan ini ${newBillValue.toLocaleString("id-ID")} melebihi nilai diterima ${receivedValue.toLocaleString("id-ID")}.`,
    );
  }
}

/**
 * Keep a service PO's subcontract cost on the work order's production orders in
 * sync with what has actually been billed. Recomputes the PO's booked value as
 * the sum of its non-cancelled vendor bills' grandTotal and mirrors it onto
 * `ProductionCost` (`subcontract`) so subcontract work reaches HPP. No-op for
 * non-service POs or service POs whose work order has no production order.
 *
 * F-2026-10-20-71: when the sync skips a completed production order, log it
 * (structured, with the skipped ids) and return a caller-visible notice — the
 * vendor bill still posts, but the operator must see that the late cost was
 * refused into an already-finished HPP instead of hanging WIP.
 */
type ServicePoCostNotice = { productionOrderIds: number[]; text: string };

async function syncServicePoCostFromBills(
  tx: Prisma.TransactionClient,
  purchaseOrderId: number | null | undefined,
  userId: number | null,
): Promise<ServicePoCostNotice | null> {
  if (!purchaseOrderId) return null;
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { isService: true, workOrderId: true, documentNo: true },
  });
  if (!po || !po.isService || po.workOrderId == null) return null;

  const agg = await tx.vendorBill.aggregate({
    where: { purchaseOrderId, status: { notIn: ["cancelled"] } },
    _sum: { grandTotal: true },
  });
  const billedTotal = Number(agg._sum.grandTotal ?? 0);

  const synced = await syncServicePurchaseOrderCost(
    {
      purchaseOrderId,
      amount: billedTotal,
      documentNo: po.documentNo,
      createdBy: userId,
    },
    tx,
  );

  if (synced.skippedProductionOrderIds.length === 0) return null;

  console.warn(
    `[syncServicePoCostFromBills] biaya subkontrak PO ${po.documentNo} tidak diterapkan ke HPP: perintah produksi sudah selesai (id: ${synced.skippedProductionOrderIds.join(", ")}); tagihan tetap diposting ke utang`,
  );
  return {
    productionOrderIds: synced.skippedProductionOrderIds,
    text: `Biaya subkontrak tidak diterapkan ke HPP karena perintah produksi sudah selesai (id: ${synced.skippedProductionOrderIds.join(", ")}). Tagihan tetap diposting ke utang.`,
  };
}

import { logActivity } from "@/lib/services/activity-log.service";

type PurchaseOrderLine = { itemId: number; qty: number; unitPrice: number; discount: number };

/**
 * Baris retur pembelian dari JSON FormData `items`
 * ([{ itemId, qty, price? }]). qty/harga bisa string berformat Indonesia
 * dari klien non-form ("2.000" = 2000, "150.000" = 150000) — wajib lewat
 * parser repo; Number() mentah membaca "2.000" jadi 2 dan "abc" jadi NaN
 * yang lolos filter >0, lalu penjaga over-return ikut menilai angka rusak
 * dan qty tersimpan menyusut diam-diam (harga beku F-004 ikut salah).
 * Baris berkode item dengan qty/harga tak terbaca ditolak berpesan, bukan
 * dibuang/dinclamp diam-diam. Baris tanpa item (itemId kosong/0) tetap
 * dibuang (baris kosong form); qty <= 0 pada baris berkode tetap dibuang
 * (perilaku lama: baris belum diisi).
 */
type PurchaseReturnItemInput = {
  itemId: number;
  qty: number;
  price: number | null;
};

function parsePurchaseReturnItems(
  itemsJson: string | null | undefined,
): PurchaseReturnItemInput[] {
  const rows =
    safeJsonParse<
      { itemId?: unknown; qty?: unknown; price?: unknown }[]
    >(itemsJson ?? null) ?? [];
  const items: PurchaseReturnItemInput[] = [];
  for (const row of rows) {
    const itemId = parseLocaleNumber(
      row?.itemId as string | number | null | undefined,
    );
    if (itemId === null || itemId <= 0) continue;
    const qty = parseLocaleNumber(
      row.qty as string | number | null | undefined,
    );
    if (qty === null) {
      throw new Error(
        `Kuantitas retur item #${itemId} tidak valid — isi angka lebih dari 0 (mis. 2 atau 2.000).`,
      );
    }
    if (qty <= 0) continue;
    let price: number | null = null;
    if (row.price != null && row.price !== "") {
      price = parseMoneyAmount(
        row.price as string | number | null | undefined,
      );
      if (price === null || price <= 0) {
        throw new Error(
          `Harga beli retur item #${itemId} tidak valid — isi angka lebih dari 0 (mis. 150.000).`,
        );
      }
    }
    items.push({ itemId, qty, price });
  }
  return items;
}

/**
 * Data baris simpan retur: cost entered-unit dari peta biaya dokumen,
 * price = harga payload ter-parse, else harga beku tagihan asal (F-004).
 * Satu sumber create+update (duplikasi blok map pernah kena gerbang Sonar).
 */
function purchaseReturnItemData(
  items: PurchaseReturnItemInput[],
  documentCostByItem: Map<number, number>,
  billPriceByItem: Map<number, number>,
) {
  return items.map((item) => ({
    itemId: item.itemId,
    // qty sudah angka ter-parse (helper parsePurchaseReturnItems):
    // "2.000" tiba sebagai 2000, bukan menyusut jadi 2 / NaN->0.01.
    qty: item.qty,
    cost: documentCostByItem.get(item.itemId) ?? 0,
    price: item.price ?? (billPriceByItem.get(item.itemId) ?? null),
  }));
}

/**
 * Penjaga over-return di dalam transaksi (kunci baris PO di pemanggil):
 * qty diterima kumulatif (GR verified/completed) vs qty sudah diretur
 * (non-cancelled, excludeReturnId = retur yang sedang diedit). Biaya
 * dokumen entered-unit = cost dasar x faktor UoM baris GR pertama.
 * Satu sumber create+update (duplikasi blok pernah kena gerbang Sonar).
 * Return: peta biaya dokumen; melempar Error berpesan bila melanggar.
 */
async function assertPurchaseReturnWithinReceived(
  tx: Prisma.TransactionClient,
  purchaseOrderId: number,
  items: PurchaseReturnItemInput[],
  baseCostByItem: Map<number, number>,
  excludeReturnId?: number,
): Promise<Map<number, number>> {
  const itemIds = items.map((it) => it.itemId);
  const grItems = await tx.goodsReceiptItem.findMany({
    where: {
      goodsReceipt: {
        purchaseOrderId,
        status: { in: [PurchaseStatus.VERIFIED, Status.COMPLETED] },
      },
      itemId: { in: itemIds },
    },
    select: { itemId: true, qty: true, uom: true },
  });
  const uomByItem = new Map<number, string | null>();
  for (const line of grItems) {
    if (!uomByItem.has(line.itemId)) uomByItem.set(line.itemId, line.uom);
  }
  const factorRows = await Promise.all(
    itemIds.map(
      async (itemId) =>
        [itemId, await toBaseFactor(tx, itemId, uomByItem.get(itemId))] as const,
    ),
  );
  const factorByItem = new Map(factorRows);
  const documentCostByItem = new Map(
    [...baseCostByItem].map(([itemId, cost]) => [
      itemId,
      cost * (factorByItem.get(itemId) ?? 1),
    ]),
  );
  const receivedQtyByItem = new Map<number, number>();
  for (const it of grItems) {
    receivedQtyByItem.set(
      it.itemId,
      (receivedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty),
    );
  }
  const priorReturns = await tx.purchaseReturnItem.findMany({
    where: {
      purchaseReturn: {
        purchaseOrderId,
        status: { not: "cancelled" },
        ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}),
      },
      itemId: { in: itemIds },
    },
    select: { itemId: true, qty: true },
  });
  const alreadyReturnedByItem = new Map<number, number>();
  for (const r of priorReturns) {
    alreadyReturnedByItem.set(
      r.itemId,
      (alreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty),
    );
  }
  const violation = findOverReturn(
    items.map((it) => ({ itemId: it.itemId, qty: it.qty })),
    receivedQtyByItem,
    alreadyReturnedByItem,
  );
  if (violation) {
    if (violation.type === "not_on_invoice") {
      throw new Error(
        `Item #${violation.itemId} belum pernah diterima untuk PO ini, tidak bisa diretur.`,
      );
    }
    throw new Error(
      `Jumlah retur item #${violation.itemId} melebihi yang diterima ` +
        `(diterima: ${violation.invoiced}, sudah diretur: ${violation.alreadyReturned}, sisa: ${violation.remaining}).`,
    );
  }
  return documentCostByItem;
}

function buildPurchaseOrderTotals(lines: PurchaseOrderLine[], shippingCost: number, serviceFee: number) {
  const subtotal = lines.reduce((s, it) => safeAdd(s, safeMultiply(it.qty, it.unitPrice, 0), 0), 0);
  const discount = lines.reduce((s, it) => safeAdd(s, it.discount || 0, 0), 0);
  return {
    subtotal,
    discount,
    grandTotal: safeAdd(safeSubtract(subtotal, discount, 0), safeAdd(shippingCost, serviceFee, 0), 0),
  };
}

function purchaseOrderItemData(it: PurchaseOrderLine) {
  return {
    // itemId/qty/unitPrice/discount sudah angka ter-parse
    // (parsePurchaseOrderItems): "2.000" tiba sebagai 2000.
    itemId: it.itemId,
    qty: it.qty,
    unitPrice: it.unitPrice,
    discount: it.discount || 0,
    total: safeSubtract(safeMultiply(it.qty, it.unitPrice, 0), it.discount || 0, 0),
  };
}

type PurchaseRequestItemInput = {
  itemId: number;
  qty: number;
  notes: string | null;
};

/**
 * Baris item Permintaan Pembelian dari JSON `items` via parser repo;
 * Number() mentah membaca "2.000" jadi 2 dan "abc" jadi NaN yang lolos
 * filter >0, lalu qty tersimpan menyusut diam-diam. Baris berkode item
 * dengan qty tak terbaca ditolak berpesan, bukan dibuang diam-diam.
 * Baris tanpa item (itemId kosong/0) tetap dibuang (baris kosong form);
 * qty <= 0 pada baris berkode tetap dibuang (perilaku lama: baris belum
 * diisi). Satu sumber create+update.
 */
function parsePurchaseRequestItems(
  itemsJson: string | null | undefined,
): PurchaseRequestItemInput[] {
  const rows =
    safeJsonParse<
      { itemId?: unknown; qty?: unknown; notes?: unknown }[]
    >(itemsJson ?? null) ?? [];
  const items: PurchaseRequestItemInput[] = [];
  for (const row of rows) {
    const itemId = parseLocaleNumber(
      row?.itemId as string | number | null | undefined,
    );
    if (itemId === null || itemId <= 0) continue;
    const qty = parseLocaleNumber(
      row.qty as string | number | null | undefined,
    );
    if (qty === null) {
      throw new Error(
        `Kuantitas permintaan item #${itemId} tidak valid — isi angka lebih dari 0 (mis. 2 atau 2.000).`,
      );
    }
    if (qty <= 0) continue;
    items.push({
      itemId,
      qty,
      notes: typeof row.notes === "string" && row.notes ? row.notes : null,
    });
  }
  return items;
}

// ==================== PURCHASE REQUEST ACTIONS ====================

export async function createPurchaseRequest(formData: FormData) {
  try {
    const user = await requirePermission("create_purchase_requests");

    const parsed = parseFormData(purchaseRequestSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("PR");
    const slug = await nextSlug("purchaseRequest", documentNo);
    const requestedBy = v.requestedBy || Number(user.id);
    const items = parsePurchaseRequestItems(v.items);

    const requestDateRaw = v.requestDate;
    const description = v.description ?? null;

    const pr = await prisma.purchaseRequest.create({
      data: {
        documentNo,
        slug,
        title: v.title ?? null,
        requestedBy,
        vendorId: v.vendorId ?? null,
        date: wibDateToUtcMidnight(v.date),
        requestDate: requestDateRaw ? wibDateToUtcMidnight(requestDateRaw) : null,
        description,
        notes: v.notes ?? null,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: items.map((i) => ({
            itemId: i.itemId,
            qty: i.qty,
            notes: i.notes,
          })),
        },
      },
    });

    await logActivity(
      "create",
      "PurchaseRequest",
      pr.id,
      `Membuat permintaan pembelian #${pr.id}`,
    );
    await requestApprovalIfConfigured("PurchaseRequest", pr.id, Number(user.id));
    revalidatePath("/pembelian/permintaan");
    return { success: true, id: pr.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPurchaseRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function createPurchaseOrder(formData: FormData) {
  try {
    const user = await requirePermission("create_purchase_orders");

    const idempotencyKey = formData.get("idempotencyKey") as string | null;

    const parsed = parseFormData(purchaseOrderSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("PO");
    const slug = await nextSlug("purchaseOrder", documentNo);

    const poItems = parsePurchaseOrderItems(v.items);

    const shippingCost = v.shippingCost ?? 0;
    const serviceFee = v.serviceFee ?? 0;
    const { subtotal, discount: discountTotal, grandTotal } = buildPurchaseOrderTotals(poItems, shippingCost, serviceFee);

    const po = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id);

      // Gerbang status PR: daftar PR siap-pesan dan tombol Buat Pesanan hanya
      // menawarkan approved/partial_ordered; server menegakkannya juga supaya
      // URL basi ke PR konsep/ditolak tidak melahirkan PO tanpa persetujuan.
      if (v.purchaseRequestId) {
        const pr = await tx.purchaseRequest.findUnique({
          where: { id: v.purchaseRequestId },
          select: { status: true, documentNo: true },
        });
        if (!pr) throw new Error("Permintaan Pembelian tidak ditemukan");
        if (!["approved", "partial_ordered"].includes(pr.status)) {
          throw new Error(
            `Permintaan Pembelian ${pr.documentNo} berstatus '${pr.status}' belum bisa dibuatkan pesanan (harus Disetujui/Sebagian Terpesan)`,
          );
        }
      }

      const created = await tx.purchaseOrder.create({
        data: {
          documentNo,
          slug,
          vendorId: v.vendorId,
          purchaseRequestId: v.purchaseRequestId ?? null,
          workOrderId: v.workOrderId ?? null,
                    isService: v.isService,
          date: wibDateToUtcMidnight(v.date),
          expectedDate: v.expectedDate ? wibDateToUtcMidnight(v.expectedDate) : null,
          paymentTerm: v.paymentTerm ?? null,
          shippingCost,
          serviceFee,
          notes: v.notes ?? null,
          subtotal,
          discount: discountTotal,
          tax: 0,
          grandTotal,
          status: "draft",
          createdBy: Number(user.id),
          items: {
            create: poItems.map(purchaseOrderItemData),
          },
        },
      });

      // Update PR status if linked
      if (v.purchaseRequestId) {
        await onPurchaseOrderCreated(created.id, tx);
      }

      // Route through approval workflow if one is configured for PurchaseOrder.
      await requestApprovalIfConfigured("PurchaseOrder", created.id, Number(user.id), tx);

      return created;
    });

    // Notify admins (external, do not fail PO if this fails)
    try {
      await notificationService.notifyAdmins(
        "Pesanan Pembelian baru dibuat",
        `/pembelian/pesanan/${slug ?? po.id}`,
      );
    } catch (err) {
      console.error("Gagal mengirim notifikasi admin:", err);
    }

    await logActivity(
      "create",
      "PurchaseOrder",
      po.id,
      `Membuat pesanan pembelian #${po.id}`,
    );
    revalidatePath("/pembelian/pesanan");
    return { success: true, id: po.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPurchaseOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Create a SERVICE purchase order from a Work Order's service items (PRD FAB-08 /
 * PUR-17). A work order may include service lines (coating, machining, laser
 * cutting) — items flagged `isService`. This bundles every service line into one
 * draft PO linked to the work order (`workOrderId`, `isService: true`), so the
 * workshop can sub-contract them and receive the cost via a service GRN (which
 * expenses rather than moves stock).
 *
 * One active service PO per work order: a second attempt is rejected unless
 * `force` is set, preventing accidental duplicate subcontracting.
 */
export async function createServicePurchaseOrderFromWorkOrder(
  workOrderId: number,
  vendorId: number,
  options?: { force?: boolean },
) {
  try {
    const user = await requirePermission("create_purchase_orders");
    if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
      throw new Error("Perintah kerja tidak valid");
    }
    if (!Number.isInteger(vendorId) || vendorId <= 0) {
      throw new Error("Vendor jasa wajib dipilih");
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor tidak ditemukan atau tidak aktif");

    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        documentNo: true,
        status: true,
        items: {
          select: { itemId: true, qty: true, cost: true },
        },
      },
    });
    if (!wo) throw new Error("Perintah kerja tidak ditemukan");
    if (wo.status === "cancelled" || wo.status === "completed") {
      throw new Error(`Tidak bisa membuat PO jasa untuk perintah kerja berstatus '${wo.status}'`);
    }

    // WorkOrderItem has no item relation — resolve the service flags in one query.
    const woItemIds = [...new Set(wo.items.map((i) => i.itemId))];
    const itemRows = woItemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: woItemIds }, isService: true, isActive: true, deletedAt: null },
          select: { id: true },
        })
      : [];
    const serviceItemIds = new Set(itemRows.map((i) => i.id));

    const serviceLines = wo.items
      .filter((i) => serviceItemIds.has(i.itemId) && Number(i.qty) > 0)
      .map((i) => ({
        itemId: i.itemId,
        qty: Number(i.qty),
        unitPrice: Number(i.cost ?? 0),
      }));
    if (serviceLines.length === 0) {
      throw new Error("Perintah kerja ini tidak memiliki item jasa (isService) untuk dipesan");
    }

    // Guard against accidental duplicate subcontracting.
    const existing = options?.force
      ? null
      : await prisma.purchaseOrder.findFirst({
          where: {
            workOrderId,
            isService: true,
            status: { notIn: ["cancelled", "rejected"] },
          },
          select: { id: true, documentNo: true },
        });
    if (existing) {
      throw new Error(
        `PO jasa untuk perintah kerja ini sudah ada (${existing.documentNo}). ` +
          `Batalkan PO tersebut dulu, atau buat ulang dengan paksa.`,
      );
    }

    const subtotal = serviceLines.reduce(
      (s, it) => safeAdd(s, safeMultiply(it.qty, it.unitPrice, 0), 0),
      0,
    );
    const documentNo = await generateDocumentNumber("PO");
    const slug = await nextSlug("purchaseOrder", documentNo);

    const po = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          documentNo,
          slug,
          vendorId,
          workOrderId,
          isService: true,
          date: new Date(),
          notes: `PO jasa/subkontrak untuk perintah kerja ${wo.documentNo}`,
          subtotal,
          discount: 0,
          tax: 0,
          grandTotal: subtotal,
          status: "draft",
          createdBy: Number(user.id),
          items: {
            create: serviceLines.map((it) => ({
              itemId: it.itemId,
              qty: it.qty,
              unitPrice: it.unitPrice,
              discount: 0,
              total: safeMultiply(it.qty, it.unitPrice, 0),
            })),
          },
        },
      });
      await requestApprovalIfConfigured("PurchaseOrder", created.id, Number(user.id), tx);
      return created;
    });

    try {
      await notificationService.notifyAdmins(
        "PO jasa dari perintah kerja dibuat",
        `/pembelian/pesanan/${slug ?? po.id}`,
      );
    } catch (err) {
      console.error("Gagal mengirim notifikasi admin:", err);
    }

    await logActivity(
      "create",
      "PurchaseOrder",
      po.id,
      `Membuat PO jasa #${po.id} dari perintah kerja ${wo.documentNo}`,
    );
    revalidatePath("/pembelian/pesanan");
    revalidatePath(`/produksi/perintah-kerja/${workOrderId}`);
    return { success: true, id: po.id, documentNo: po.documentNo, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createServicePurchaseOrderFromWorkOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function cancelPurchaseOrder(poId: number) {
  try {
    await requirePermission("edit_purchase_orders");

    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${poId} FOR UPDATE`;
      }
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: poId },
      });

      if (
        po.status === "received" ||
        po.status === "cancelled" ||
        po.status === "partial_received"
      ) {
        throw new Error("PO ini tidak dapat dibatalkan");
      }

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: "cancelled" },
      });
    });

    await logActivity(
      "cancel",
      "PurchaseOrder",
      poId,
      `Membatalkan pesanan pembelian #${poId}`,
    );
    revalidatePath("/pembelian/pesanan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[cancelPurchaseOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== GOODS RECEIPT ACTIONS ====================

export async function createGoodsReceipt(formData: FormData) {
  try {
    const user = await requirePermission("create_goods_receipts");

    const parsed = parseFormData(goodsReceiptSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("GR");
    const slug = await nextSlug("goodsReceipt", documentNo);
    const items = parseGrItems(v.items);

    assertGrItemExpiryDates(items);

    // Scope gudang: header DAN setiap baris harus berada di gudang yang boleh diakses
    // user. Tanpa cek ini, pemegang create_goods_receipts yang hanya ditugaskan ke
    // gudang A bisa menerima stok ke gudang B (termasuk membuat layer FIFO/batch/serial
    // di gudang yang bukan wewenangnya).
    const scope = await getWarehouseScope(user);
    assertWarehouseAccess(scope, v.warehouseId);
    for (const item of items) {
      if (item.warehouseId) assertWarehouseAccess(scope, Number(item.warehouseId));
    }

    const gr = await prisma.$transaction(async (tx) => {
      // Lock + validate the PO status before creating the receipt. Without this a
      // GR could be created against a PO that is still draft (bypassing approval),
      // already received, or cancelled — and the unconditional flip to "received"
      // below would then also block cancelPurchaseOrder. A receipt is only valid
      // against an approved/ordered PO.
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`;
      }
      const po = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: v.purchaseOrderId },
        include: { items: { select: { itemId: true, qty: true } } },
      });
      // Snapshot the ordered qty per item onto each GR line. Without this the
      // detail page's "Qty Dipesan" reads the (always 0) column and the receipt
      // looks like it was ordered for nothing. `poQtyMap` is reused below for
      // the over-receive guard.
      const orderedQtyByItem = new Map<number, number>(
        po.items.map((i) => [i.itemId, Number(i.qty)]),
      );
      if (
        po.status !== "approved" &&
        po.status !== "ordered" &&
        po.status !== "partial_received"
      ) {
        throw new Error(
          `Penerimaan barang hanya bisa dibuat dari PO berstatus 'approved', 'ordered', atau 'partial_received' (status saat ini: '${po.status}').`,
        );
      }

      // The cumulative over-receive guard runs at verification (goods-receipt
      // hook) in BASE units; no prior-receipt aggregation is needed here.
      const poQtyMap = orderedQtyByItem;

      // Pre-aggregate this submission's qty per itemId so duplicate lines in the
      // same payload (e.g. two rows for the same item) can't each pass the
      // over-receive check independently and together exceed the ordered qty.
      const submittedQtyByItem = new Map<number, number>();
      for (const item of items) {
        if (item.itemId <= 0 || item.qty <= 0) continue;
        submittedQtyByItem.set(
          item.itemId,
          (submittedQtyByItem.get(item.itemId) ?? 0) + Number(item.qty),
        );
      }

      // NOTE: the cumulative over-receive guard lives in the verification hook
      // (goods-receipt.hook.ts), which converts every GR row to the item's BASE
      // unit before comparing against the PO qty. GoodsReceiptItem.qty is stored
      // in the ENTERED unit, so a comparison here would be apples-to-oranges
      // (base PO qty vs entered GR qty) and wrongly reject valid receipts entered
      // in a smaller-than-base UoM. Only assert membership here.
      for (const [itemId, submittedQty] of submittedQtyByItem) {
        if (submittedQty <= 0) continue
        const ordered = poQtyMap.get(itemId) ?? 0
        if (ordered === 0) {
          throw new Error(
            `Item #${itemId} tidak ada dalam pesanan pembelian (PO).`,
          );
        }
      }

      const createdGr = await tx.goodsReceipt.create({
        data: {
          documentNo,
          slug,
          purchaseOrderId: v.purchaseOrderId,
          warehouseId: v.warehouseId,
          date: wibDateToUtcMidnight(v.date),
          referenceNumber: v.referenceNumber ?? null,
          notes: v.notes ?? null,
          shippingCost: v.shippingCost ?? 0,
          otherCost: v.otherCost ?? 0,
          adminFee: v.adminFee ?? 0,
          status: "draft",
          createdBy: Number(user.id),
          items: {
            create: items
              .filter((i) => i.itemId > 0 && i.qty > 0)
              .map((i) => goodsReceiptItemData(i, orderedQtyByItem)),
          },
        },
      });

      // Mark the PO as receiving-in-progress. The final "received" status is
      // set by onGoodsReceiptVerified once cumulative received qty meets the
      // ordered qty. Using "partial_received" (not "received") here keeps the
      // PO open so multi-shipment deliveries can create further GRs.
      await tx.purchaseOrder.update({
        where: { id: createdGr.purchaseOrderId },
        data: { status: "partial_received" },
      });

      return createdGr;
    });

    await logActivity(
      "create",
      "GoodsReceipt",
      gr.id,
      `Membuat penerimaan barang #${gr.id}`,
    );
    revalidatePath("/pembelian/penerimaan");
    return { success: true, id: gr.id };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createGoodsReceipt]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function verifyGoodsReceipt(grId: number) {
  try {
    const user = await requirePermission("verify_goods_receipts");

    const gr = await prisma.goodsReceipt.findUniqueOrThrow({
      where: { id: grId },
      include: { items: { select: { warehouseId: true } } },
    });

    // Scope gudang (header + baris): verifikasi menulis stok/jurnal di gudang GR.
    assertWarehouseAccessMulti(await getWarehouseScope(user), [
      gr.warehouseId,
      ...gr.items.map((i) => i.warehouseId).filter((w): w is number => w != null),
    ]);

    if (gr.status !== "draft") {
      throw new Error("Penerimaan Barang hanya bisa diverifikasi dari status draf");
    }

    // Hook: auto-number, PO status update, Stock Move IN
    await onGoodsReceiptVerified(grId, Number(user.id));

    // Notify admins
    await notificationService.notifyAdmins(
      "Penerimaan Barang diterima",
      `/pembelian/penerimaan/${gr.slug ?? grId}`,
    );

    await logActivity(
      "verify",
      "GoodsReceipt",
      grId,
      `Verifikasi penerimaan barang #${grId}`,
    );
    revalidatePath("/pembelian/penerimaan");
    revalidatePath("/pembelian/pesanan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[verifyGoodsReceipt]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== VENDOR BILL ACTIONS ====================

type VendorBillItemInput = {
  itemId?: number | string | null;
  qty?: number | string;
  unitPrice?: number | string;
  discountPercent?: number | string;
  taxPercent?: number | string;
};

/** Alias: baris form bill = `VendorBillLineInput` builder finance (satu bentuk). */
type VendorBillLineInput = VendorBillItemInput;

/**
 * F-2026-10-28-157-V Putusan 1 — guard per-baris harga vs acuan PO/GR.
 *
 * Tiap baris bill ber-PO dibandingkan ke harga acuan baris PO/GR yang
 * ditautkan (`VendorBillItem.goodsReceiptItemId → GoodsReceiptItem.unitCost`,
 * fallback `PurchaseOrderItem.unitPrice` untuk jasa). Acuan dibaca per LINE
 * melintasi SEMUA GR milik PO (bukan first-GR saja): tiap baris GR (unitCost)
 * dikelompokkan per itemId berurut id menaik, lalu dikonsumsi berurutan
 * mengikuti urutan baris bill — cermin `loadGrLineQueues`/`mapVendorBillItems`
 * supaya dua baris bill item sama tertaut ke DUA baris GR berbeda. Syarat
 * lolos per baris: `|net_bill − net_acuan| ≤ max(Rp1000, 1% × qty × unitCost_acuan)`.
 * Guard agregat existing (`assertThreeWayMatch` +
 * `assertGrBillingWithinReceived`) TETAP — guard ini menambah, bukan mengganti.
 *
 * Diskon baris ikut via `computeBillLineAmounts` (net `subtotal` baris vs net
 * acuan), bukan harga bruto — diskon sah bukan over-bill. Over-bill HARGA
 * (unitPrice naik, qty sama) dan over-bill QTY (qty naik) diperlakukan SAMA di
 * angka, dibedakan hanya di pesan error. Bill TANPA baris (kop manual) diskip
 * by-design — pagar tetap guard agregat jasa. Toleransi ini GUARD KUANTITAS,
 * bukan toleransi uang lunas (status lunas tetap `isSettled` Rp1).
 */
async function assertBillLinePricesWithinReference(
  tx: Prisma.TransactionClient,
  purchaseOrderId: number,
  itemsJson: string | null | undefined,
): Promise<void> {
  const rows = safeJsonParse<VendorBillLineInput[]>(itemsJson ?? null) ?? [];
  const lines = rows.filter(
    (r) => safeRound(parseLocaleNumber(r.qty) ?? 0, 2) > 0,
  );
  if (lines.length === 0) return; // kop manual: pagar tetap agregat jasa
  const itemIds = Array.from(
    new Set(
      lines
        .map((r) =>
          r.itemId != null && r.itemId !== ""
            ? Number(r.itemId)
            : Number.NaN,
        )
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  if (itemIds.length === 0) return;
  // Acuan per LINE melintasi SEMUA GR milik PO: mock tx lama tanpa
  // purchaseOrderItem/goodsReceiptItem = kop manual pola lama, pagar agregat.
  const poModel = (tx as unknown as { purchaseOrderItem?: { findMany: (a: unknown) => Promise<never[]> } }).purchaseOrderItem;
  const grModel = (tx as unknown as { goodsReceiptItem?: { findMany: (a: unknown) => Promise<never[]> } }).goodsReceiptItem;
  if (!poModel || !grModel) return;
  const poLines = (await poModel.findMany({
    where: { purchaseOrderId, itemId: { in: itemIds } },
    select: { itemId: true, unitPrice: true, qty: true },
  })) as { itemId: number; unitPrice: unknown; qty: unknown }[];
  const poByItem = new Map(poLines.map((p) => [p.itemId, p]));
  // Acuan per LINE melintasi SEMUA GR milik PO: baris GR dikelompokkan per
  // itemId berurut id menaik, lalu dikonsumsi berurutan mengikuti urutan baris
  // bill (cermin loadGrLineQueues/mapVendorBillItems) — bukan first-GR saja.
  const grRows = (await grModel.findMany({
    where: {
      goodsReceipt: { purchaseOrderId },
      itemId: { in: itemIds },
    },
    select: { id: true, itemId: true, unitCost: true },
    orderBy: { id: "asc" },
  })) as { id: number; itemId: number; unitCost: unknown }[];
  const grQueuesByItem = new Map<number, number[]>();
  for (const g of grRows) {
    const unitCost = Number(g.unitCost ?? 0);
    const bucket = grQueuesByItem.get(g.itemId);
    if (bucket) bucket.push(unitCost);
    else grQueuesByItem.set(g.itemId, [unitCost]);
  }
  for (const row of lines) {
    const itemId = row.itemId != null && row.itemId !== "" ? Number(row.itemId) : Number.NaN;
    if (!Number.isFinite(itemId) || itemId <= 0) continue;
    const poLine = poByItem.get(itemId);
    const refPrice = poLine != null ? Number(poLine.unitPrice ?? 0) : Number.NaN;
    const refQty = poLine != null ? Number(poLine.qty ?? 0) : 0;
    if (!poLine || !(refPrice > 0)) continue; // baris tanpa acuan PO tak terjangkau guard
    const amounts = computeBillLineAmounts(row);
    // Konsumsi acuan GR berurutan per baris bill; antrean habis = fallback
    // harga PO (jasa/tanpa GR). Acuan GR hanya dipakai bila unitCost > 0.
    const grCost = grQueuesByItem.get(itemId)?.shift();
    const refNetPerUnit =
      grCost != null && grCost > 0 ? grCost : refPrice;
    const tolerance = Math.max(1000, safeMultiply(amounts.qty * refNetPerUnit, 0.01, 2));
    const diff = Math.abs(safeSubtract(amounts.subtotal, safeMultiply(amounts.qty, refNetPerUnit, 2), 2));
    if (diff > tolerance) {
      const overQty = refQty > 0 && amounts.qty > refQty;
      throw new Error(
        overQty
          ? `Harga per baris item #${itemId} melebihi acuan: qty ${amounts.qty} melebihi qty PO ${refQty} (selisih Rp${diff.toLocaleString("id-ID")} > toleransi Rp${tolerance.toLocaleString("id-ID")}).`
          : `Harga per baris item #${itemId} melebihi acuan: Rp${amounts.unitPrice.toLocaleString("id-ID")} vs acuan Rp${Number(refNetPerUnit).toLocaleString("id-ID")} (selisih Rp${diff.toLocaleString("id-ID")} > toleransi Rp${tolerance.toLocaleString("id-ID")}).`,
      );
    }
  }
}

/**
 * F-2026-10-28-157-V Putusan 3 — bill ber-PO WAJIB `terms` format referensi
 * `TERMIN n/m — <acuan>`; kosong = termin tunggal, LULUS.
 */
function assertTermsReference(terms: string | null | undefined): void {
  if (!isValidTermsReference(terms)) {
    throw new Error(VENDOR_BILL_TERMS_REF_ERROR);
  }
}

type ItemMeta = { sku: string; name: string; unitOfMeasure: string | null };

/**
 * Baris penerimaan (`GoodsReceiptItem.id`) yang masih tersedia untuk ditautkan,
 * dikelompokkan per `itemId` dan berurut id menaik. Satu baris tagihan mengonsumsi
 * satu entri (`shift`), sehingga dua baris tagihan untuk item yang sama tertaut ke
 * DUA baris penerimaan yang berbeda — bukan dua kali ke baris pertama.
 */
type GrLineQueues = Map<number, number[]>;

/**
 * Tautkan tagihan ke penerimaannya (`VendorBill.goodsReceiptId` +
 * `VendorBillItem.goodsReceiptItemId`) supaya backlink "Penerimaan Barang" dan
 * laporan Diterima Belum Ditagih (GR/IR) tidak lagi selalu kosong.
 *
 * Baris tagihan TIDAK membawa id baris penerimaan dari form (form tagihan hanya
 * mengirim itemId/qty/harga), jadi pemetaannya dilakukan di sini: baris penerimaan
 * dikelompokkan per item dan dikonsumsi berurutan sesuai urutan baris tagihan yang
 * dikirim — yang bila datang dari "Buat Tagihan dari Penerimaan" persis mengikuti
 * urutan baris penerimaan.
 */
async function loadGrLineQueues(
  tx: Prisma.TransactionClient,
  goodsReceiptId: number,
): Promise<GrLineQueues> {
  const lines = await tx.goodsReceiptItem.findMany({
    where: { goodsReceiptId },
    select: { id: true, itemId: true },
    orderBy: { id: "asc" },
  });
  const queues: GrLineQueues = new Map();
  for (const line of lines) {
    const bucket = queues.get(line.itemId);
    if (bucket) bucket.push(line.id);
    else queues.set(line.itemId, [line.id]);
  }
  return queues;
}

/** Map the form's item rows to `vendor_bill_items` rows (totals computed server-side). */
function mapVendorBillItems(
  rows: VendorBillItemInput[],
  metaById: Map<number, ItemMeta>,
  grLineQueues?: GrLineQueues,
) {
  return rows
    .filter((r) => safeRound(parseLocaleNumber(r.qty) ?? 0, 2) > 0)
    .map((r) => {
      const itemId =
        r.itemId != null && r.itemId !== "" ? Number(r.itemId) : null;
      const meta = itemId != null ? metaById.get(itemId) : undefined
      const {
        qty,
        unitPrice,
        discountPercent,
        taxPercent,
        discountAmount,
        subtotal,
        taxAmount,
        total,
      } = computeBillLineAmounts(r)
      const goodsReceiptItemId =
        itemId != null ? (grLineQueues?.get(itemId)?.shift() ?? null) : null
      return {
        itemId,
        goodsReceiptItemId,
        description: meta ? `${meta.sku} - ${meta.name}` : null,
        unit: meta?.unitOfMeasure ?? null,
        qty,
        unitPrice,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        subtotal,
        total,
      };
    });
}

/**
 * Persist a vendor bill's item lines from the form's `items` JSON. The goods are
 * recorded on the document itself (description + qty + price + totals) so a bill
 * that settles already-sold stock still shows what was bought, independent of
 * inventory. Called inside the caller's transaction.
 *
 * `grLineQueues` (see loadGrLineQueues) fills `goodsReceiptItemId` per line when
 * the bill is tied to a goods receipt.
 */
async function persistVendorBillItems(
  tx: Prisma.TransactionClient,
  vendorBillId: number,
  itemsJson: string | null | undefined,
  grLineQueues?: GrLineQueues,
): Promise<void> {
  const rows = safeJsonParse<VendorBillItemInput[]>(itemsJson ?? null) ?? [];
  if (rows.length === 0) return;

  const ids = Array.from(
    new Set(
      rows
        .map((r) => Number(r.itemId))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  const meta = ids.length
    ? await tx.item.findMany({
        where: { id: { in: ids } },
        select: { id: true, sku: true, name: true, unitOfMeasure: true },
      })
    : [];
  const metaById = new Map<number, ItemMeta>(
    meta.map((i) => [
      i.id,
      { sku: i.sku, name: i.name, unitOfMeasure: i.unitOfMeasure },
    ]),
  );

  const data = mapVendorBillItems(rows, metaById, grLineQueues);
  if (data.length === 0) return;
  await tx.vendorBillItem.createMany({
    data: data.map((r) => ({ ...r, vendorBillId })),
  });
}

export async function createVendorBill(formData: FormData) {
  try {
    const user = await requirePermission("create_vendor_bills");

    const parsed = parseFormData(vendorBillSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("BILL");
    const slug = await nextSlug("vendorBill", documentNo);

    // Lock the PO row, run the 3-way match, and create the bill atomically so
    // two concurrent createVendorBill calls on the same PO cannot both pass
    // the match and over-bill. With the draft bill now counted by
    // assertThreeWayMatch, the serialized second call sees the first bill and
    // is rejected. Mirrors the confirmVendorPayment lock pattern.
    //
    // Draft MURNI tanpa jurnal (P0-2, lihat catatan di akhir transaksi ini):
    // tidak ada jurnal AP yang diposting di sini — satu titik pengakuan adalah
    // confirmVendorBill.
    // Bila form mengirim baris, kop (subtotal bruto/diskon/pajak/total)
    // dihitung ulang dari baris yang sama dengan yang ditulis ke
    // vendor_bill_items; tanpa baris, kop manual form dipertahankan.
    const billHeader = summarizeBillItems(v.items) ?? {
      subtotal: v.subtotal,
      discountAmount: 0,
      tax: v.tax,
      grandTotal: v.grandTotal,
    };

    const bill = await prisma.$transaction(async (tx) => {
      // F-2026-10-24-133-V Putusan 2/4: penanda L3 pada notes menjadikan
      // tagihan ini biaya telat NON-JOB sesudah WO closed. Wajib tanpa
      // tautan PO/GR (tautan = jalur L1/L2), WO closed, alasan tertulis,
      // dan lolos guard duplikat; ActivityLog WO ditulis dalam tx sama.
      const l3 = await resolveL3WorkOrder(tx, v.notes, "Tagihan vendor");
      if (l3 && (v.purchaseOrderId || v.goodsReceiptId)) {
        throw new Error(L3_MSG.vendorBillLinked());
      }
      if (l3) {
        await assertNoDuplicateL3(tx, {
          workOrderId: l3.workOrder.id,
          workOrderNo: l3.workOrder.documentNo,
          vendorKey: `vendor:${v.vendorId}`,
          amount: billHeader.grandTotal,
          date: wibDateToUtcMidnight(v.date),
        });
      }

      if (v.purchaseOrderId) {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`;

        // Integrity: a PO-linked bill (goods OR service) must belong to the
        // SAME vendor as the bill, otherwise AP would be recognised against the
        // wrong vendor and the 3-way match would compare unrelated documents.
        // Service POs (e.g. sub-contract) flow through the same guard so a
        // service bill can never be booked to a different vendor than the one on
        // the PO it settles.
        const po = await tx.purchaseOrder.findUniqueOrThrow({
          where: { id: v.purchaseOrderId },
          select: { vendorId: true, documentNo: true, isService: true },
        });
        if (po.vendorId !== v.vendorId) {
          throw new Error(
            `Vendor tagihan tidak sesuai dengan vendor PO ${po.documentNo}.`,
          );
        }

        // F-2026-10-28-157-V Putusan 1+3: guard per-baris + referensi termin.
        assertTermsReference(v.terms);
        await assertBillLinePricesWithinReference(tx, v.purchaseOrderId, v.items);
      }

      await assertThreeWayMatch(tx, v.purchaseOrderId ?? null, billHeader.subtotal);

      // "Buat Tagihan dari Penerimaan" (`?grId=`): tautkan tagihan ke penerimaan
      // yang ditagih. Tanpa ini `VendorBill.goodsReceiptId` /
      // `VendorBillItem.goodsReceiptItemId` tidak pernah terisi, sehingga backlink
      // "Penerimaan Barang" di halaman tagihan selalu "—" dan laporan Diterima
      // Belum Ditagih (GR/IR) membaca 0 untuk setiap baris penerimaan.
      let grLineQueues: GrLineQueues | undefined;
      if (v.goodsReceiptId) {
        const gr = await tx.goodsReceipt.findUnique({
          where: { id: v.goodsReceiptId },
          select: {
            id: true,
            documentNo: true,
            status: true,
            purchaseOrder: { select: { vendorId: true } },
          },
        });
        if (!gr) {
          throw new Error("Penerimaan barang yang ditagih tidak ditemukan.");
        }
        // Penerimaan draft belum menambah stok maupun membersihkan akun clearing,
        // jadi menagihnya akan mencocokkan tagihan dengan penerimaan yang tidak ada.
        if (gr.status !== PurchaseStatus.VERIFIED && gr.status !== Status.COMPLETED) {
          throw new Error(
            `Penerimaan ${gr.documentNo} belum diverifikasi, jadi belum bisa ditagih.`,
          );
        }
        // Sama seperti penjagaan vendor PO di atas: AP tidak boleh diakui untuk
        // vendor lain daripada yang menerima barangnya.
        if (gr.purchaseOrder.vendorId !== v.vendorId) {
          throw new Error(
            `Vendor tagihan tidak sesuai dengan vendor penerimaan ${gr.documentNo}.`,
          );
        }

        grLineQueues = await loadGrLineQueues(tx, gr.id);

        // Guard tagih-ganda per-GR (BUG-09): tagihan yang sudah ada
        // (non-cancelled) DITAMBAH tagihan baru ini tidak boleh melebihi nilai
        // barang yang diterima pada GR ini. Nilai tagihan baru adalah nilai
        // barang neto diskon (subtotal bruto − diskon baris), sebanding dengan
        // Σ `VendorBillItem.subtotal` yang dijumlah penjaga untuk tagihan lama.
        await assertGrBillingWithinReceived(
          tx,
          gr.id,
          gr.documentNo,
          safeSubtract(billHeader.subtotal, billHeader.discountAmount, 2),
        );
      }

      const created = await tx.vendorBill.create({
        data: {
          documentNo,
          slug,
          vendorId: v.vendorId,
          purchaseOrderId: v.purchaseOrderId ?? null,
          goodsReceiptId: v.goodsReceiptId ?? null,
          projectId: v.projectId ?? null,
          withholdingTypeId: v.withholdingTypeId ?? null,
          withholdingAmount: v.withholdingAmount ?? 0,
          date: wibDateToUtcMidnight(v.date),
          dueDate: v.dueDate ? wibDateToUtcMidnight(v.dueDate) : null,
          vendorInvoiceNumber: v.vendorInvoiceNumber ?? null,
          taxInvoiceNumber: v.taxInvoiceNumber ?? null,
          terms: v.terms ?? null,
          notes: v.notes ?? null,
          // Kop dihitung ulang server dari baris (billHeader): angka kop
          // kiriman klien tidak dipercaya bila ada baris, karena jurnal AP,
          // DPP/PPN, dan 3-way match membaca kop ini — bukan barisnya.
          subtotal: billHeader.subtotal,
          discountAmount: billHeader.discountAmount,
          tax: billHeader.tax,
          grandTotal: billHeader.grandTotal,
          status: "draft",
          createdBy: Number(user.id),
        },
      });

      // Persist the item lines so the goods stay recorded on the document even
      // when they settle stock that is already gone (bill without a PO link).
      // Each line also links back to its goods-receipt line when the bill came
      // from a receipt.
      await persistVendorBillItems(tx, created.id, v.items, grLineQueues);

      // Putusan 4(2): jejak L3 pada WO dalam tx yang sama dengan dokumen.
      if (l3) {
        await writeL3ActivityLog(tx, {
          workOrder: l3.workOrder,
          sourceType: "VendorBill",
          sourceId: created.id,
          sourceDocumentNo: created.documentNo,
          vendorKey: `vendor:${v.vendorId}`,
          amount: billHeader.grandTotal,
          date: wibDateToUtcMidnight(v.date),
          reason: l3.tag.reason,
          userId: Number(user.id),
        });
      }

      // Associate uploaded attachments with the new vendor bill
      const attachmentIds = v.attachmentIds;
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "vendor_bill", referenceId: created.id, uploadedBy: Number(user.id),
        });
      }

      // P0-2: draft MURNI — tanpa jurnal, tanpa HPP. Satu titik pengakuan
      // adalah posting (confirmVendorBill): di sanalah jurnal AP + HPP jasa
      // dibuat. Sebelumnya jurnal lahir saat draft sementara laporan AP
      // mengecualikan draft → selisih AP vs GL.

      return created;
    });

    await logActivity(
      "create",
      "VendorBill",
      bill.id,
      `Membuat tagihan vendor #${bill.id}`,
    );
    revalidatePath("/pembelian/tagihan");
    return { success: true, id: bill.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVendorBill]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== VENDOR PAYMENT ACTIONS ====================

export async function createVendorPayment(formData: FormData) {
  try {
    const user = await requirePermission("create_vendor_payments");

    const parsed = parseFormData(vendorPaymentSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("VPAY");
    const slug = await nextSlug("vendorPayment", documentNo);

    // A payment may target a specific bill (chosen via the "Bayar" button on a
    // bill). Validate it belongs to the vendor and is still open, so a stale
    // link can't be saved.
    let targetBillId: number | null = null;
    if (v.vendorBillId != null) {
      const target = await prisma.vendorBill.findFirst({
        where: { id: v.vendorBillId, vendorId: v.vendorId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!target) {
        return { success: false, error: "Tagihan tidak ditemukan untuk vendor ini" };
      }
      if (target.status === "paid" || target.status === "cancelled") {
        return { success: false, error: "Tagihan sudah lunas atau dibatalkan" };
      }
      // Tagihan konsep belum diposting (jurnal utang + balanceDue lahir saat
      // Konfirmasi); membayarnya sekarang mengakui pembayaran atas utang yang
      // belum diakui. Tombol Bayar di UI memang tidak menawarkannya.
      if (target.status === "draft") {
        return { success: false, error: "Tagihan masih konsep — konfirmasi dulu sebelum dibayar" };
      }
      targetBillId = target.id;
    }

    // ATOMICITY: the payment row + the attachment pointer update must commit
    // together. If the attachment updateMany fails after the payment is
    // created, the user sees a payment without its supporting documents linked
    // (or worse, the attachments stay orphaned with referenceId=0 and never get
    // cleaned up). Wrapping both in one tx ties payment existence to the
    // attachment linkage.
    if (v.accountId != null) {
      const ok = await prisma.account.count({ where: { id: v.accountId } })
      if (!ok) return { success: false, error: `Akun tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.` }
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.vendorPayment.create({
        data: {
          documentNo,
          slug,
          vendorId: v.vendorId,
          amount: v.amount,
          paymentDate: wibDateToUtcMidnight(v.paymentDate),
          paymentMethod: v.paymentMethod,
          accountId: v.accountId ?? null,
          adminFee: v.adminFee ?? 0,
          vendorBillId: targetBillId,
          referenceNumber: v.referenceNumber ?? null,
          bankAccount: v.bankAccount ?? null,
          notes: v.notes ?? null,
          createdBy: Number(user.id),
        },
      });

      // Associate uploaded attachments with the new payment
      const attachmentIds = v.attachmentIds;
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "vendor_payment", referenceId: created.id, uploadedBy: Number(user.id),
        });
      }

      return created;
    });

    // Journal is NOT created here — it is posted only on confirmVendorPayment
    // to prevent draft/unconfirmed payments from affecting the GL.

    // Ajukan persetujuan bila workflow VendorPayment terkonfigurasi.
    await requestApprovalIfConfigured("VendorPayment", payment.id, Number(user.id));

    await logActivity(
      "create",
      "VendorPayment",
      payment.id,
      `Membuat pembayaran vendor #${payment.id}`,
    );
    revalidatePath("/pembelian/pembayaran");
    return { success: true, id: payment.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createVendorPayment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function confirmVendorBill(billId: number) {
  try {
    const user = await requirePermission("approve_vendor_bills");

    const bill = await prisma.vendorBill.findUniqueOrThrow({
      where: { id: billId },
    });

    if (bill.status !== "draft") {
      throw new Error("Tagihan hanya bisa diposting dari status draft");
    }

    // Lock the PO row, re-check the bill is still draft, run the 3-way match, and
    // flip to posted atomically. Without the lock + in-tx re-check, two concurrent
    // confirms (or a confirm racing a createVendorBill) on the same PO could both
    // pass the match and over-bill. Mirrors confirmVendorPayment. GL posting runs
    // after commit (onVendorBillPosted opens its own tx and is idempotent).
    let completedOrderNotice: string | undefined;
    let taxInvoiceWarning: string | undefined;
    await prisma.$transaction(async (tx) => {
      if (bill.purchaseOrderId) {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${bill.purchaseOrderId} FOR UPDATE`;
      }

      const fresh = await tx.vendorBill.findUniqueOrThrow({
        where: { id: billId },
      });
      if (fresh.status !== "draft") {
        throw new Error("Tagihan hanya bisa diposting dari status draft");
      }

      // F-2026-10-24-133-V Putusan 1(a)/4: tagihan L3 wajib (masih) tanpa
      // tautan PO/GR, WO closed, tidak duplikat, dan akun beban dari
      // setting existing — fail-closed SEBELUM jurnal lahir (E133-7:
      // nol jurnal, nol sukses senyap).
      const l3Post = parseL3Tag(fresh.notes);
      if (l3Post) {
        if (fresh.purchaseOrderId || fresh.goodsReceiptId) {
          throw new Error(L3_MSG.vendorBillLinked());
        }
        const l3Resolved = await resolveL3WorkOrder(tx, fresh.notes, "Tagihan vendor");
        const settings = await getSystemSettings();
        if (!settings.purchaseExpenseAccountId) {
          throw new Error(
            "Akun beban pembelian (purchaseExpenseAccountId) belum dikonfigurasi untuk tagihan jasa/biaya",
          );
        }
        await assertNoDuplicateL3(tx, {
          workOrderId: l3Resolved!.workOrder.id,
          workOrderNo: l3Resolved!.workOrder.documentNo,
          vendorKey: `vendor:${fresh.vendorId}`,
          amount: Number(fresh.grandTotal),
          date: fresh.date,
          excludeSource: { sourceType: "VendorBill", sourceId: billId },
        });
      }

      // 3-way match (PO ↔ GR ↔ Bill) before posting
      await assertThreeWayMatch(
        tx,
        fresh.purchaseOrderId,
        Number(fresh.subtotal),
        fresh.id,
      );

      // F-2026-10-28-157-V Putusan 1+3 di confirm (titik ketiga): guard
      // per-baris + referensi termin atas baris/invoc tersimpan, BUKAN input
      // form — edit draft yang menaikkan harga sesudah create tetap tertahan
      // di sini walau create lolos.
      if (fresh.purchaseOrderId) {
        assertTermsReference(fresh.terms);
        const savedLines = await tx.vendorBillItem.findMany({
          where: { vendorBillId: billId },
          select: {
            itemId: true,
            qty: true,
            unitPrice: true,
            discountPercent: true,
            taxPercent: true,
          },
        });
        await assertBillLinePricesWithinReference(
          tx,
          fresh.purchaseOrderId,
          JSON.stringify(
            savedLines.map((l) => ({
              itemId: l.itemId,
              qty: Number(l.qty),
              unitPrice: Number(l.unitPrice),
              discountPercent: Number(l.discountPercent ?? 0),
              taxPercent: Number(l.taxPercent ?? 0),
            })),
          ),
        );
      }

      await tx.vendorBill.update({
        where: { id: billId },
        data: {
          status: "posted",
          approvedBy: Number(user.id),
          approvedAt: new Date(),
          // PPh yang dipotong belum dibayar ke vendor — ia menjadi utang pajak,
          // jadi sisa tagihan berkurang sebesar pemotongan tersebut.
          balanceDue: Number(fresh.grandTotal) - Number(fresh.withholdingAmount ?? 0),
        },
      });

      // Trigger GL hook inside transaction
      await onVendorBillPosted(billId, Number(user.id), tx);

      // F-2026-10-28-157-V Putusan 2: tax>0 tanpa nomor valid = confirm TETAP
      // LULUS + warning pola completedOrderNotice (bukan tolak, bukan fail
      // diam-diam). Jurnal hook sudah gabung HPP tanpa kaki PPN Masukan.
      if (Number(fresh.tax ?? 0) > 0 && !isValidVendorTaxInvoiceNumber(fresh.taxInvoiceNumber ?? null)) {
        taxInvoiceWarning = VENDOR_BILL_TAX_INVOICE_WARNING;
      }

      // Reflect the posted (now recognised) value in the work order's HPP.
      const notice = await syncServicePoCostFromBills(tx, fresh.purchaseOrderId, Number(user.id));
      if (notice) completedOrderNotice = notice.text;
    });

    await logActivity(
      "confirm",
      "VendorBill",
      billId,
      `Posting tagihan vendor #${billId}`,
    );
    revalidatePath("/pembelian/tagihan");
    const warnings = [taxInvoiceWarning, completedOrderNotice].filter(
      (w): w is string => !!w,
    );
    return warnings.length > 0 ? { success: true, warning: warnings.join(" ") } : { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[confirmVendorBill]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * FIN-BR-008 (vonis t_9a1c4453): reversal pembayaran vendor completed.
 * Dokumen asal TIDAK dihapus: jurnal asal di-reverse lewat
 * reverseJournalsByReferenceTx (bukan deleteJournalByReferenceTx), saldo
 * tiap bill dikembalikan per alokasi lalu alokasi dihapus, payment
 * menjadi status reversed + reversedAt/reversedBy/reversalReason.
 * Alasan kosong ditolak SEBELUM mutasi apa pun. Periode jurnal asal
 * terkunci = assertPeriodOpen di helper reversal menolak dalam tx.
 */
export async function reverseVendorPayment(
  id: number,
  reason: string,
  idempotencyKey?: string,
) {
  try {
    const user = await requirePermission("delete_vendor_payments");
    const cleanReason = (reason ?? "").trim();
    if (!cleanReason) {
      return {
        success: false,
        error: "Alasan pembalikan pembayaran wajib diisi.",
      };
    }
    const key = (idempotencyKey ?? "").trim();
    const userId = Number(user.id);

    const result = await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM vendor_payments WHERE id = ${id} FOR UPDATE`;
      }
      const fresh = await tx.vendorPayment.findUniqueOrThrow({
        where: { id },
      });
      if (fresh.status === "reversed") {
        throw new Error("Pembayaran vendor ini sudah dibalik.");
      }
      if (fresh.status !== "completed") {
        throw new Error(
          "Hanya pembayaran vendor completed yang dapat dibalik; pembayaran draft dihapus saja.",
        );
      }

      if (key) {
        const claim = await claimIdempotencyKey(
          tx as never,
          "vendor_payment_reverse",
          key,
          userId,
          payloadFingerprint({ paymentId: id, reason: cleanReason }),
        );
        if (claim.replayed) return { id, replayed: true as const };
      }

      // Jurnal lawan atas jurnal asal (assertPeriodOpen tanggal asal di
      // dalam helper; periode terkunci = throw = rollback nol mutasi).
      await reverseJournalsByReferenceTx(
        tx,
        "VendorPayment",
        id,
        cleanReason,
        userId,
      );

      // Saldo kembali per alokasi: paidAmount turun, balanceDue naik,
      // status dihitung ulang neto (pola sama confirmVendorPayment).
      const allocations = await tx.vendorPaymentAllocation.findMany({
        where: { vendorPaymentId: id },
      });
      const billIds = [...new Set(allocations.map((a) => a.vendorBillId))];
      const bills =
        billIds.length > 0
          ? await tx.vendorBill.findMany({ where: { id: { in: billIds } } })
          : [];
      const billMap = new Map(bills.map((b) => [b.id, b]));
      for (const alloc of allocations) {
        const bill = billMap.get(alloc.vendorBillId);
        if (!bill) continue;
        const netPayable = safeSubtract(
          bill.grandTotal,
          bill.withholdingAmount ?? 0,
          2,
        );
        // F-2026-10-28-155-S P4: presisi sen (sama dengan confirm di bawah).
        const nextPaid = safeSubtract(bill.paidAmount, alloc.amount, 2);
        const nextBalance = safeSubtract(netPayable, nextPaid, 2);
        await tx.vendorBill.update({
          where: { id: bill.id },
          data: {
            paidAmount: nextPaid,
            balanceDue: nextBalance,
            // FIN-BR-006/007: status dari outstanding valid + toleransi Rp1.
            status: isSettled(netPayable, nextPaid)
              ? "paid"
              : nextPaid > 0
                ? "partial"
                : "posted",
          },
        });
      }
      await tx.vendorPaymentAllocation.deleteMany({
        where: { vendorPaymentId: id },
      });

      await tx.vendorPayment.update({
        where: { id },
        data: {
          status: "reversed",
          reversedAt: new Date(),
          reversedBy: userId,
          reversalReason: cleanReason,
        },
      });

      if (key) {
        await bindIdempotencyKey(tx as never, key, "VendorPayment", id);
      }
      return { id, replayed: false as const };
    });

    await logActivity(
      "reverse",
      "VendorPayment",
      id,
      `Pembalikan pembayaran vendor #${id}: ${cleanReason}`,
    );
    revalidatePath("/pembelian/pembayaran");
    revalidatePath("/pembelian/tagihan");
    return { success: true, id: result.id, replayed: result.replayed };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[reverseVendorPayment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function confirmVendorPayment(paymentId: number) {
  try {
    const user = await requirePermission("approve_vendor_payments");

    const payment = await prisma.vendorPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    if (payment.status !== "draft") {
      throw new Error("Pembayaran hanya bisa dikonfirmasi dari status draft");
    }

    // Workflow approval must be complete (no-op if no workflow configured).
    await assertApproved("VendorPayment", paymentId);

    await prisma.$transaction(async (tx) => {
      // Lock payment row to prevent double-confirm
      await tx.$executeRaw`SELECT id FROM vendor_payments WHERE id = ${paymentId} FOR UPDATE`;

      const freshPayment = await tx.vendorPayment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (freshPayment.status !== "draft") {
        throw new Error("Pembayaran hanya bisa dikonfirmasi dari status draft");
      }

      await tx.vendorPayment.update({
        where: { id: paymentId },
        data: {
          status: "completed",
          confirmedBy: Number(user.id),
          confirmedAt: new Date(),
        },
      });

      // Lock the vendor's open bills as a set, then auto-allocate the payment
      // oldest-first. Allocation rows were never created on the create-side, so
      // confirming a payment previously left vendor bills permanently unpaid
      // (AP aging overstated). We generate them deterministically here.
      await tx.$executeRaw`SELECT id FROM vendor_bills WHERE vendor_id = ${freshPayment.vendorId} AND status IN ('posted', 'partial') AND balance_due > 0 AND deleted_at IS NULL FOR UPDATE`;

      const openBills = await tx.vendorBill.findMany({
        where: {
          vendorId: freshPayment.vendorId,
          status: { in: ["posted", "partial"] },
          balanceDue: { gt: 0 },
          deletedAt: null,
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      });

      // If the payment targets a specific bill, allocate to THAT bill first
      // (partial allowed), then the rest oldest-first. Otherwise pure oldest-first.
      const targetBillId = freshPayment.vendorBillId ?? null;
      const orderedBills = targetBillId
        ? [
            ...openBills.filter((b) => b.id === targetBillId),
            ...openBills.filter((b) => b.id !== targetBillId),
          ]
        : openBills;

      if (targetBillId && !openBills.some((b) => b.id === targetBillId)) {
        throw new Error(
          "Tagihan tujuan sudah lunas atau tidak lagi terbuka. Perbarui pembayaran.",
        );
      }

      const allocations = allocatePaymentToBills(
        Number(freshPayment.amount),
        orderedBills.map((b) => ({ id: b.id, balanceDue: Number(b.balanceDue) })),
      );

      // Guard against GL/subledger drift: the GL hook (onVendorPaymentCreated)
      // debits Accounts Payable by the FULL payment.amount, but allocations are
      // capped at each bill's balance, so any amount exceeding the vendor's total
      // open balances is left unallocated. Confirming such an overpay would reduce
      // GL AP by more than the subledger (bills) — the AP control account would no
      // longer match the sum of open bills. Refuse it. Recording the excess as a
      // vendor advance/prepayment is a separate feature (needs a prepayment account).
      const allocatedTotal = allocations.reduce(
        (s, a) => s + Number(a.amount),
        0,
      );
      // FIN-BR-006: kelebihan bayar dalam toleransi lunas Rp1 adalah
      // pembulatan rupiah-penuh, bukan uang muka vendor — jangan tolak.
      // Di atas toleransi tetap tolak (guard drift GL/subledger di atas).
      if (
        allocatedTotal + SETTLEMENT_TOLERANCE_IDR <
        Number(freshPayment.amount)
      ) {
        throw new Error(
          `Nominal pembayaran (${Number(freshPayment.amount)}) melebihi total tagihan terutang vendor (${allocatedTotal}). ` +
            `Kurangi nominal pembayaran agar sesuai sisa tagihan.`,
        );
      }

      // Reuse already-fetched + locked bills (openBills) instead of re-querying
      // per allocation (eliminates N+1). Every alloc.vendorBillId originates from
      // openBills via allocatePaymentToBills, so the map lookup always hits.
      const openBillMap = new Map(openBills.map((b) => [b.id, b]));

      // 1. Validate allocations upfront
      for (const alloc of allocations) {
        const bill = openBillMap.get(alloc.vendorBillId);
        if (!bill) {
          throw new Error(
            `Vendor bill #${alloc.vendorBillId} tidak ditemukan dalam tagihan terkunci`,
          );
        }
        // P0-2: batas alokasi = NETO (bukan grandTotal) — konsisten dengan sisa.
        // Presisi sen (`, 2`): varian `, 0` di sini lama membulatkan sen ke
        // rupiah penuh dan menghancurkan sisa 0,50 sebelum status dinilai.
        const netPayable = safeSubtract(bill.grandTotal, bill.withholdingAmount ?? 0, 2);
        const nextPaid = safeAdd(bill.paidAmount, alloc.amount, 2);
        if (nextPaid > netPayable) {
          throw new Error(
            `Alokasi melebihi sisa tagihan vendor bill #${bill.id}`,
          );
        }
      }

      // 2. Collapse allocations creation into a single query
      if (allocations.length > 0) {
        await tx.vendorPaymentAllocation.createMany({
          data: allocations.map((alloc) => ({
            vendorPaymentId: paymentId,
            vendorBillId: alloc.vendorBillId,
            amount: alloc.amount,
          })),
        });
      }

      // 3. Update each bill's balance — run concurrently. The validation pass
      //    above (openBillMap + cap) guarantees each vendorBillId is distinct, so
      //    there are no write-write conflicts between these updates. Mirrors the
      //    parallel-update pattern used in onExpenseApprovedSyncPettyCash and the
      //    inventory-fifo batch-update refactors.
      // P0-2: sisa = NETO (grandTotal − withholding) − terbayar, konsisten
      // dengan jurnal (Cr AP neto) dan balanceDue saat confirm. Sebelumnya
      // memakai grandTotal sehingga tagihan ber-PPh tak pernah lunas sekali
      // bayar (sisa palsu sebesar withholding selamanya).
      await Promise.all(
        allocations.map((alloc) => {
          const bill = openBillMap.get(alloc.vendorBillId)!;
          // Presisi sen (`, 2`) — sama dengan validasi di atas; `, 0` lama
          // membulatkan paidAmount/balanceDue ke rupiah penuh di DB.
          const netPayable = safeSubtract(bill.grandTotal, bill.withholdingAmount ?? 0, 2);
          const nextPaid = safeAdd(bill.paidAmount, alloc.amount, 2);
          const nextBalance = safeSubtract(netPayable, nextPaid, 2);

          return tx.vendorBill.update({
            where: { id: bill.id },
            data: {
              paidAmount: nextPaid,
              balanceDue: nextBalance,
              // FIN-BR-006/007: status dari alokasi pembayaran completed
              // saja (draft tidak pernah sampai sini) + toleransi Rp1.
              status: isSettled(netPayable, nextPaid)
                ? "paid"
                : nextPaid > 0
                  ? "partial"
                  : "posted",
            },
          });
        }),
      );
      // Trigger GL hook inside transaction
      await onVendorPaymentCreated(paymentId, Number(user.id), tx);
    });

    await logActivity(
      "confirm",
      "VendorPayment",
      paymentId,
      `Konfirmasi pembayaran vendor #${paymentId}`,
    );
    revalidatePath("/pembelian/pembayaran");
    revalidatePath("/pembelian/tagihan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[confirmVendorPayment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== PURCHASE RETURN ACTIONS ====================

export async function createPurchaseReturn(formData: FormData) {
  try {
    const user = await requirePermission("create_purchase_returns");

    const parsed = parseFormData(purchaseReturnSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const documentNo = await generateDocumentNumber("PRET");
    const slug = await nextSlug("purchaseReturn", documentNo);

    const validPrItems = parsePurchaseReturnItems(v.items);
    const prItemIds = validPrItems.map((it) => it.itemId);
    const prCostRows = prItemIds.length
      ? await prisma.item.findMany({
          where: { id: { in: prItemIds } },
          select: { id: true, cost: true },
        })
      : [];
    const prCostMap = new Map(
      prCostRows.map((r) => [r.id, Number(r.cost ?? 0)]),
    );
    let prDocumentCostMap = prCostMap;

    // Over-return guard + return create MUST be in a single transaction with
    // a row lock on the purchase_order, otherwise two concurrent createPurchaseReturn
    // calls on the same PO can each pass the cap (TOCTOU) and over-reduce
    // inventory + over-credit the vendor. Mirrors the createVendorBill
    // 3-way-match pattern: lock + in-tx re-check + write atomically.
    const purchaseReturn = await prisma.$transaction(async (tx) => {
      if (v.purchaseOrderId) {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`;
      }

      if (prItemIds.length && v.purchaseOrderId) {
        prDocumentCostMap = await assertPurchaseReturnWithinReceived(
          tx,
          v.purchaseOrderId,
          validPrItems,
          prCostMap,
        );
      }

      const billPriceByItem = await loadBillUnitPriceByItem(tx, v.purchaseOrderId, prItemIds);
      return await tx.purchaseReturn.create({
        data: {
          documentNo,
          slug,
          purchaseOrderId: v.purchaseOrderId,
          date: wibDateToUtcMidnight(v.date),
          reason: v.reason ?? null,
          taxReturnNoteNumber: v.taxReturnNoteNumber ?? null,
          taxReturnNoteDate: v.taxReturnNoteDate ? wibDateToUtcMidnight(v.taxReturnNoteDate) : null,
          status: "draft",
          createdBy: Number(user.id),
          items: {
            create: purchaseReturnItemData(validPrItems, prDocumentCostMap, billPriceByItem),
          },
        },
      });
    });

    await logActivity(
      "create",
      "PurchaseReturn",
      purchaseReturn.id,
      `Membuat retur pembelian #${purchaseReturn.id}`,
    );
    revalidatePath("/pembelian/retur");
    return { success: true, id: purchaseReturn.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[createPurchaseReturn]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function processPurchaseReturn(returnId: number) {
  try {
    const user = await requirePermission("approve_purchase_returns");

    const purchaseReturn = await prisma.purchaseReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: true },
    });

    if (purchaseReturn.status !== "draft") {
      throw new Error("Purchase return hanya bisa diproses dari status draft");
    }

    // Scope gudang: hook mengeluarkan stok FIFO dari gudang hasil resolusi bersama
    // (receipt ?? default ?? active ?? any). Cek tiap item atas HASIL resolusi itu,
    // bukan hanya baris penerimaan — item tanpa GR verified/completed tetap jatuh
    // ke fallback hook, jadi fallback di luar scope harus ditolak di sini.
    const activeReturnItems = purchaseReturn.items.filter((item) => Number(item.qty) > 0);
    const { receiptByItem, defaultWarehouseByItem, activeWarehouseId, anyWarehouseId } =
      await loadPurchaseReturnWarehouseContext(prisma, purchaseReturn.purchaseOrderId, activeReturnItems.map((item) => item.itemId));
    const scope = await getWarehouseScope(user);
    for (const item of activeReturnItems) {
      const warehouseId = resolvePurchaseReturnWarehouse(item.itemId, receiptByItem, defaultWarehouseByItem, activeWarehouseId, anyWarehouseId);
      if (!warehouseId) throw new Error("Gudang retur pembelian tidak ditemukan.");
      assertWarehouseAccess(scope, warehouseId);
    }

    // Atomically process stock adjustment and post GL journal in a single transaction.
    await prisma.$transaction(async (tx) => {
      // Hook creates stock moves, layers, journal, and sets status → returned (idempotent).
      await onPurchaseReturnStock(returnId, Number(user.id), tx);

      // Accounting journal
      await onPurchaseReturnProcessed(returnId, Number(user.id), tx);
    });

    await logActivity(
      "process",
      "PurchaseReturn",
      returnId,
      `Memproses retur pembelian #${returnId}`,
    );
    revalidatePath("/pembelian/retur");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[processPurchaseReturn]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

// ==================== DELETE ACTIONS ====================

export async function deletePurchaseRequest(id: number) {
  try {
    await requirePermission("delete_purchase_requests");

    const pr = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id },
    });
    if (pr.status === "approved") {
      throw new Error("Tidak bisa menghapus PR yang sudah approved");
    }

    await prisma.purchaseRequest.delete({ where: { id } });
    await prisma.approval.deleteMany({
      where: { referenceType: "PurchaseRequest", referenceId: id },
    });

    await logActivity(
      "delete",
      "PurchaseRequest",
      id,
      `Menghapus permintaan pembelian #${id}`,
    );
    revalidatePath("/pembelian/permintaan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deletePurchaseRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deletePurchaseOrder(id: number) {
  try {
    await requirePermission("delete_purchase_orders");

    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: { goodsReceipts: true },
    });

    // PUR-BR-010: dokumen pembelian posted tidak boleh dihapus fisik —
    // hanya PO draft yang boleh. PO non-draft (approved/ordered/received/
    // partial_received/cancelled) adalah bukti transaksi berjalan atau
    // selesai; menghapusnya menghanguskan jejak audit. Jalur koreksi PO
    // posted: cancelPurchaseOrder (status cancelled, baris tetap ada).
    // Pola sama deleteVendorBill/deleteVendorPayment/deletePurchaseReturn.
    if (po.status !== "draft") {
      throw new Error(
        "Hanya PO draft yang dapat dihapus. PO yang sudah diproses dibatalkan lewat tombol batal, bukan dihapus.",
      );
    }

    // PUR-BR-010: PO dengan GR non-draft tidak boleh dihapus — transaksi
    // di bawah menghapus fisik StockMove `posted` + InventoryLayer milik
    // GR (diposting goods-receipt.hook saat GR terverifikasi). GR draft
    // belum memposting movement, jadi tidak menghalangi penghapusan.
    // Jalur koreksi GR terverifikasi: retur pembelian. (Guard ini juga
    // menutup jalur INV-BR-013 dari sisi PO.)
    if (po.goodsReceipts.some((gr) => gr.status !== "draft")) {
      throw new Error(
        "PO tidak dapat dihapus karena memiliki penerimaan barang yang sudah terverifikasi. Penerimaan terverifikasi tidak dapat dihapus; selesaikan lewat retur pembelian.",
      );
    }

    // Guard: refuse deletion when a non-cancelled Vendor Bill still references this
    // PO. createVendorBill posts the AP journal (Dr Clearing/Expense / Cr AP) on a
    // bill — deleting the PO here only reverses the GR's inventory/clearing leg and
    // leaves the bill's AP + clearing entries orphaned (clearing stuck Dr with no
    // pair, AP dangling, bill pointing at a deleted PO → GL no longer balances).
    // The bill must be voided first. Mirrors the in-use guards on deleteProject.
    const activeBills = await prisma.vendorBill.count({
      where: { purchaseOrderId: id, status: { notIn: ["cancelled"] } },
    });
    if (activeBills > 0) {
      throw new Error(
        "PO tidak dapat dihapus karena masih memiliki tagihan vendor aktif. Batalkan/void tagihan terlebih dahulu.",
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete all related GoodsReceipts and reverse their stock moves
      const allGrIds = po.goodsReceipts.map((gr) => gr.id);
      const allStockMoves = await tx.stockMove.findMany({
        where: {
          referenceType: "GoodsReceipt",
          referenceId: { in: allGrIds.length ? allGrIds : [-1] },
        },
        select: { id: true, itemId: true, qty: true, referenceId: true },
      });
      const stockMovesByGrId = new Map<number, typeof allStockMoves>();
      for (const move of allStockMoves) {
        if (!move.referenceId) continue;
        const arr = stockMovesByGrId.get(move.referenceId) || [];
        arr.push(move);
        stockMovesByGrId.set(move.referenceId, arr);
      }

      // Stock-integrity guard (see deleteGoodsReceipt): refuse if any received
      // layer has already been consumed downstream — deleting would subtract the
      // full move.qty from Item.qtyOnHand while removing only the residual layer.
      if (allStockMoves.length > 0) {
        const consumedLayers = await tx.inventoryLayer.count({
          where: {
            stockMoveId: { in: allStockMoves.map((m) => m.id) },
            // A layer with any outflow has been (partly) consumed downstream.
            qtyOut: { gt: 0 },
          },
        });
        if (consumedLayers > 0) {
          throw new Error(
            "PO tidak dapat dihapus karena sebagian stok dari penerimaan barangnya sudah terpakai/terjual. Batalkan transaksi pemakaian terkait terlebih dahulu.",
          );
        }
      }

      for (const gr of po.goodsReceipts) {
        const stockMoves = stockMovesByGrId.get(gr.id) || [];

        if (stockMoves.length > 0) {
          const qtyUpdates: Promise<unknown>[] = [];
          for (const move of stockMoves) {
            qtyUpdates.push(
              tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(move.qty)} WHERE id = ${move.itemId}`,
            );
          }
          await Promise.all(qtyUpdates);

          const grLayers = await tx.inventoryLayer.findMany({
            where: { stockMoveId: { in: stockMoves.map((m) => m.id) } },
            select: { itemId: true, warehouseId: true, batchNumber: true, qtyIn: true },
          });
          await decrementItemBatchesForLayers(tx, grLayers);

          await tx.inventoryLayer.deleteMany({
            where: { stockMoveId: { in: stockMoves.map((m) => m.id) } },
          });

          await tx.stockMove.deleteMany({
            where: { id: { in: stockMoves.map((m) => m.id) } },
          });
        }

        // Delete GR items
        await tx.goodsReceiptItem.deleteMany({
          where: { goodsReceiptId: gr.id },
        });
        // Reverse the GR posting journals (Dr Inventory / Cr clearing and, for a
        // mixed goods+service receipt, Dr Beban Jasa / Cr clearing) to avoid
        // orphaned GL. Both reference types are reversed: the service journal
        // uses its own marker (see stock-journal.service).
        await deleteJournalByReferenceTx(
          tx,
          [GOODS_RECEIPT_JOURNAL_REF_TYPE, GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE],
          gr.id,
        );
        // Delete the GR
        await tx.goodsReceipt.delete({ where: { id: gr.id } });
      }

      // 2. Revert PurchaseRequest status back to 'approved' if linked
      if (po.purchaseRequestId) {
        await tx.purchaseRequest.update({
          where: { id: po.purchaseRequestId },
          data: { status: "approved" },
        });
      }

      // 3. Delete PO items
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      // 4. Delete the PO
      await tx.purchaseOrder.delete({ where: { id } });
    });

    await logActivity(
      "delete",
      "PurchaseOrder",
      id,
      `Menghapus pesanan pembelian #${id}`,
    );
    revalidatePath("/pembelian/pesanan");
    revalidatePath("/pembelian/penerimaan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deletePurchaseOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Kurangi lot `ItemBatch` sebesar qty yang layer-layer sebuah GR sumbangkan
 * (qtyIn per lot, diagregasi per item+gudang+batch), hapus lot yang habis.
 * Penghapusan GR/PO membersihkan layer + StockMove + serial + jurnal; tanpa
 * langkah ini lot fisiknya yatim — stok tertelusur-batch menggantung di atas
 * persediaan yang sudah tidak ada.
 */
async function decrementItemBatchesForLayers(
  tx: TxClient,
  layers: Array<{ itemId: number; warehouseId: number | null; batchNumber: string | null; qtyIn: unknown }>,
): Promise<void> {
  const byLot = new Map<string, { itemId: number; warehouseId: number; batchNumber: string; qty: number }>();
  for (const layer of layers) {
    if (!layer.batchNumber || layer.warehouseId == null) continue;
    const key = `${layer.itemId}|${layer.warehouseId}|${layer.batchNumber}`;
    const existing = byLot.get(key);
    if (existing) {
      existing.qty = Math.round((existing.qty + Number(layer.qtyIn)) * 100) / 100;
    } else {
      byLot.set(key, {
        itemId: layer.itemId,
        warehouseId: layer.warehouseId,
        batchNumber: layer.batchNumber,
        qty: Number(layer.qtyIn),
      });
    }
  }
  for (const lot of byLot.values()) {
    const batch = await tx.itemBatch.findFirst({
      where: { itemId: lot.itemId, warehouseId: lot.warehouseId, batchNumber: lot.batchNumber },
      select: { id: true, qty: true },
    });
    if (!batch) continue;
    const remainingQty = Math.round((Number(batch.qty) - lot.qty) * 100) / 100;
    if (remainingQty <= 0) {
      await tx.itemBatch.delete({ where: { id: batch.id } });
    } else {
      await tx.itemBatch.update({ where: { id: batch.id }, data: { qty: remainingQty } });
    }
  }
}

export async function deleteGoodsReceipt(id: number) {
  try {
    const user = await requirePermission("delete_goods_receipts");

    const gr = await prisma.goodsReceipt.findUniqueOrThrow({
      where: { id },
      include: {
        purchaseOrder: true,
        items: true,
      },
    });

    // Scope gudang (header + baris): hapus membalik stok/jurnal di gudang GR.
    // Create/update sudah assert; tanpa ini user gudang A hapus GR gudang B via id.
    assertWarehouseAccessMulti(await getWarehouseScope(user), [
      gr.warehouseId,
      ...gr.items.map((i) => i.warehouseId).filter((w): w is number => w != null),
    ]);

    // PUR-BR-010: ledger posted tidak boleh dihapus fisik. GR terverifikasi
    // sudah memposting StockMove `posted` (goods-receipt.hook) — menghapusnya
    // menghanguskan jejak ledger (juga larangan INV-BR-013). Hanya GR draft
    // (belum ada movement) yang boleh dihapus; jalur koreksi GR terverifikasi
    // adalah retur pembelian. Pola sama deleteStockAdjustment/
    // deleteInventoryTransfer/deleteMaterialIssue.
    if (gr.status !== "draft") {
      throw new Error("Hanya penerimaan barang draft yang dapat dihapus");
    }

    // Guard: refuse deletion when a non-cancelled Vendor Bill references this GR's
    // PO. A goods-based Vendor Bill posts Dr Clearing / Cr AP against the receipt;
    // deleting the GR here reverses only the GR's own Dr Inventory / Cr Clearing
    // leg, leaving the bill's clearing entry stranded (clearing stuck with no pair)
    // and breaking the 3-way match invariant. Void the bill first. Mirrors the
    // guard on deletePurchaseOrder.
    if (gr.purchaseOrderId) {
      const activeBills = await prisma.vendorBill.count({
        where: {
          purchaseOrderId: gr.purchaseOrderId,
          status: { notIn: ["cancelled"] },
        },
      });
      if (activeBills > 0) {
        throw new Error(
          "Penerimaan barang tidak dapat dihapus karena PO terkait masih memiliki tagihan vendor aktif. Batalkan/void tagihan terlebih dahulu.",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Reverse all stock moves + inventory layers + qty_on_hand created by this GR
      const stockMoves = await tx.stockMove.findMany({
        where: { referenceType: "GoodsReceipt", referenceId: id },
        select: { id: true, itemId: true, qty: true },
      });

      if (stockMoves.length > 0) {
        // Stock-integrity guard: if any FIFO layer created by this GR has already
        // been (partly) consumed by a downstream sale/issue, the received units
        // left the warehouse at the original qty but the layer only retains its
        // residual. Deleting the GR would subtract the FULL move.qty from the
        // master counter while removing only the residual layer, double-reducing
        // Item.qtyOnHand and permanently diverging it from Σ layer.remaining.
        // Refuse the deletion in that case (the user must reverse the downstream
        // consumption first) — mirrors the guard on the vendor-bill check above.
        const consumedLayers = await tx.inventoryLayer.count({
          where: {
            stockMoveId: { in: stockMoves.map((m) => m.id) },
            // A layer with any outflow has been (partly) consumed downstream.
            qtyOut: { gt: 0 },
          },
        });
        if (consumedLayers > 0) {
          throw new Error(
            "Penerimaan barang tidak dapat dihapus karena sebagian stoknya sudah terpakai/terjual. Batalkan transaksi pemakaian terkait terlebih dahulu.",
          );
        }

        const qtyUpdates: Promise<unknown>[] = [];
        for (const move of stockMoves) {
          qtyUpdates.push(
            tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${Number(move.qty)} WHERE id = ${move.itemId}`,
          );
        }
        await Promise.all(qtyUpdates);

        const grLayers = await tx.inventoryLayer.findMany({
          where: { stockMoveId: { in: stockMoves.map((m) => m.id) } },
          select: { itemId: true, warehouseId: true, batchNumber: true, qtyIn: true },
        });
        await decrementItemBatchesForLayers(tx, grLayers);

        await tx.inventoryLayer.deleteMany({
          where: { stockMoveId: { in: stockMoves.map((m) => m.id) } },
        });

        await tx.stockMove.deleteMany({
          where: { id: { in: stockMoves.map((m) => m.id) } },
        });
      }

      // 1b. Clean up ItemSerial rows that onGoodsReceiptVerified registered from this
      // GR's serialNumbers. Without this, deleting a verified GR leaves orphan
      // ItemSerial rows still flagged "available" — the next attempt to receive the
      // same serials into a new GR crashes on the unique(serialNumber) constraint,
      // and the inventory subledger silently disagrees with the GL/stock totals.
      // ItemSerial has no FK back to GoodsReceipt, so we recover the serials from
      // GoodsReceiptItem.serialNumbers (the source of truth captured at verification)
      // and delete only the "available" ones — sold/used rows stay as the audit
      // trail for the downstream sales invoice and are never recreated.
      const grItemsWithSerials = await tx.goodsReceiptItem.findMany({
        where: { goodsReceiptId: id, serialNumbers: { not: undefined } },
        select: { serialNumbers: true },
      });
      const registeredSerials = grItemsWithSerials.flatMap((it) => {
        const arr = (it.serialNumbers as unknown as unknown[]) ?? [];
        return arr
          .map((s) => String(s ?? "").trim())
          .filter((s) => s.length > 0);
      });
      if (registeredSerials.length > 0) {
        await tx.itemSerial.deleteMany({
          where: {
            serialNumber: { in: registeredSerials },
            status: "available",
          },
        });
      }

      // 2. Delete GR items
      await tx.goodsReceiptItem.deleteMany({
        where: { goodsReceiptId: id },
      });

      // 3. Reverse the GR posting journal(s) (Dr Inventory / Cr clearing, plus the
      // separate service journal of a mixed goods+service receipt) to avoid
      // orphaned GL.
      await deleteJournalByReferenceTx(
        tx,
        [GOODS_RECEIPT_JOURNAL_REF_TYPE, GOODS_RECEIPT_SERVICE_JOURNAL_REF_TYPE],
        id,
      );

      // 4. Delete the GR
      await tx.goodsReceipt.delete({ where: { id } });

      // 5. Parity GoodsReceiptObserver(deleting): recompute the PO line accumulator,
      // then revert the PO status when this was the last GR. `receivedQty` is read
      // by the PO page ("Diterima") and the PO Outstanding report, so deleting a
      // verified receipt must lower it — otherwise stock that no longer exists
      // keeps counting as received. Recomputed (not decremented) from the receipts
      // that remain, so a delete/re-verify cycle also heals any drift. Total per
      // item didistribusikan PER BARIS (urutan id, sampai qty baris) seperti di
      // goods-receipt.hook — PO berbaris item duplikat tak boleh menerima total
      // yang sama di semua barisnya. UoM rule: no UoM or UoM == item base unit
      // → factor 1, missing or non-positive conversion factor → 1 with an
      // explicit console.warn (never silent; throwing would break the sales
      // quick-add UoM flow, see uom.service).
      if (gr.purchaseOrderId) {
        const poLines = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: gr.purchaseOrderId },
          orderBy: { id: "asc" },
          select: { id: true, itemId: true, qty: true },
        });
        if (poLines.length > 0) {
          const remainingItems = await tx.goodsReceiptItem.findMany({
            where: {
              goodsReceipt: {
                purchaseOrderId: gr.purchaseOrderId,
                status: { in: [PurchaseStatus.VERIFIED, Status.COMPLETED] },
              },
            },
            select: { itemId: true, qty: true, uom: true },
          });
          const recomputeItemIds = [
            ...new Set([...poLines.map((l) => l.itemId), ...remainingItems.map((i) => i.itemId)]),
          ];
          const recomputeItemRows = recomputeItemIds.length
            ? await tx.item.findMany({
                where: { id: { in: recomputeItemIds } },
                select: { id: true, unitOfMeasure: true },
              })
            : [];
          const baseUnitByItem = new Map(recomputeItemRows.map((r) => [r.id, r.unitOfMeasure]));
          const enteredUoms = [
            ...new Set(remainingItems.map((i) => i.uom).filter((u): u is string => !!u)),
          ];
          const conversions =
            recomputeItemIds.length && enteredUoms.length
              ? await tx.uomConversion.findMany({
                  where: { itemId: { in: recomputeItemIds }, code: { in: enteredUoms } },
                  select: { itemId: true, code: true, factorToBase: true },
                })
              : [];
          const factorMap = new Map(
            conversions.map((c) => [`${c.itemId}:${c.code}`, Number(c.factorToBase)]),
          );
          const receivedByItem = new Map<number, number>();
          for (const row of remainingItems) {
            let factor = 1;
            if (row.uom && row.uom !== baseUnitByItem.get(row.itemId)) {
              const raw = factorMap.get(`${row.itemId}:${row.uom}`);
              if (raw == null || !(raw > 0)) {
                console.warn(
                  `[purchase.actions] konversi ${row.uom} untuk item #${row.itemId} ${raw == null ? "tidak ditemukan" : `tidak valid (${raw})`} — qty dihitung 1:1 dalam satuan dasar. Daftarkan konversi UoM item tersebut.`,
                );
              } else {
                factor = raw;
              }
            }
            receivedByItem.set(row.itemId, (receivedByItem.get(row.itemId) ?? 0) + Number(row.qty) * factor);
          }
          const remainingByItem = new Map(receivedByItem);
          for (const line of poLines) {
            const remaining = remainingByItem.get(line.itemId) ?? 0;
            const allocated = Math.min(remaining, Number(line.qty));
            remainingByItem.set(line.itemId, Math.round((remaining - allocated) * 100) / 100);
            await tx.$executeRaw`UPDATE purchase_order_items SET received_qty = ${allocated} WHERE id = ${line.id}`;
          }
        }

        const remainingCount = await tx.goodsReceipt.count({
          where: { purchaseOrderId: gr.purchaseOrderId },
        });

        if (remainingCount === 0) {
          await tx.purchaseOrder.update({
            where: { id: gr.purchaseOrderId },
            data: { status: "ordered" },
          });
        }
      }
    });

    await logActivity(
      "delete",
      "GoodsReceipt",
      id,
      `Menghapus penerimaan barang #${id}`,
    );
    revalidatePath("/pembelian/penerimaan");
    revalidatePath("/pembelian/pesanan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteGoodsReceipt]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteVendorBill(id: number) {
  try {
    await requirePermission("delete_vendor_bills");

    // Baca di luar transaksi hanya untuk PO-linked HPP resync di bawah;
    // status yang dipercaya adalah baca ulang SESUDAH baris dikunci di
    // dalam transaksi. Tanpa itu confirmVendorBill konkuren bisa posting
    // (status posted + jurnal posted baru) tepat sesudah cek draft ini,
    // lalu delete tetap jalan: jurnal posted terhapus hard-delete tanpa
    // reversal dan baris bill hilang (GL/AP yatim).
    const billRef = await prisma.vendorBill.findUniqueOrThrow({
      where: { id },
      select: { purchaseOrderId: true },
    });

    // ATOMICITY: deleting the bill row while leaving its draft journal behind
    // would orphan Dr Expense / Cr AP in the GL (no source document to reverse
    // later) — a silent balance-sheet drift. Wrapping the journal-delete + bill
    // delete in one tx guarantees the GL is clean iff the bill row is gone.
    // Lampiran ikut: klaim create/update memakai referenceType "vendor_bill",
    // jadi hapus tanpa menyapunya meninggalkan baris + berkas yatim permanen
    // (cron sweep-orphan hanya menyapu referenceId=0).
    let removedFiles: { fileUrl: string; referenceType: string }[] = [];
    await prisma.$transaction(async (tx) => {
      // Kunci baris bill: serial dengan confirmVendorBill (yang juga
      // mengunci PO; kunci PO diambil lebih dulu di jalur confirm, dan di
      // sini kunci bill dulu — tidak ada jalur yang mengunci bill lalu PO
      // sesudahnya, jadi urutan tidak membentuk deadlock baru).
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM vendor_bills WHERE id = ${id} FOR UPDATE`;
      }
      const fresh = await tx.vendorBill.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== "draft") {
        throw new Error("Hanya tagihan draft yang dapat dihapus");
      }
      // Reverse any journal posted at draft creation before removing the record.
      await deleteJournalByReferenceTx(tx, "VendorBill", id);
      removedFiles = await deleteTransactionAttachmentsTx(tx, {
        referenceType: "vendor_bill", referenceId: id,
      });
      await tx.vendorBill.delete({ where: { id } });
      // Recompute the service PO's subcontract HPP after removing the bill.
      await syncServicePoCostFromBills(tx, billRef.purchaseOrderId, null);
    });
    await removeAttachmentFiles(removedFiles);

    await logActivity(
      "delete",
      "VendorBill",
      id,
      `Menghapus tagihan vendor #${id}`,
    );
    revalidatePath("/pembelian/tagihan");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVendorBill]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deleteVendorPayment(id: number) {
  try {
    await requirePermission("delete_vendor_payments");

    // Status dipercaya dari baca ulang SESUDAH baris dikunci di dalam
    // transaksi (pola sama deleteVendorBill). confirmVendorPayment juga
    // mengunci baris payment, jadi delete konkuren serial: bila confirm
    // menang, status fresh = completed dan delete ditolak, bukan menghapus
    // pembayaran terposting beserta jurnalnya.
    // Lampiran "vendor_payment" ikut disapu: hapus tanpa menyapunya
    // meninggalkan baris + berkas yatim permanen (R-13).
    let removedFiles: { fileUrl: string; referenceType: string }[] = [];
    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM vendor_payments WHERE id = ${id} FOR UPDATE`;
      }
      const fresh = await tx.vendorPayment.findUniqueOrThrow({ where: { id } });
      if (fresh.status !== "draft") {
        throw new Error("Hanya pembayaran draft yang dapat dihapus");
      }
      // Reverse any journal posted at draft creation before removing the record.
      await deleteJournalByReferenceTx(tx, "VendorPayment", id);
      removedFiles = await deleteTransactionAttachmentsTx(tx, {
        referenceType: "vendor_payment", referenceId: id,
      });
      await tx.vendorPayment.delete({ where: { id } });
    });
    await removeAttachmentFiles(removedFiles);

    await logActivity(
      "delete",
      "VendorPayment",
      id,
      `Menghapus pembayaran vendor #${id}`,
    );
    revalidatePath("/pembelian/pembayaran");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deleteVendorPayment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePurchaseRequest(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_purchase_requests");

    const parsed = parseFormData(purchaseRequestSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const existingPr = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id },
    });
    if (existingPr.status !== "draft") {
      throw new Error("Hanya PR draft yang dapat diedit");
    }

    const slug = await nextSlug("purchaseRequest", existingPr.documentNo, { excludeId: id });

    const requestedBy = v.requestedBy || Number(user.id);
    // Parse sebelum transaksi: qty tak terbaca ditolak sebelum deleteMany
    // menghapus baris lama.
    const items = parsePurchaseRequestItems(v.items);

    const pr = await prisma.$transaction(async (tx) => {
      const latestStatus = await tx.purchaseRequest.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latestStatus && latestStatus.status !== "draft")
        throw new Error("Hanya PR draft yang dapat diedit");
      await tx.purchaseRequestItem.deleteMany({
        where: { purchaseRequestId: id },
      });
      const requestDateRaw = v.requestDate;
      const description = v.description ?? null;
      const date = wibDateToUtcMidnight(v.date);
      const requestDate = requestDateRaw ? wibDateToUtcMidnight(requestDateRaw) : null;
      return tx.purchaseRequest.update({
        where: { id },
        data: {
          slug,
          title: v.title ?? null,
          requestedBy,
          vendorId: v.vendorId ?? null,
          date,
          requestDate,
          description,
          notes: v.notes ?? null,
          items: {
            create: items.map((i) => ({
              itemId: i.itemId,
              qty: i.qty,
              notes: i.notes,
            })),
          },
        },
      });
    });

    await logActivity(
      "update",
      "PurchaseRequest",
      pr.id,
      `Memperbarui permintaan pembelian #${pr.id}`,
    );
    revalidatePath("/pembelian/permintaan");
    return { success: true, id: pr.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePurchaseRequest]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePurchaseOrder(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_purchase_orders");

    const parsed = parseFormData(purchaseOrderSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const existingPo = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
    });
    if (existingPo.status !== "draft") {
      throw new Error("Hanya PO draft yang dapat diedit");
    }

    const slug = await nextSlug("purchaseOrder", existingPo.documentNo, { excludeId: id });

    const poItems = parsePurchaseOrderItems(v.items);

    const shippingCost = v.shippingCost ?? 0;
    const serviceFee = v.serviceFee ?? 0;
    const { subtotal, discount: discountTotal, grandTotal } = buildPurchaseOrderTotals(poItems, shippingCost, serviceFee);

    // Keep existing documentNo (do not regenerate on edit)
    const po = await prisma.$transaction(async (tx) => {
      const latest = await tx.purchaseOrder.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latest && latest.status !== "draft")
        throw new Error("Hanya PO draft yang dapat diedit");
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          slug,
          vendorId: v.vendorId,
          purchaseRequestId: v.purchaseRequestId ?? null,
                    date: wibDateToUtcMidnight(v.date),
          expectedDate: v.expectedDate ? wibDateToUtcMidnight(v.expectedDate) : null,
          paymentTerm: v.paymentTerm ?? null,
          shippingCost,
          serviceFee,
          notes: v.notes ?? null,
          subtotal,
          discount: discountTotal,
          tax: 0,
          grandTotal,
          items: {
            create: poItems.map(purchaseOrderItemData),
          },
        },
      });
    });

    // Update PR status if linked.
    // NOTE: onPurchaseOrderCreated is intentionally called OUTSIDE the
    // transaction above — its signature only accepts (purchaseOrderId: number)
    // and internally opens its own $transaction (purchase-order.hook.ts:11-13).
    // It also does not post a journal here (it only updates the linked PR's
    // status), so there is no GL exposure to roll back. Moving it inside would
    // require giving it an optional txClient parameter (mirroring
    // deleteJournalByReference's txClient pattern) and re-checking that the
    // nested $transaction does not deadlock against the outer one. Left as
    // a follow-up.
    if (v.purchaseRequestId) {
      await onPurchaseOrderCreated(po.id);
    }

    // Notify admins — external side-effect, must stay outside the tx.
    await notificationService.notifyAdmins(
      "Pesanan Pembelian baru dibuat",
      `/pembelian/pesanan/${slug ?? po.id}`,
    );

    await logActivity(
      "update",
      "PurchaseOrder",
      po.id,
      `Memperbarui pesanan pembelian #${po.id}`,
    );
    revalidatePath("/pembelian/pesanan");
    return { success: true, id: po.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePurchaseOrder]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateVendorBill(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_vendor_bills");

    const parsed = parseFormData(vendorBillSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const existingBill = await prisma.vendorBill.findUniqueOrThrow({
      where: { id },
    });
    if (existingBill.status !== "draft") {
      throw new Error("Hanya tagihan draft yang dapat diedit");
    }

    let costWarning: string | undefined;
    const slug = await nextSlug("vendorBill", existingBill.documentNo, { excludeId: id });

    // Lock the PO + re-run the 3-way match BEFORE persisting the edit, mirroring
    // createVendorBill/confirmVendorBill. Without this, a draft bill created small
    // (passing the match) could be edited to an over-bill grandTotal and later
    // posted at confirm with a value the 3-way match should have rejected
    // — i.e. the over-bill guard was bypassable via edit. assertThreeWayMatch
    // excludes this bill's own id so it doesn't count itself.
    const billHeader = summarizeBillItems(v.items) ?? {
      subtotal: v.subtotal,
      discountAmount: 0,
      tax: v.tax,
      grandTotal: v.grandTotal,
    };

    const bill = await prisma.$transaction(async (tx) => {
      const latestBill = await tx.vendorBill.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latestBill && latestBill.status !== "draft")
        throw new Error("Hanya tagihan draft yang dapat diedit");

      // F-2026-10-24-133-V (temuan QA E133 atas PR #714): edit draft bertanda
      // L3 mengulang penjaga create/confirm yang sama — WO closed+alasan,
      // tanpa tautan PO hasil edit maupun GR existing (goodsReceiptId tidak
      // berubah lewat edit), dan lolos guard duplikat selain dirinya. Tanpa
      // ini draft non-L3 bisa diedit membawa penanda+tautan inkonsisten dan
      // jejak L3 pada WO hilang. ActivityLog ditulis sesudah update di bawah.
      const l3 = await resolveL3WorkOrder(tx, v.notes, "Tagihan vendor");
      if (l3 && (v.purchaseOrderId || existingBill.goodsReceiptId)) {
        throw new Error(L3_MSG.vendorBillLinked());
      }
      if (l3) {
        await assertNoDuplicateL3(tx, {
          workOrderId: l3.workOrder.id,
          workOrderNo: l3.workOrder.documentNo,
          vendorKey: `vendor:${v.vendorId}`,
          amount: billHeader.grandTotal,
          date: wibDateToUtcMidnight(v.date),
          excludeSource: { sourceType: "VendorBill", sourceId: id },
        });
      }

      if (v.purchaseOrderId) {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`;
        // F-2026-10-28-157-V Putusan 1+3 di edit (titik kedua): sama seperti
        // create — guard per-baris + referensi termin atas input baru.
        assertTermsReference(v.terms);
        await assertBillLinePricesWithinReference(tx, v.purchaseOrderId, v.items);
      }

      await assertThreeWayMatch(
        tx,
        v.purchaseOrderId ?? null,
        billHeader.subtotal,
        id,
      );

      // Penjaga per-GR yang sama seperti create (BUG-09): edit draft tidak
      // boleh menaikkan tagihan GR-nya melebihi nilai penerimaan, walau plafon
      // PO (3-way) masih longgar. Tagihan ini dikecualikan dari jumlah lama
      // karena barisnya diganti di bawah.
      if (existingBill.goodsReceiptId) {
        const grRef = await tx.goodsReceipt.findUnique({
          where: { id: existingBill.goodsReceiptId },
          select: { documentNo: true },
        });
        await assertGrBillingWithinReceived(
          tx,
          existingBill.goodsReceiptId,
          grRef?.documentNo ?? `#${existingBill.goodsReceiptId}`,
          safeSubtract(billHeader.subtotal, billHeader.discountAmount, 2),
          id,
        );
      }

      const date = wibDateToUtcMidnight(v.date);
      const dueDate = v.dueDate ? wibDateToUtcMidnight(v.dueDate) : null;
      const updated = await tx.vendorBill.update({
        where: { id },
        data: {
          slug,
          vendorId: v.vendorId,
          purchaseOrderId: v.purchaseOrderId ?? null,
          projectId: v.projectId ?? null,
          withholdingTypeId: v.withholdingTypeId ?? null,
          withholdingAmount: v.withholdingAmount ?? 0,
          date,
          dueDate,
          // Persist the free-text fields the form sends. The previous data
          // block dropped vendorInvoiceNumber / terms / notes, so editing a
          // draft bill to fix a vendor's invoice reference number (or to
          // update payment terms / notes) silently discarded the change with
          // a successful save — the user could not tell from the UI.
          vendorInvoiceNumber: v.vendorInvoiceNumber ?? null,
          taxInvoiceNumber: v.taxInvoiceNumber ?? null,
          terms: v.terms ?? null,
          notes: v.notes ?? null,
          // Sama seperti saat membuat: kop dihitung ulang dari baris.
          subtotal: billHeader.subtotal,
          discountAmount: billHeader.discountAmount,
          tax: billHeader.tax,
          grandTotal: billHeader.grandTotal,
          status: "draft",
        },
      });

      // Putusan 4(2): jejak L3 pada WO dalam tx edit yang sama.
      if (l3) {
        await writeL3ActivityLog(tx, {
          workOrder: l3.workOrder,
          sourceType: "VendorBill",
          sourceId: updated.id,
          sourceDocumentNo: updated.documentNo ?? existingBill.documentNo,
          vendorKey: `vendor:${v.vendorId}`,
          amount: billHeader.grandTotal,
          date,
          reason: l3.tag.reason,
          userId: Number(user.id),
        });
      }

      // Replace the item lines with the submitted set so an edit round-trips the
      // goods (delete + recreate keeps the simple "last write wins" semantics).
      // The GR linkage is re-derived from the bill's own `goodsReceiptId`
      // (unchanged by an edit) so recreating the lines does not silently detach
      // the bill from its receipt and zero the GR/IR report again.
      await tx.vendorBillItem.deleteMany({ where: { vendorBillId: id } });
      const grLineQueues = existingBill.goodsReceiptId
        ? await loadGrLineQueues(tx, existingBill.goodsReceiptId)
        : undefined;
      await persistVendorBillItems(tx, id, v.items, grLineQueues);

      // Associate uploaded attachments with the vendor bill
      const attachmentIds = v.attachmentIds;
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "vendor_bill", referenceId: updated.id, uploadedBy: Number(user.id),
        });
      }

      // P0-2 / BUG-05: draft MURNI — edit draft TIDAK menyentuh jurnal sama
      // sekali, simetris dengan createVendorBill. Jurnal AP lahir hanya pada
      // jalur posting yang sah (confirmVendorBill), yang membaca nilai hasil
      // edit ini. Dulu edit di sini menghapus + memposting ulang jurnal selagi
      // status masih "draft", sehingga satu kali edit langsung mengakui
      // Dr Clearing/Beban Cr Hutang sebelum tagihan diposting.

      // The bill's PO link or amount may have changed — resync the old and new
      // service PO subcontract costs so HPP stays exact.
      const noticeOld = await syncServicePoCostFromBills(tx, existingBill.purchaseOrderId, Number(user.id));
      const noticeNew =
        updated.purchaseOrderId != null && updated.purchaseOrderId !== existingBill.purchaseOrderId
          ? await syncServicePoCostFromBills(tx, updated.purchaseOrderId, Number(user.id))
          : null;
      const warnings = [noticeOld, noticeNew].filter((n) => n != null).map((n) => n.text);
      if (warnings.length > 0) costWarning = warnings.join(" ");

      return updated;
    });

    await logActivity(
      "update",
      "VendorBill",
      bill.id,
      `Memperbarui tagihan vendor #${bill.id}`,
    );
    revalidatePath("/pembelian/tagihan");
    return costWarning ? { success: true, id: bill.id, slug, warning: costWarning } : { success: true, id: bill.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateVendorBill]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateGoodsReceipt(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_goods_receipts");

    const parsed = parseFormData(goodsReceiptSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const existingGr = await prisma.goodsReceipt.findUniqueOrThrow({
      where: { id },
    });
    if (existingGr.status !== "draft") {
      throw new Error("Hanya GR draft yang dapat diedit");
    }

    const slug = await nextSlug("goodsReceipt", existingGr.documentNo, { excludeId: id });

    const items = parseGrItems(v.items);

    assertGrItemExpiryDates(items);

    // Scope gudang (header + tiap baris) — lihat catatan di createGoodsReceipt.
    const scope = await getWarehouseScope(user);
    assertWarehouseAccess(scope, v.warehouseId);
    for (const item of items) {
      if (item.warehouseId) assertWarehouseAccess(scope, Number(item.warehouseId));
    }

    const gr = await prisma.$transaction(async (tx) => {
      const latestStatus = await tx.goodsReceipt.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latestStatus && latestStatus.status !== "draft")
        throw new Error("Hanya GR draft yang dapat diedit");
      // Lock the (possibly new) PO and re-apply the SAME guards the create path
      // enforces: the PO must be in a receivable status, and every submitted line
      // must belong to the PO. Without these, an edit could re-point a draft GR at
      // a draft/cancelled PO or add an item that is not on the PO — the verification
      // over-receive guard only iterates the PO's own lines, so an off-PO item is
      // never capped and unordered stock is received.
      await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`;
      const poForItems = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: v.purchaseOrderId },
        select: { status: true, items: { select: { itemId: true, qty: true } } },
      });
      if (
        poForItems.status !== "approved" &&
        poForItems.status !== "ordered" &&
        poForItems.status !== "partial_received"
      ) {
        throw new Error(
          `Penerimaan barang hanya bisa dibuat dari PO berstatus 'approved', 'ordered', atau 'partial_received' (status saat ini: '${poForItems.status}').`,
        );
      }
      const orderedQtyByItem = new Map<number, number>(
        poForItems.items.map((i) => [i.itemId, Number(i.qty)]),
      );
      // Membership check: aggregate per item so a duplicate line can't pass two
      // independent checks.
      const submittedQtyByItem = new Map<number, number>();
      for (const item of items) {
        if (item.itemId <= 0 || item.qty <= 0) continue;
        submittedQtyByItem.set(
          item.itemId,
          (submittedQtyByItem.get(item.itemId) ?? 0) + Number(item.qty),
        );
      }
      for (const itemId of submittedQtyByItem.keys()) {
        if ((orderedQtyByItem.get(itemId) ?? 0) === 0) {
          throw new Error(
            `Item #${itemId} tidak ada dalam pesanan pembelian (PO).`,
          );
        }
      }
      const date = wibDateToUtcMidnight(v.date);
      const updated = await tx.goodsReceipt.update({
        where: { id },
        data: {
          slug,
          purchaseOrderId: v.purchaseOrderId,
          warehouseId: v.warehouseId,
          date,
          referenceNumber: v.referenceNumber ?? null,
          notes: v.notes ?? null,
          shippingCost: v.shippingCost ?? 0,
          otherCost: v.otherCost ?? 0,
          adminFee: v.adminFee ?? 0,
        },
      });

      // Recreate items with per-item warehouseId
      await tx.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: id } });
      if (items.length > 0) {
        await tx.goodsReceiptItem.createMany({
          data: items
            .filter((i) => i.itemId > 0 && i.qty > 0)
            .map((i) => ({
              goodsReceiptId: id,
              ...goodsReceiptItemData(i, orderedQtyByItem),
            })),
        });
      }

      return updated;
    });

    await logActivity(
      "update",
      "GoodsReceipt",
      gr.id,
      `Memperbarui penerimaan barang #${gr.id}`,
    );
    revalidatePath("/pembelian/penerimaan");
    return { success: true, id: gr.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateGoodsReceipt]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updatePurchaseReturn(id: number, formData: FormData) {
  "use server";

  try {
    await requirePermission("edit_purchase_returns");

    const parsed = parseFormData(purchaseReturnSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const ret = await prisma.purchaseReturn.findUniqueOrThrow({
      where: { id },
    });
    if (ret.status !== "draft") {
      throw new Error("Hanya retur draft yang dapat diedit");
    }

    const slug = await nextSlug("purchaseReturn", ret.documentNo, { excludeId: id });

    const validPrItems = parsePurchaseReturnItems(v.items);
    const updPrIds = validPrItems.map((it) => it.itemId);
    const updPrCostRows = updPrIds.length
      ? await prisma.item.findMany({
          where: { id: { in: updPrIds } },
          select: { id: true, cost: true },
        })
      : [];
    const updPrCostMap = new Map(
      updPrCostRows.map((r) => [r.id, Number(r.cost ?? 0)]),
    );
    // Entered-unit cost map, resolved inside the tx once the GR UoM is known
    // (mirrors the create path's prDocumentCostMap).
    let updPrDocumentCostMap = updPrCostMap;

    // Keep existing documentNo (do not regenerate), and replace items atomically.
    // The over-return guard runs INSIDE the transaction (under a PO row lock) to
    // close the TOCTOU window: a concurrent edit on the same PO can otherwise
    // each pass the cap and over-reduce inventory. Prior non-cancelled returns
    // must EXCLUDE this return's own id because its existing rows are about
    // to be deleted/replaced below (counting them would double-count).
    const purchaseReturn = await prisma.$transaction(async (tx) => {
      const latestPr = await tx.purchaseReturn.findUnique({
        where: { id },
        select: { status: true },
      });
      if (latestPr && latestPr.status !== "draft")
        throw new Error("Hanya retur draft yang dapat diedit");

      if (v.purchaseOrderId) {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${v.purchaseOrderId} FOR UPDATE`;
      }

      if (updPrIds.length && v.purchaseOrderId) {
        // Biaya entered-unit + penjaga over-return: helper bersama
        // assertPurchaseReturnWithinReceived (exclude retur ini sendiri).
        updPrDocumentCostMap = await assertPurchaseReturnWithinReceived(
          tx,
          v.purchaseOrderId,
          validPrItems,
          updPrCostMap,
          id,
        );
      }

      await tx.purchaseReturnItem.deleteMany({
        where: { purchaseReturnId: id },
      });
      const updBillPriceByItem = await loadBillUnitPriceByItem(tx, v.purchaseOrderId, updPrIds);
      const date = wibDateToUtcMidnight(v.date);
      return tx.purchaseReturn.update({
        where: { id },
        data: {
          slug,
          purchaseOrderId: v.purchaseOrderId,
          date,
          reason: v.reason ?? null,
          taxReturnNoteNumber: v.taxReturnNoteNumber ?? null,
          taxReturnNoteDate: v.taxReturnNoteDate ? wibDateToUtcMidnight(v.taxReturnNoteDate) : null,
          items: {
            create: purchaseReturnItemData(validPrItems, updPrDocumentCostMap, updBillPriceByItem),
          },
        },
      });
    });

    await logActivity(
      "update",
      "PurchaseReturn",
      purchaseReturn.id,
      `Memperbarui retur pembelian #${purchaseReturn.id}`,
    );
    revalidatePath("/pembelian/retur");
    return { success: true, id: purchaseReturn.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updatePurchaseReturn]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function updateVendorPayment(id: number, formData: FormData) {
  "use server";

  try {
    const user = await requirePermission("edit_vendor_payments");

    const parsed = parseFormData(vendorPaymentSchema, formData);
    if (!parsed.success) return { success: false, error: parsed.error };
    const v = parsed.data;

    const existingPayment = await prisma.vendorPayment.findUniqueOrThrow({
      where: { id },
    });
    if (existingPayment.status !== "draft") {
      throw new Error("Hanya pembayaran draft yang dapat diedit");
    }

    if (v.accountId != null) {
      const ok = await prisma.account.count({ where: { id: v.accountId } })
      if (!ok) throw new Error(`Akun tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.`)
    }

    const slug = await nextSlug("vendorPayment", existingPayment.documentNo, { excludeId: id });

    // ATOMICITY: payment update + attachment pointer update must commit
    // together. A failed attachment updateMany after a successful update would
    // leave the edited payment without its supporting documents linked — the
    // operator would see a stale/empty attachment list and not know that the
    // new files were never attached. Wrapping both in one tx closes that gap.
    const payment = await prisma.$transaction(async (tx) => {
      const paymentDate = wibDateToUtcMidnight(v.paymentDate);
      const updated = await tx.vendorPayment.update({
        where: { id },
        data: {
          slug,
          vendorId: v.vendorId,
          amount: v.amount,
          paymentDate,
          paymentMethod: v.paymentMethod,
          accountId: v.accountId ?? null,
          adminFee: v.adminFee ?? 0,
          vendorBillId: v.vendorBillId ?? null,
          referenceNumber: v.referenceNumber ?? null,
          bankAccount: v.bankAccount ?? null,
          notes: v.notes ?? null,
        },
      });

      // Associate uploaded attachments with the new payment
      const attachmentIds = v.attachmentIds;
      if (attachmentIds) {
        await attachPendingTransactionAttachments(tx, {
          attachmentIds, referenceType: "vendor_payment", referenceId: updated.id, uploadedBy: Number(user.id),
        });
      }

      return updated;
    });

    // Journal is NOT posted here. Per the design contract (see createVendorPayment:
    // "Journal is NOT created here — posted only on confirmVendorPayment"), a draft
    // payment must not affect the GL. This function only edits drafts (guarded
    // above), so posting via onVendorPaymentCreated would push Dr AP / Cr Bank to
    // the GL without a vendorPaymentAllocation and without the overpay guard, while
    // the bill's balanceDue stays unchanged → subledger (bills) drifts from GL AP.
    // The journal + allocations are created atomically in confirmVendorPayment.

    // Edit membuka kembali pengajuan bila approval sebelumnya ditolak
    // (resubmit); tanpa workflow terkonfigurasi panggilan ini no-op.
    if (payment.id) await requestApprovalIfConfigured("VendorPayment", payment.id, Number(user.id));

    await logActivity(
      "update",
      "VendorPayment",
      payment.id,
      `Memperbarui pembayaran vendor #${payment.id}`,
    );
    revalidatePath("/pembelian/pembayaran-vendor");
    return { success: true, id: payment.id, slug };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[updateVendorPayment]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
/**
 * F-2026-10-28-157-V Putusan 2 — isi nomor faktur pajak pasca-posting.
 *
 * Syarat jurnal ulang WAJIB (flip SPT saja DILARANG): reversal jurnal posted
 * asal (periode asal terbuka) + posting ulang jurnal BARU di periode berjalan
 * terbuka yang memecah PPN keluar dari HPP menjadi Dr PPN Masukan. Hanya bila
 * nomor valid + dalam jendela 3 masa UU PPN 9(2)/(9) + periode asal terbuka
 * untuk koreksi SPT bila sudah dilaporkan. Bill draft ditolak (pakai edit),
 * bill tanpa tax>0 ditolak (tak ada PPN dipecah), bill bernomor valid ditolak
 * (tak ada yang diperbaiki), bill tanpa jurnal posted ditolak (jurnal belum
 * lahir — confirm dulu).
 */
export async function setVendorBillTaxInvoiceNumber(
  id: number,
  formData: FormData,
) {
  "use server";
  try {
    await requirePermission("approve_vendor_bills");
    const clean = String(formData.get("taxInvoiceNumber") ?? "").trim();
    if (!isValidVendorTaxInvoiceNumber(clean)) {
      return {
        success: false,
        error:
          "Nomor faktur pajak tidak valid — hanya huruf, angka, spasi, titik, dan strip (maks 50 karakter).",
      };
    }

    const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id } });
    if (bill.status === "draft") {
      return {
        success: false,
        error: "Tagihan masih konsep — ubah nomor lewat edit, bukan aksi ini.",
      };
    }
    if (bill.status === "cancelled") {
      return { success: false, error: "Tagihan sudah dibatalkan." };
    }
    if (Number(bill.tax ?? 0) <= 0) {
      return {
        success: false,
        error: "Tagihan ini tidak memuat PPN — tidak ada yang dipecah ke PPN Masukan.",
      };
    }
    if (isValidVendorTaxInvoiceNumber(bill.taxInvoiceNumber ?? null)) {
      return {
        success: false,
        error: "Tagihan ini sudah bernomor faktur valid.",
      };
    }

    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === "function") {
        await tx.$executeRaw`SELECT id FROM vendor_bills WHERE id = ${id} FOR UPDATE`;
      }
      const fresh = await tx.vendorBill.findUniqueOrThrow({ where: { id } });
      if (fresh.status === "draft" || fresh.status === "cancelled") {
        throw new Error("Tagihan tidak dalam status terposting.");
      }
      if (Number(fresh.tax ?? 0) <= 0) {
        throw new Error("Tagihan ini tidak memuat PPN.");
      }

      // Jendela 3 masa UU PPN 9(2)/(9): kredit dibuka maks 3 masa sesudah
      // masa faktur. Masa faktur = tanggal bill (DPP lahir saat bill posting).
      const invoicePeriod = taxPeriodFromDate(fresh.date);
      const creditPeriod = taxPeriodFromDate(new Date());
      const elig = checkCreditEligibility(invoicePeriod, creditPeriod);
      if (!elig.eligible) {
        throw new Error(
          elig.reason === "expired"
            ? `Jendela kredit PPN sudah lewat (masa faktur ${invoicePeriod}, maks 3 masa sesudahnya) — nomor tidak bisa dikreditkan lagi.`
            : `Masa kredit ${creditPeriod} mendahului masa faktur ${invoicePeriod} — nomor tidak bisa dikreditkan.`,
        );
      }

      // Jurnal ulang WAJIB dalam periode terbuka: reversal posted asal
      // (assertPeriodOpen atas tanggal jurnal asal di dalam tx) lalu posting
      // ulang jurnal BARU yang memecah PPN keluar dari HPP.
      const origins = await tx.journal.findMany({
        where: { referenceType: "VendorBill", referenceId: id, status: "POSTED" },
        select: { id: true },
      });
      if (origins.length === 0) {
        throw new Error("Jurnal tagihan terposting tidak ditemukan — konfirmasi dulu.");
      }
      await reverseJournalsByReferenceTx(
        tx,
        "VendorBill",
        id,
        `Nomor faktur pajak ${clean} diisi pasca-posting — pecah PPN dari HPP`,
        undefined,
      );
      await tx.vendorBill.update({
        where: { id },
        data: { taxInvoiceNumber: clean },
      });
      await onVendorBillPosted(id, undefined, tx);
    });

    await logActivity(
      "update",
      "VendorBill",
      id,
      `Mengisi nomor faktur pajak tagihan vendor #${id} pasca-posting (jurnal ulang)`,
    );
    revalidatePath("/pembelian/tagihan");
    revalidatePath(`/pembelian/tagihan/${bill.slug ?? id}`);
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[setVendorBillTaxInvoiceNumber]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * Void (cancel) a posted vendor bill while keeping the record for audit.
 * Reverses the bill journal (re-opening the GR/IR clearing balance) and marks the
 * bill "cancelled". A bill that already has payments applied must have those
 * payments removed first.
 */
export async function voidVendorBill(id: number) {
  "use server";

  try {
    // Voiding a POSTED bill reverses its GL (re-opens GR/IR clearing) — a
    // destructive AP operation, not a create. Guard with delete_vendor_bills so a
    // create-only clerk cannot reverse posted payables. Mirrors deleteVendorBill.
    await requirePermission("delete_vendor_bills");
    const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id } });
    if (bill.status === "draft") {
      throw new Error("Tagihan draft tidak perlu dibatalkan. Gunakan hapus.");
    }
    if (bill.status === "cancelled") {
      throw new Error("Tagihan sudah dibatalkan.");
    }
    if (Number(bill.paidAmount ?? 0) > 0) {
      throw new Error(
        "Hapus pembayaran tagihan ini terlebih dahulu sebelum membatalkan.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await deleteJournalByReferenceTx(tx, "VendorBill", id);
      await tx.vendorBill.update({
        where: { id },
        data: { status: "cancelled" },
      });
      // The bill no longer counts toward the service PO's billed value — resync
      // the subcontract HPP.
      await syncServicePoCostFromBills(tx, bill.purchaseOrderId, null);
    });

    await logActivity(
      "void",
      "VendorBill",
      id,
      `Membatalkan tagihan vendor #${id}`,
    );
    revalidatePath("/pembelian/tagihan");
    revalidatePath(`/pembelian/tagihan/${bill.slug ?? id}`);
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[voidVendorBill]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function deletePurchaseReturn(id: number) {
  "use server";

  try {
    await requirePermission("delete_purchase_returns");

    const purchaseReturn = await prisma.purchaseReturn.findUniqueOrThrow({
      where: { id },
    });
    if (purchaseReturn.status !== "draft") {
      throw new Error("Hanya retur draft yang dapat dihapus");
    }

    await prisma.purchaseReturn.delete({ where: { id } });
    await logActivity(
      "delete",
      "PurchaseReturn",
      id,
      `Menghapus retur pembelian #${id}`,
    );
    revalidatePath("/pembelian/retur");
    return { success: true };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    console.error("[deletePurchaseReturn]", getErrorMessage(e) || e);
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}
