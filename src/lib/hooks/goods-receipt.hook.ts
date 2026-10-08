
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber, generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { createInLayer } from "@/lib/services/inventory-fifo";
import { allocateLandedCost } from "@/lib/services/landed-cost.service";
import { getGlobalCostingMethod, resolveCostingMethod } from "@/lib/services/costing-method.service";
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
        purchaseOrder: {
          include: {
            items: true,
          },
        },
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
          select: {
            id: true,
            unitOfMeasure: true,
            trackBatch: true,
            trackSerial: true,
            isService: true,
            cost: true,
            qtyOnHand: true,
            categoryId: true,
            costingMethod: true,
            category: {
              select: {
                costingMethod: true,
              },
            },
          },
        })
      : [];
    const metaByItem = new Map(grItemMetas.map((it) => [it.id, it]));
    // Resolve the effective costing method ONCE per item (category → item →
    // company default → fifo) using the same shared resolver the sale/consume
    // path uses, so receiving and selling never disagree on HPP.
    const globalCostingMethod = await getGlobalCostingMethod(tx);
    const costingMethodByItem = new Map(
      grItemMetas.map((it) => [
        it.id,
        resolveCostingMethod({
          categoryMethod: it.category?.costingMethod,
          itemMethod: it.costingMethod,
          globalMethod: globalCostingMethod,
        }),
      ]),
    );

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

    // ─── 3a. Landed cost allocation (computed ONCE for the whole receipt) ──
    // The PO's shippingCost/serviceFee is a whole-order estimate; a GR must
    // absorb only the share that matches the goods value it receives, so the
    // shares across every receipt of the PO sum back to the estimate (see
    // landed-cost.service). The PO discount is a separate pool that is
    // SUBTRACTED from each line (the GR unit cost is entered gross — the PO
    // unit price — so the line discount must be applied once here). GR-level
    // actual freight, when entered, overrides the estimate for this receipt.
    //
    // Weight basis is the PO's NET unit price (poItem.total / poItem.qty),
    // which keeps the same allocation across receipts regardless of whether
    // this GR happened to enter a different unitCost than the PO.
    const landedPo = goodsReceipt.purchaseOrder;
    const poItemsById = new Map((landedPo?.items ?? []).map((pi) => [pi.itemId, pi]));
    const poNetUnitPriceOf = (itemId: number): number => {
      const pi = poItemsById.get(itemId);
      if (!pi) return 0;
      const qty = Number(pi.qty);
      return qty > 0 ? Number(pi.total) / qty : 0;
    };

    // Per-line base qty + allocation weight, in the same order as
    // goodsReceipt.items so the result maps back by index.
    const landedLines = goodsReceipt.items.map((item) => {
      const meta = metaByItem.get(item.itemId);
      const isBase = !meta || !item.uom || item.uom === meta.unitOfMeasure;
      const raw = isBase ? 1 : (factorMap.get(`${item.itemId}:${item.uom}`) ?? 1);
      const f = raw > 0 ? raw : 1;
      return { baseQty: Number(item.qty) * f, poNetUnitPrice: poNetUnitPriceOf(item.itemId) };
    });

    const poNetValue = (landedPo?.items ?? []).reduce((s, pi) => s + Number(pi.total), 0);
    const poCostPool =
      Number(landedPo?.shippingCost ?? 0) + Number(landedPo?.serviceFee ?? 0);

    const landed = allocateLandedCost({
      lines: landedLines,
      poCostPool,
      poNetValue,
      poDiscount: Number(landedPo?.discount ?? 0),
      shippingCost: Number(goodsReceipt.shippingCost ?? 0),
      otherCost: Number(goodsReceipt.otherCost ?? 0),
      adminFee: Number(goodsReceipt.adminFee ?? 0),
    });

    const journalLines: { qty: number; cost: number }[] = [];
    // Bank/admin fee + freight are ALSO capitalised into the line cost (HPP), but
    // captured per line here so the GR journal can post them to their own
    // accounts (Debit Beban Admin Bank / Debit Ongkir) and show the breakdown the
    // store receipt prints (goods · ongkir · admin).
    const goodsOnlyLines: { qty: number; cost: number }[] = [];
    const shippingLines: { qty: number; cost: number }[] = [];
    const adminLines: { qty: number; cost: number }[] = [];
    // Service lines (vendor labour/subcontract) do NOT move stock; their cost is
    // expensed instead (PRD FAB-08). Collected separately for the service journal.
    const serviceJournalLines: { qty: number; cost: number }[] = [];

    // Initialize running map of item quantities and costs to handle duplicate item IDs in the GR
    const itemRunningData = new Map<number, { qtyOnHand: number; cost: number }>();
    for (const meta of grItemMetas) {
      itemRunningData.set(meta.id, {
        qtyOnHand: Number(meta.qtyOnHand ?? 0),
        cost: Number(meta.cost ?? 0),
      });
    }

    let docIdx = 0;
    let lineIdx = 0;
    for (const item of goodsReceipt.items) {
      const smDocNo = smDocNos[docIdx++];
      const landedIdx = lineIdx++;
      const landedPerUnit = landed.perUnitAdditions[landedIdx] ?? 0;
      const landedAdminPerUnit = landed.adminPerUnitAdditions[landedIdx] ?? 0;

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

      const baseUnitCostWithLanded = baseUnitCost + landedPerUnit;

      // A service item is not stock: expense it, don't move inventory. No stock
      // move, no FIFO layer, no batch/serial, no qtyOnHand/average-cost change.
      if (itemMeta?.isService) {
        serviceJournalLines.push({ qty: Number(item.qty), cost: enteredUnitCost });
        continue;
      }

      const sm = await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          itemId: item.itemId,
          warehouseId: lineWarehouseId,
          qty: baseQty,
          cost: baseUnitCostWithLanded,
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
      journalLines.push({ qty: baseQty, cost: baseUnitCostWithLanded });
      // Component split (same total): goods-only, the admin-fee portion, and the
      // residual freight/other portion. goods + shipping + admin == the
      // capitalised line value, so the split journal balances to the cent.
      const lineAdminUnit = landedAdminPerUnit;
      const lineFreightUnit = landedPerUnit - landedAdminPerUnit;
      goodsOnlyLines.push({ qty: baseQty, cost: baseUnitCost });
      if (lineFreightUnit !== 0) {
        shippingLines.push({ qty: baseQty, cost: lineFreightUnit });
      }
      if (lineAdminUnit !== 0) {
        adminLines.push({ qty: baseQty, cost: lineAdminUnit });
      }

      // Update item qtyOnHand (global total, in base units)
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${baseQty} WHERE id = ${item.itemId}`;

      // Recalculate average cost if item uses average costing method
      if (itemMeta) {
        const costingMethod = costingMethodByItem.get(item.itemId) ?? "fifo";
        
        const running = itemRunningData.get(item.itemId) || { qtyOnHand: Number(itemMeta.qtyOnHand ?? 0), cost: Number(itemMeta.cost ?? 0) };
        const oldQty = running.qtyOnHand;
        const oldCost = running.cost;
        const newQty = baseQty;
        const newCost = baseUnitCostWithLanded;

        const totalQty = oldQty + newQty;
        let newAverageCost = oldCost;
        if (costingMethod === "average" && totalQty > 0) {
          newAverageCost = (oldQty * oldCost + newQty * newCost) / totalQty;
        }

        // Update running map
        itemRunningData.set(item.itemId, {
          qtyOnHand: totalQty,
          cost: newAverageCost,
        });

        // Write to database if using average method
        if (costingMethod === "average") {
          await tx.item.update({
            where: { id: item.itemId },
            data: { cost: newAverageCost },
          });
        }
      }

      // Create FIFO inventory layer scoped to the receiving warehouse (+ batch)
      await createInLayer(tx, {
        itemId: item.itemId,
        warehouseId: lineWarehouseId,
        batchNumber,
        stockMoveId: sm.id,
        qty: baseQty,
        unitCost: baseUnitCostWithLanded,
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

      // Serial tracking: register each received unit's serial number.
      // An item flagged trackSerial MUST arrive with one serial per received
      // unit. Previously the whole guard was gated behind
      // `Array.isArray(item.serialNumbers)`, so a line whose serial field was
      // null/undefined/absent skipped validation AND registration entirely —
      // a serial-tracked item could be verified stock-in with zero ItemSerial
      // rows and no quantity check. Keep this strict and aligned with
      // completeProductionOrder / consumeFifoLayers, which both refuse a
      // serial-count mismatch.
      if (itemMeta?.trackSerial) {
        const rawSerials = Array.isArray(item.serialNumbers)
          ? (item.serialNumbers as unknown[])
          : [];
        const serials = rawSerials
          .map((s) => String(s).trim())
          .filter((s) => s.length > 0);
        const expected = Math.round(baseQty);
        if (serials.length !== expected) {
          throw new Error(
            `Item #${item.itemId} melacak nomor seri: jumlah nomor seri (${serials.length}) tidak sama dengan qty diterima (${expected}).`,
          );
        }
        const uniqueSerials = new Set(serials);
        if (uniqueSerials.size !== serials.length) {
          throw new Error(
            `Item #${item.itemId}: terdapat duplikasi nomor seri pada penerimaan.`,
          );
        }
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

    // ─── 4. Create Journal Entry ──────────────────────────────────────
    // Use the per-line base-converted values captured above, NOT the raw
    // i.qty/i.unitCost on goodsReceipt.items (which may be in an alternate
    // UoM). Without this, multi-UoM GRs would post a GL inventory value
    // that doesn't match the stock-move + FIFO layer amounts, drifting the
    // general ledger from the stock subledger.
    // Only post an inventory journal when stock actually moved; an all-service
    // GR has no inventory debit (PRD FAB-08).
    if (journalLines.length > 0) {
      await stockJournalService.onGoodsReceipt(
        tx,
        journalLines,
        goodsReceipt.documentNo ?? `GR-${goodsReceiptId}`,
        goodsReceiptId,
        userId,
        null,
        goodsReceipt.date,
        // Component split for the journal breakdown (goods + ongkir + admin).
        // `undefined` slices fall back to a single blended inventory debit.
        goodsOnlyLines.length > 0 ? goodsOnlyLines : undefined,
        shippingLines.length > 0 ? shippingLines : undefined,
        adminLines.length > 0 ? adminLines : undefined,
      );
    }

    // Service lines: expensed directly, no inventory debit (PRD FAB-08).
    if (serviceJournalLines.length > 0) {
      await stockJournalService.onServiceGoodsReceipt(
        tx,
        serviceJournalLines,
        goodsReceipt.documentNo ?? `GR-${goodsReceiptId}`,
        goodsReceiptId,
        userId,
        null,
        goodsReceipt.date
      );
    }

    // ─── 5. Update GR status ─────────────────────────────────────────────
    await tx.goodsReceipt.update({
      where: { id: goodsReceiptId },
      data: { status: PurchaseStatus.VERIFIED },
    });
  });
}
