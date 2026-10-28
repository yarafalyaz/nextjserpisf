
import { prisma, TxClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { slugify } from "@/lib/utils/slug";
import { stockJournalService } from "@/lib/services/stock-journal.service";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { consumeReservationsForMaterialIssueTx } from "@/lib/services/stock-reservation.service";
import { assertMaterialIssueStockOutOnce } from "@/lib/services/stock-out-once.service";
import { classifyScrapLine, validateScrapInput } from "@/lib/services/scrap-classification";
import { scrapReviewStatusAfterComplete } from "@/lib/services/scrap-physical";
import { safeAdd } from "@/lib/utils/math";
import { Status } from "@/lib/constants";


const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<unknown>
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback);
};

/**
 * Beku snapshot scrap per baris issue (F-2026-10-21-008, vonis BOT 4
 * F-2026-10-22-066-V). Satu-satunya penulis snapshot MI: dipanggil dari
 * ketiga titik lahir baris (buat-dari-WO di manufacturing, create/update
 * draft di inventory) supaya izin snapshot IDENTIK — complete dilarang
 * membaca master/BOM hidup. Baris tanpa WO / revisi tak ter-pin / baris
 * di luar revisi → snapshot LENGKAP (null = belum kalibrasi → seluruh
 * scrap abnormal + temuan kalibrasi), tidak pernah gaduhan parsial.
 */
export async function resolveMaterialIssueScrapSnapshots(
  tx: TxClient,
  rows: { itemId: number; workOrderItemId?: number | null }[],
  workOrderId: number | null | undefined,
): Promise<Map<number, number | null>> {
  const fallbackAll = () => new Map<number, number | null>(rows.map((r) => [r.itemId, null]));
  if (workOrderId == null) return fallbackAll();
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { bomRevisionId: true },
  });
  if (!wo || wo.bomRevisionId == null) return fallbackAll();
  const revLines = await tx.bomRevisionMaterial.findMany({
    where: { bomRevisionId: wo.bomRevisionId },
    select: { itemId: true, scrapPercent: true },
  });
  const byItem = new Map(
    revLines.map((l) => [l.itemId, l.scrapPercent != null ? Number(l.scrapPercent) : null]),
  );
  const out = new Map<number, number | null>();
  for (const r of rows) {
    const v = byItem.get(r.itemId) ?? null;
    if (v != null && (v < 0 || v > 100)) {
      throw new Error(
        `Allowance scrap item #${r.itemId} di luar rentang 0–100% — perbaiki revisi BOM, penyelesaian tidak memakai nilai karangan.`,
      );
    }
    out.set(r.itemId, v);
  }
  return out;
}

/**
 * Material Issue Hook - Observer pattern replacement.
 * Triggered when a Material Issue is completed.
 * Creates Stock Move OUT per item.
 * Creates Journal Entry (Dr Material Expense, Cr Inventory)
 */

