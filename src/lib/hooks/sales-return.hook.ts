
import { prisma, TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { slugify } from "@/lib/utils/slug";
import { createInLayer } from "@/lib/services/inventory-fifo";
import { Status } from "@/lib/constants";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { toBaseFactor } from "@/lib/services/uom.service";

/** P1-1: normalisasi kolom identitas Json (array / koma-pisah / null). */
function toCleanStrings(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(raw.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0))];
}

/**
 * Sales Return Hook - Observer pattern replacement.
 * Triggered when a Sales Return is completed.
 * Creates Stock Move IN per item (returned goods back to warehouse).
 * Creates Journal Entry (Dr Inventory, Cr Sales Return)
 */

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number,
  txClient?: TxClient
): Promise<void> {
  const executeInTx = async (tx: TxClient | undefined, callback: (t: TxClient) => Promise<unknown>) => {
    return tx ? callback(tx) : prisma.$transaction(callback);
  };

  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same sales return.
    await tx.$queryRaw`SELECT id FROM sales_returns WHERE id = ${returnId} FOR UPDATE`;
    const salesReturn = await tx.salesReturn.findUniqueOrThrow({
      where: { id: returnId },
      include: { items: true },
    });

    // F-2026-10-24-137-V Putusan 1 (tahap 2): klasifikasi PER-BARIS.
    // Retur besi tua murni: nol StockMove IN, nol lapisan FIFO, nol
    // qtyOnHand (nilai buku Rp0) — hanya status completed. Retur campuran
    // scrap+dagang ditolak berisik (faktur campuran tak pernah terposting).
    let isScrapReturn = false;
    if (salesReturn.salesInvoiceId != null) {
      const returnItemIds = [...new Set(salesReturn.items.map((it) => it.itemId).filter((id): id is number => typeof id === "number"))];
      if (returnItemIds.length > 0) {
        const scrapRows = await tx.item.findMany({
          where: { id: { in: returnItemIds } },
          select: { id: true, isScrapSaleItem: true },
        });
        const isScrap = new Map(scrapRows.map((r) => [r.id, r.isScrapSaleItem]));
        const activeItems = salesReturn.items.filter((it) => Number(it.qty) > 0);
        const scrapCount = activeItems.filter((it) => typeof it.itemId === "number" && isScrap.get(it.itemId)).length;
        if (scrapCount > 0 && scrapCount === activeItems.length) {
          isScrapReturn = true;
        } else if (scrapCount > 0) {
          throw new Error(
            "Retur penjualan campuran besi tua (scrap) dan dagang ditolak: pisahkan retur besi tua dari retur dagang — " +
              "pendapatan besi tua masuk akun lain-lain dan nilai bukunya Rp0.",
          );
        }
      }
    }

    // Idempotency: check if stock moves already exist
    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "SalesReturn",
        referenceId: returnId,
      },
    });
    if (existingMoves) return; // Idempotent: silently no-op

    // Enforce period lock — return date must fall in an open period.
    await assertPeriodOpen(salesReturn.date, tx);

    // Guard: must be in a completable state
    if (salesReturn.status === Status.COMPLETED || salesReturn.status === Status.CANCELLED) {
      return; // already completed/cancelled; idempotent no-op
    }

    // Retur besi tua: nol gerakan stok — hanya status completed. Jurnal
    // dibukukan accounting.hook (Dr scrap income + PPN / Cr Piutang|Kas).
    if (isScrapReturn) {
      await tx.salesReturn.update({
        where: { id: returnId },
        data: { status: Status.COMPLETED },
      });
      return;
    }

    // Resolve warehouse: item default warehouse → first ACTIVE warehouse fallback
    const fallbackWarehouse = await tx.warehouse.findFirst({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (!fallbackWarehouse) throw new Error("Tidak ada gudang aktif.");

    // Pre-fetch every item's default warehouse in ONE query instead of a
    // findUnique per line (N+1). The lookup is a pure read with no ordering
    // dependency, so hoisting it out of the loop is safe and collapses N
    // round-trips into one.
    const returnItemIds = [...new Set(salesReturn.items.map((it) => it.itemId))];
    const itemDefaults = returnItemIds.length
      ? await tx.item.findMany({
          where: { id: { in: returnItemIds } },
          select: { id: true, defaultWarehouseId: true, trackSerial: true, trackBatch: true },
        })
      : [];
    const warehouseByItem = new Map(itemDefaults.map((it) => [it.id, it.defaultWarehouseId]));
    const trackSerialByItem = new Map(itemDefaults.map((it) => [it.id, it.trackSerial]));
    const trackBatchByItem = new Map(itemDefaults.map((it) => [it.id, it.trackBatch]));

    const invoiceUnits = salesReturn.salesInvoiceId
      ? await tx.salesInvoiceItem.findMany({
          where: { salesInvoiceId: salesReturn.salesInvoiceId, itemId: { in: returnItemIds } },
          select: { itemId: true, uom: true },
        })
      : [];
    const uomByItem = new Map<number, string | null>();
    for (const line of invoiceUnits) {
      if (line.itemId != null && !uomByItem.has(line.itemId)) uomByItem.set(line.itemId, line.uom);
    }

    // Create Stock Move IN per item (goods returned to warehouse)
    const activeItems = salesReturn.items.filter((it) => Number(it.qty) > 0);
    if (activeItems.length > 0) {
      // 1. Batch-generate one document number per line (was N serial round-trips).
      const smDocNos = await generateDocumentNumberBatch("SM", activeItems.length);
      // 2. Lock all item rows in a single query (was N serial FOR UPDATE).
      const activeItemIds = activeItems.map((it) => it.itemId);
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(activeItemIds)}) FOR UPDATE`;

      let docIdx = 0;
      for (const item of activeItems) {
        const factor = await toBaseFactor(tx, item.itemId, uomByItem.get(item.itemId));
        const baseQty = Number(item.qty) * factor;
        const baseCost = factor > 0 ? Number(item.cost ?? 0) / factor : Number(item.cost ?? 0);
        const smDocNo = smDocNos[docIdx++];

        // Resolve warehouse per item (chain: item default → fallback)
        const resolvedWarehouseId = warehouseByItem.get(item.itemId) ?? fallbackWarehouse.id;

        const sm = await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
            slug: slugify(smDocNo),
            itemId: item.itemId,
            warehouseId: resolvedWarehouseId,
            qty: baseQty,
            cost: baseCost,
            impact: "IN",
            status: "posted",
            referenceType: "SalesReturn",
            referenceId: salesReturn.id,
            notes: `Retur Penjualan ${salesReturn.documentNo}`,
            createdBy: userId ?? null,
          },
        });

        // Update item qtyOnHand (global total)
        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${baseQty} WHERE id = ${item.itemId}`;

        // Create FIFO inventory layer (returned stock) in the resolved warehouse.
        // P1-1: provenance batch eksplisit — baris batch-tracked membawa
        // batchNumbers dari dokumen retur; layer + itemBatch mencatatnya.
        // Tanpa identitas (baris lama / panggilan langsung hook), tolak bila
        // item batch-tracked agar tak tercipta stok tanpa identitas lot.
        const rowBatches = toCleanStrings(item.batchNumbers);
        if (trackBatchByItem.get(item.itemId) && rowBatches.length === 0) {
          throw new Error(
            `Item #${item.itemId} memakai pelacakan batch — sebutkan nomor batch yang benar-benar kembali.`,
          );
        }
        const rowSerials = toCleanStrings(item.serialNumbers);
        if (trackSerialByItem.get(item.itemId) && rowSerials.length === 0) {
          throw new Error(
            `Item #${item.itemId} memakai pelacakan serial — sebutkan nomor seri yang benar-benar kembali.`,
          );
        }
        // Satu layer per lot: layer gabungan "LOT-A, LOT-B" tak pernah
        // ditemukan konsumsi FIFO sehingga ItemBatch tak berkurang. Qty
        // baris dibagi rata antar lot (sisa pembulatan di lot terakhir)
        // dan nilai yang sama dipakai layer + ItemBatch.
        const basePerBatch =
          rowBatches.length > 0 ? Math.round((baseQty / rowBatches.length) * 100) / 100 : 0;
        const perBatchQty = rowBatches.map((bn, idx) => ({
          batchNumber: bn,
          qty:
            idx === rowBatches.length - 1
              ? Math.round((baseQty - basePerBatch * (rowBatches.length - 1)) * 100) / 100
              : basePerBatch,
        }));
        if (perBatchQty.length === 0) {
          await createInLayer(tx, {
            itemId: item.itemId,
            warehouseId: resolvedWarehouseId,
            batchNumber: null,
            stockMoveId: sm.id,
            qty: baseQty,
            unitCost: baseCost,
          });
        } else {
          for (const alloc of perBatchQty) {
            await createInLayer(tx, {
              itemId: item.itemId,
              warehouseId: resolvedWarehouseId,
              batchNumber: alloc.batchNumber,
              stockMoveId: sm.id,
              qty: alloc.qty,
              unitCost: baseCost,
            });
          }
          // Pola sama seperti transfer: tambah ke lot tujuan bila ada, buat bila belum.
          for (const alloc of perBatchQty) {
            const destBatch = await tx.itemBatch.findFirst({
              where: { itemId: item.itemId, warehouseId: resolvedWarehouseId, batchNumber: alloc.batchNumber },
              select: { id: true },
            });
            if (destBatch) {
              await tx.itemBatch.update({
                where: { id: destBatch.id },
                data: { qty: { increment: alloc.qty } },
              });
            } else {
              await tx.itemBatch.create({
                data: {
                  itemId: item.itemId,
                  batchNumber: alloc.batchNumber,
                  warehouseId: resolvedWarehouseId,
                  qty: alloc.qty,
                  notes: `Retur Penjualan ${salesReturn.documentNo}`,
                },
              });
            }
          }
        }

        // Serial-tracked items: a return puts the physical units back in stock,
        // so their ItemSerial rows must be revived to "available" — TAPI hanya
        // serial yang disebut eksplisit di baris retur (identitas fisik yang
        // benar-benar kembali). Merevive "used terbaru" salah: bisa menghidupkan
        // serial yang masih di tangan pelanggan lain.
        if (trackSerialByItem.get(item.itemId)) {
          const rows = await tx.itemSerial.findMany({
            where: { itemId: item.itemId, serialNumber: { in: rowSerials } },
            select: { id: true, serialNumber: true, status: true },
          });
          const found = new Map(rows.map((r) => [r.serialNumber, r]));
          const missing = rowSerials.filter((s) => !found.has(s));
          if (missing.length > 0) {
            throw new Error(
              `Nomor seri tak dikenal untuk item #${item.itemId}: ${missing.join(", ")}.`,
            );
          }
          const notUsed = rows.filter((r) => r.status !== "used");
          if (notUsed.length > 0) {
            throw new Error(
              `Nomor seri bukan status terpakai (tak bisa diretur): ${notUsed.map((r) => r.serialNumber).join(", ")}.`,
            );
          }
          if (rows.length > 0) {
            await tx.itemSerial.updateMany({
              where: { id: { in: rows.map((r) => r.id) } },
              data: { status: "available", warehouseId: resolvedWarehouseId },
            });
          }
        }
      }
    }

    // Stock-only hook: GL for a sales return is posted exclusively by
    // accounting.hook.onSalesReturnCompleted (single balanced journal valuing AR at
    // selling price). Posting a journal here too would collide on referenceType
    // "SalesReturn" and suppress the AR journal.

    // Update Sales Return status
    await tx.salesReturn.update({
      where: { id: returnId },
      data: {
        status: Status.COMPLETED,
      },
    });
  });
}
