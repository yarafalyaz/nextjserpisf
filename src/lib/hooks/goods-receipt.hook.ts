
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber, generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { createInLayer } from "@/lib/services/inventory-fifo";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { PurchaseStatus, Status } from "@/lib/constants";

/**
 * Goods Receipt Hook - Observer pattern replacement.
 * Triggered when a Goods Receipt is verified.
 * - Auto-generate document number
 * - Update PO status
 * - Create Stock Move IN
 * - Create Journal Entry (Dr Inventory, Cr Purchase Inventory Clearing)
 */

export async function onGoodsReceiptVerified(
  goodsReceiptId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Serialize concurrent calls for the same goods receipt.
    await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = ${goodsReceiptId} FOR UPDATE`;
    const goodsReceipt = await tx.goodsReceipt.findUniqueOrThrow({
      where: { id: goodsReceiptId },
      include: {
        items: true,
        purchaseOrder: true,
      },
    });

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "GoodsReceipt",
        referenceId: goodsReceiptId,
      },
    });
    if (existingMoves) return; // Idempotent: silently no-op

    // Idempotency: check if already verified
    if (goodsReceipt.status === PurchaseStatus.VERIFIED) {
      return; // Already processed
    }

    // Period lock: the GL inventory journal posted below (stockJournalService)
    // bypasses accounting.hook, so enforce the closed-period guard here too —
    // otherwise stock receipts can back-date GL into a closed period that the
    // AR/AP/expense paths already block.
    await assertPeriodOpen(goodsReceipt.date, tx);

    // ─── 1. Auto-generate document number if not set ─────────────────────
    if (!goodsReceipt.documentNo) {
      const docNo = await generateDocumentNumber("GR");
      await tx.goodsReceipt.update({
        where: { id: goodsReceiptId },
        data: { documentNo: docNo },
      });
    }

    // ─── Pre-fetch item meta + UoM conversion factors ONCE, shared by the
    // over-receipt guard (step 2) and the stock-move creation (step 3).
    //
    // The PO is always in the item's BASE unit of measure (PurchaseOrderItem
    // has no UoM field), but each GR line may be received in any UoM. Without
    // conversion, the guard compared "1 BOX" (GR) against "12 PCS" (PO) and
    // flagged a 13× under-receipt as 13× over, or — worse — let a real over-
    // receipt slip through when the entered UoM happened to inflate the
    // number toward the PO total.
    //
    // Prior GR rows also need their UoMs included in the conversion map (a
    // prior GR in BOX must be summed in base-unit PCS, not raw BOX), so we
    // fetch the prior-GR list first and union its itemIds + UoMs into the
    // pre-fetch below. Only fetched when a PO is linked — otherwise the guard
    // does not run and we save the round-trip.
    let priorGRItems: Array<{ itemId: number; qty: unknown; uom: string | null }> = [];
    if (goodsReceipt.purchaseOrderId) {
      // Exclude current GR from the query to prevent double-counting (Fix #44).
      const rows = await tx.goodsReceiptItem.findMany({
        where: {
          goodsReceipt: {
            purchaseOrderId: goodsReceipt.purchaseOrderId,
            status: { in: [PurchaseStatus.VERIFIED, Status.COMPLETED] },
            id: { not: goodsReceiptId },
          },
        },
      });
      priorGRItems = rows.map((r) => ({ itemId: r.itemId, qty: r.qty, uom: r.uom ?? null }));
    }

    const grItemIds = [
      ...new Set<number>([
        ...goodsReceipt.items.map((it) => it.itemId),
        ...priorGRItems.map((it) => it.itemId),
      ]),
    ];
    const grItemMetas = grItemIds.length
      ? await tx.item.findMany({
          where: { id: { in: grItemIds } },
          select: { id: true, unitOfMeasure: true, trackBatch: true, trackSerial: true },
        })
      : [];
    const metaByItem = new Map(grItemMetas.map((it) => [it.id, it]));

    const enteredUoms = [
      ...new Set<string>([
        ...goodsReceipt.items.map((it) => it.uom).filter((u): u is string => !!u),
        ...priorGRItems.map((it) => it.uom).filter((u): u is string => !!u),
      ]),
    ];
    const conversions = grItemIds.length && enteredUoms.length
      ? await tx.uomConversion.findMany({
          where: { itemId: { in: grItemIds }, code: { in: enteredUoms } },
          select: { itemId: true, code: true, factorToBase: true },
        })
      : [];
    const factorMap = new Map(
      conversions.map((c) => [`${c.itemId}:${c.code}`, Number(c.factorToBase)])
    );

    // Convert a (itemId, qty, uom) to the item's BASE unit. Mirrors the clamp
    // in step 3 below: missing meta, empty uom, or uom already equal to the
    // base unitOfMeasure → no conversion (factor 1). Missing conversion row
    // or non-positive factor → also factor 1 (do not silently drop a partial
    // GR; the resulting over/under detection may be conservative, which is
    // the safe direction).
    const toBaseQty = (itemId: number, qty: number, uom: string | null): number => {
      const meta = metaByItem.get(itemId);
      if (!meta || !uom || uom === meta.unitOfMeasure) return qty;
      const raw = factorMap.get(`${itemId}:${uom}`) ?? 1;
      const factor = raw > 0 ? raw : 1;
      return qty * factor;
    };

    // ─── 2. Update PO status ─────────────────────────────────────────────
    if (goodsReceipt.purchaseOrderId) {
      // Lock the PO row so two GR verifications on the SAME PO serialize.
      // Each GR locks only its own row above, so without this two concurrent
      // verifies each compute cumulative received excluding the other and both
      // could slip past the over-receipt guard below.
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${goodsReceipt.purchaseOrderId} FOR UPDATE`;

      // Check if all items in PO have been received
      const poItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: goodsReceipt.purchaseOrderId },
      });

      // Sum received quantities per item, converting every GR row to the
      // item's BASE unit so the comparison below is apples-to-apples
      // against the PO (which is always in base unit). Includes current GR
      // and prior verified/completed GRs.
      const receivedMap = new Map<number, number>();
      for (const grItem of priorGRItems) {
        const baseQty = toBaseQty(grItem.itemId, Number(grItem.qty), grItem.uom);
        const current = receivedMap.get(grItem.itemId) ?? 0;
        receivedMap.set(grItem.itemId, current + baseQty);
      }
      for (const item of goodsReceipt.items) {
        const baseQty = toBaseQty(item.itemId, Number(item.qty), item.uom);
        const current = receivedMap.get(item.itemId) ?? 0;
        receivedMap.set(item.itemId, current + baseQty);
      }

      // Over-receipt guard: cumulative received qty (in base units) must not
      // exceed the ordered qty on the PO. The PO is the contract; over-
      // delivery is handled by editing the PO, not by silently inflating
      // inventory (which also raises the 3-way-match bill ceiling and lets
      // the vendor over-bill). Hard cap with no tolerance, mirroring
      // findOverReturn's qty guard (the value-based 3-way match keeps its
      // rounding tolerance; a qty count does not). PurchaseOrderItem.receivedQty
      // is a dead column (never written), so cumulative received is summed
      // from verified GR items here, converted to base units via toBaseQty.
      for (const poItem of poItems) {
        const received = receivedMap.get(poItem.itemId) ?? 0;
        if (received > Number(poItem.qty)) {
          throw new Error(
            `Penerimaan melebihi pesanan untuk item #${poItem.itemId}: ` +
            `diterima kumulatif ${received} melebihi dipesan ${Number(poItem.qty)}. ` +
            `Sesuaikan qty penerimaan atau ubah PO.`
          );
        }
      }

      // Determine if fully received
      const allReceived = poItems.every((poItem) => {
        const received = receivedMap.get(poItem.itemId) ?? 0;
        return received >= Number(poItem.qty);
      });

      await tx.purchaseOrder.update({
        where: { id: goodsReceipt.purchaseOrderId },
        data: {
          status: allReceived ? PurchaseStatus.RECEIVED : "partial_received",
        },
      });
    }

    // ─── 3. Create Stock Move IN per item ────────────────────────────────
    // metaByItem + factorMap were pre-fetched above (shared with the
    // over-receipt guard) so this step reuses them.

    const smDocNos = await generateDocumentNumberBatch("SM", goodsReceipt.items.length);
    await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(grItemIds)}) FOR UPDATE`;

    // Per-line base-converted qty + unitCost, captured during the stock-move
    // loop so the GL journal below posts the SAME value as the subledger. When
    // a line is received in a non-base UoM, stock moves use baseQty/baseUnitCost
    // (qty scaled UP by the conversion factor, unit cost scaled DOWN by the
    // same factor so qty*cost is invariant) — re-deriving those values here
    // from raw i.qty / i.unitCost would drift the GL inventory valuation from
    // the stock subledger for every multi-UoM GR.
    const journalLines: { qty: number; cost: number }[] = [];

    let docIdx = 0;
    for (const item of goodsReceipt.items) {
      const smDocNo = smDocNos[docIdx++];

      // Per-line destination warehouse (the GR form lets each line target a
      // different warehouse). Fall back to the header warehouse when a line
      // didn't specify one. Previously every stock write used the header
      // warehouse, so a line received into a non-default warehouse booked its
      // stock/FIFO layer/batch into the WRONG warehouse — per-warehouse FIFO
      // then couldn't relieve it and showed phantom stock elsewhere.
      const lineWarehouseId = item.warehouseId ?? goodsReceipt.warehouseId;

      // Multi-UoM: convert entered qty/cost to the item's BASE unit for stock.
      const itemMeta = metaByItem.get(item.itemId);
      const isBaseUom = !itemMeta || !item.uom || item.uom === itemMeta.unitOfMeasure;
      // Mirror toBaseFactor's clamp: a missing or non-positive factor → 1.
      const rawFactor = isBaseUom ? 1 : (factorMap.get(`${item.itemId}:${item.uom}`) ?? 1);
      const factor = rawFactor > 0 ? rawFactor : 1;
      const baseQty = Number(item.qty) * factor;
      const enteredUnitCost = Number(item.unitCost ?? 0);
      const baseUnitCost = factor > 0 ? enteredUnitCost / factor : enteredUnitCost;
      const batchNumber = itemMeta?.trackBatch ? (item.batchNumber ?? null) : null;

      const sm = await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: lineWarehouseId,
          qty: baseQty,
          cost: baseUnitCost,
          impact: "IN",
          status: "posted",
          referenceType: "GoodsReceipt",
          referenceId: goodsReceipt.id,
          notes: `Penerimaan dari GR ${goodsReceipt.documentNo ?? ""}`,
          createdBy: userId ?? null,
        },
      });

      // Capture the BASE-converted values for the GL journal so it matches
      // the stock subledger (qty*cost invariant under UoM conversion).
      journalLines.push({ qty: baseQty, cost: baseUnitCost });

      // Update item qtyOnHand (global total, in base units)
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${baseQty} WHERE id = ${item.itemId}`;

      // Create FIFO inventory layer scoped to the receiving warehouse (+ batch)
      await createInLayer(tx, {
        itemId: item.itemId,
        warehouseId: lineWarehouseId,
        batchNumber,
        stockMoveId: sm.id,
        qty: baseQty,
        unitCost: baseUnitCost,
      });

      // Batch tracking: register/accumulate the batch lot
      if (itemMeta?.trackBatch && batchNumber) {
        const existingBatch = await tx.itemBatch.findFirst({
          where: { itemId: item.itemId, batchNumber, warehouseId: lineWarehouseId },
        });
        if (existingBatch) {
          await tx.itemBatch.update({
            where: { id: existingBatch.id },
            data: { qty: { increment: baseQty }, ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}) },
          });
        } else {
          await tx.itemBatch.create({
            data: {
              itemId: item.itemId,
              batchNumber,
              warehouseId: lineWarehouseId,
              qty: baseQty,
              expiryDate: item.expiryDate ?? null,
            },
          });
        }
      }

      // Serial tracking: register each received unit's serial number
      if (itemMeta?.trackSerial && Array.isArray(item.serialNumbers)) {
        const serials = (item.serialNumbers as unknown[])
          .map((s) => String(s).trim())
          .filter((s) => s.length > 0);
        if (serials.length > 0 && serials.length !== Math.round(baseQty)) {
          throw new Error(
            `Jumlah nomor seri (${serials.length}) tidak sama dengan qty diterima (${Math.round(baseQty)}) untuk item #${item.itemId}.`
          );
        }
        if (serials.length > 0) {
          await tx.itemSerial.createMany({
            data: serials.map((serialNumber) => ({
              itemId: item.itemId,
              serialNumber,
              warehouseId: lineWarehouseId,
              status: "available",
            })),
          });
        }
      }
    }

    // ─── 4. Create Journal Entry ──────────────────────────────────────
    // Use the per-line base-converted values captured above, NOT the raw
    // i.qty/i.unitCost on goodsReceipt.items (which may be in an alternate
    // UoM). Without this, multi-UoM GRs would post a GL inventory value
    // that doesn't match the stock-move + FIFO layer amounts, drifting the
    // general ledger from the stock subledger.
    await stockJournalService.onGoodsReceipt(
      tx,
      journalLines,
      goodsReceipt.documentNo ?? `GR-${goodsReceiptId}`,
      goodsReceiptId,
      userId
    );

    // ─── 5. Update GR status ─────────────────────────────────────────────
    await tx.goodsReceipt.update({
      where: { id: goodsReceiptId },
      data: { status: PurchaseStatus.VERIFIED },
    });
  });
}