export async function onMaterialIssueCompleted(
  issueId: number,
  userId?: number
, txClient?: TxClient): Promise<void> {
  await executeInTx(txClient, async (tx) => {
    // Serialize concurrent calls for the same material issue.
    await tx.$queryRaw`SELECT id FROM material_issues WHERE id = ${issueId} FOR UPDATE`;
    const issue = await tx.materialIssue.findUniqueOrThrow({
      where: { id: issueId },
      include: { items: true },
    });

    const existingMoves = await tx.stockMove.findFirst({
      where: {
        referenceType: "MaterialIssue",
        referenceId: issueId,
      },
    });

    // Idempotent retry: if the observer already posted stock, do not create duplicates.
    if (existingMoves) return;

    // Guard: observer should only run on transition to completed.
    if (issue.status === Status.COMPLETED) {
      return; // already completed; idempotent no-op
    }

    // Period lock: the GL journal posted below (stockJournalService) bypasses
    // accounting.hook, so enforce the closed-period guard here too — otherwise
    // material issues can back-date GL into a closed period.
    await assertPeriodOpen(issue.date, tx);

    // SAL-BR-014: guard tepat-satu-kali lintas jalur. Item issue ini
    // tidak boleh sudah dikeluarkan sebagai penjualan pada pohon
    // quotation yang sama (StockMove OUT SalesInvoice posted).
    // Gerbang ini menempuh serialisasi bersama lebih dulu: kunci baris
    // `quotations` pohon (FOR UPDATE) SEBELUM membaca move lawan, lalu
    // membaca move lawan sebagai locking read (F-2026-10-28-122-S).
    // Fail-closed di service terpusat; konflik = rollback seluruh tx.
    await assertMaterialIssueStockOutOnce(
      tx,
      issueId,
      issue.items
        .filter((item) => Number(item.qty) > 0)
        .map((item) => ({ itemId: item.itemId, qty: Number(item.qty) })),
    );

    // F-008 (vonis BOT 4 F-066-V): validasi scrap baris SEBELUM stok
    // bergerak, direncanakan dari BARIS WO asal (planned = qty baris WO
    // yang dirujuk materialIssueItem.workOrderItemId persis, BUKAN qty
    // issue — batch kecil tidak boleh mewarisi budget allowance penuh).
    const plannedByItemId = new Map<number, number>();
    if (issue.workOrderId != null) {
      const woLines = await tx.workOrderItem.findMany({
        where: { workOrderId: issue.workOrderId },
        select: { id: true, qty: true },
      });
      for (const wl of woLines) plannedByItemId.set(wl.id, Number(wl.qty));
    }
    for (const item of issue.items) {
      const err = validateScrapInput({
        issueQty: Number(item.qty),
        scrapQty: Number(item.scrapQty ?? 0),
        scrapReasonCode: item.scrapReasonCode,
        scrapNote: item.scrapNote,
      });
      if (err) throw new Error(`Baris item #${item.itemId}: ${err}`);
    }

    // Create Stock Move OUT per item
    const journalItems: { qty: number; cost: number }[] = [];
    let runningAbnormalValue = 0;
    let firstMoveId: number | null = null;
    
    // Filter active items
    const activeItems = issue.items.filter((item) => Number(item.qty) > 0);
    if (activeItems.length > 0) {
      // 1. Batch document numbers
      const smDocNos = await generateDocumentNumberBatch("SM", activeItems.length);
      
      // 2. Batch lock item rows to serialize global qtyOnHand updates
      const itemIds = activeItems.map((item) => item.itemId);
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(itemIds)}) FOR UPDATE`;
      
      let docIdx = 0;
      for (const item of activeItems) {
        const qty = Number(item.qty);

        // Optional manual serial selection for serial-tracked materials. When
        // the caller picked serials we pass them through so consumeFifoLayers
        // marks exactly those (and validates count/uniqueness/availability);
        // when absent it falls back to auto-FIFO. Stored as Json on the row.
        const pickedSerials = Array.isArray(item.serialNumbers)
          ? (item.serialNumbers as unknown[])
              .map((s) => String(s).trim())
              .filter((s) => s.length > 0)
          : null;

        // Consume FIFO from the issue's warehouse (guards per-warehouse stock)
        // and capture the ACTUAL consumed cost first, so both the StockMove and
        // the GL journal record the real FIFO cost — not the item.cost master
        // snapshot. Falls back to master cost for any shortfall portion.
        const { consumedCost, shortfall, consumedSerials, consumedBatches } = await consumeFifoLayers(tx, {
          itemId: item.itemId,
          warehouseId: issue.warehouseId,
          qty,
          label: `pengeluaran material ${issue.documentNo}`,
          serialNumbers: pickedSerials && pickedSerials.length > 0 ? pickedSerials : null,
          // F-2026-10-20-79: tanggal dokumen mengaktifkan guard batch
          // kedaluwarsa + dekremen ItemBatch FEFO fisik di consumeFifoLayers;
          // biaya tetap FIFO lapisan. Lemparan di sini menggulung seluruh tx
          // (tanpa StockMove/jurnal/status yang lahir).
          documentDate: issue.date,
        });

        // Persist the serial attribution on the issue line so the document
        // records which units were actually consumed (auto-FIFO or manual).
        if (consumedSerials && consumedSerials.length > 0) {
          await tx.materialIssueItem.update({
            where: { id: item.id },
            data: { serialNumbers: consumedSerials },
          });
        }
        // F-2026-10-20-39(a): simpan batch/lot yang benar-benar ter-konsumsi
        // supaya klaim garansi bisa menelusur lot terpasang per baris issue.
        if (consumedBatches && consumedBatches.length > 0) {
          await tx.materialIssueItem.update({
            where: { id: item.id },
            data: {
              batchNumbers: consumedBatches.map((b) => ({
                batchNumber: b.batchNumber,
                qty: b.qty,
              })),
            },
          });
        }
        const fallback = Number(item.cost ?? 0);
        const totalCost = consumedCost + shortfall * fallback;
        const unitCost = qty > 0 ? totalCost / qty : fallback;

        // F-008: klasifikasi SEKALI per baris di complete, unit cost FIFO
        // aktual baris ini (konsisten StockMove). Snapshot input dibaca
        // dari kolom beku baris (scrapQty/scrapPercentSnapshot), BUKAN
        // master BOM hidup. planned = qty BARIS WO asal persis baris ini
        // (workOrderItemId); tanpa rujukan → rencana issue baris ini.
        const plannedQty =
          item.workOrderItemId != null ? (plannedByItemId.get(item.workOrderItemId) ?? qty) : qty;
        const classification = classifyScrapLine({
          issueQty: qty,
          plannedQty,
          scrapQty: Number(item.scrapQty ?? 0),
          scrapReasonCode: item.scrapReasonCode,
          scrapNote: item.scrapNote,
          scrapPercentSnapshot:
            item.scrapPercentSnapshot != null ? Number(item.scrapPercentSnapshot) : null,
          unitCost,
        });
        await tx.materialIssueItem.update({
          where: { id: item.id },
          data: {
            scrapClassifiedAt: new Date(),
            scrapPlannedQtySnapshot: plannedQty,
            scrapNormalQtySnapshot: classification.normalQty,
            scrapAbnormalQtySnapshot: classification.abnormalQty,
            scrapUnitCostSnapshot: unitCost,
            scrapNormalValueSnapshot: classification.normalValue,
            scrapAbnormalValueSnapshot: classification.abnormalValue,
            // F-098-S D-S98-04: abnormal masuk antrean tinjau; complete tidak ditahan.
            scrapReviewStatus: scrapReviewStatusAfterComplete(classification.abnormalQty),
          },
        });
        runningAbnormalValue = safeAdd(runningAbnormalValue, classification.abnormalValue, 2);

        const smDocNo = smDocNos[docIdx++];
        const createdMove = await tx.stockMove.create({
          data: {
            documentNo: smDocNo,
            slug: slugify(smDocNo),
            itemId: item.itemId,
            warehouseId: issue.warehouseId,
            qty: item.qty,
            cost: unitCost,
            impact: "OUT",
            status: "posted",
            referenceType: "MaterialIssue",
            referenceId: issue.id,
            notes: `Pengeluaran Material ${issue.documentNo}`,
            createdBy: userId ?? null,
          },
          select: { id: true },
        });
        if (firstMoveId == null) firstMoveId = createdMove.id;

        // Update item qtyOnHand (global total)
        await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${item.itemId}`;

        // Journal credits Inventory at the same ACTUAL FIFO cost recorded on the move.
        journalItems.push({ qty, cost: unitCost });
      }
    }

    // Create Journal Entry (Dr Material Expense, Cr Inventory)
    await stockJournalService.onMaterialIssue(
      tx,
      journalItems,
      issue.documentNo ?? `MI-${issueId}`,
      issueId,
      userId,
      issue.costCenterId,
      issue.date
    );

    // F-008 jalur MI: klasifikasi + snapshot + laporan saja. Jurnal
    // issue jalur ini Dr Beban Material / Cr Persediaan (onMaterialIssue
    // di atas) — TIDAK ada debit WIP, jadi jurnal P2(b) Dr Beban Kerugian
    // / Cr WIP vonis F-066-V tidak diposting di sini (kredit WIP hantu).
    // Nilai abnormal jalur MI sudah terbenam di beban material; pola
    // reklasifikasi jalur MI menunggu vonis BOT 4 lanjutan. Jurnal P2(b)
    // hanya jalur ProductionOrder (Dr WIP / Cr Persediaan saat issue).

    // F-2026-10-21-012 inti (BR-RES-08): konsumsi reservasi aktif WO
    // pemilik di gudang MI ini, di tx yang sama dengan pengeluaran stok.
    // MI tanpa WO / tanpa reservasi tetap jalan — kelebihan tercatat
    // sebagai keluar tanpa cadangan, reservasi WO lain tak disentuh.
    await consumeReservationsForMaterialIssueTx(tx, {
      workOrderId: issue.workOrderId,
      warehouseId: issue.warehouseId,
      items: activeItems.map((item) => ({ itemId: item.itemId, qty: Number(item.qty) })),
    });

    // Update Material Issue status
    await tx.materialIssue.update({
      where: { id: issueId },
      data: {
        status: Status.COMPLETED,
      },
    });
  });
}
