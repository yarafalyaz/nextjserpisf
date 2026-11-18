import { prisma, type TxClient } from "@/lib/db/prisma";
import { createInstalledPartsForWorkOrder } from "@/lib/services/installed-part.service";
import { releaseActiveReservationsForWorkOrderTx } from "@/lib/services/stock-reservation.service";
import { createWarrantyCoveragesForWorkOrder } from "@/lib/services/warranty.service";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Buat DeliveryOrder draf otomatis dari WorkOrder yang baru selesai.
 * Hanya membuat DO jika WO memiliki item stok (itemId != null && > 0)
 * dengan qty > 0 serta terhubung ke Quotation dan SalesOrder.
 */
export async function autoCreateDeliveryOrderTx(
  workOrderId: number,
  userId: number | null,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient ?? prisma;
  const wo = await db.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    include: { items: true, customer: true },
  });

  // Baris jasa (itemId NULL atau 0 warisan) bukan barang katalog yang bisa dikirim.
  const deliverableItems = (wo.items ?? []).filter(
    (i): i is typeof i & { itemId: number } =>
      Number(i.qty) > 0 && i.itemId != null && i.itemId > 0,
  );
  if (deliverableItems.length === 0) return;

  // Guard: DO harus tertaut ke SalesOrder dari quotation WO agar tidak salah pilih SO.
  if (!wo.quotationId) return;

  const salesOrder = await db.salesOrder.findFirst({
    where: { quotationId: wo.quotationId },
  });
  if (!salesOrder) return;

  const doDocNo = await generateDocumentNumber("DO");

  const deliveryOrder = await db.deliveryOrder.create({
    data: {
      documentNo: doDocNo,
      doNumber: doDocNo,
      salesOrderId: salesOrder.id,
      customerId: wo.customerId,
      date: new Date(),
      deliveryDate: new Date(),
      status: "draft",
      notes: `Otomatis dibuat dari Work Order ${wo.documentNo}`,
      createdBy: userId ?? null,
    },
  });

  await db.deliveryOrderItem.createMany({
    data: deliverableItems.map((item) => ({
      deliveryOrderId: deliveryOrder.id,
      itemId: item.itemId,
      qty: item.qty,
      notes: item.description || null,
    })),
  });
}

/**
 * Jalankan seluruh efek samping penyelesaian WorkOrder dalam satu transaksi
 * pemanggil sesudah klaim kondisional `workOrder.updateMany(status = "completed")`
 * menang (`count === 1`). Dipakai bersama oleh `completeWorkOrderTx` dan
 * `syncProjectStatusTx` agar status item, pelepasan reservasi stok, garansi
 * pasang, registri part terpasang, dan DO otomatis selalu konsisten.
 */
export async function applyWorkOrderCompletionSideEffectsTx(
  tx: TxClient,
  workOrderId: number,
  userId?: number | null,
  completedAt: Date = new Date(),
): Promise<number> {
  await tx.workOrderItem.updateMany({
    where: { workOrderId },
    data: { status: "completed" },
  });

  const released = await releaseActiveReservationsForWorkOrderTx(tx, {
    workOrderId,
    releasedBy: userId ?? null,
    reason: "Perintah kerja selesai",
  });

  await createWarrantyCoveragesForWorkOrder(workOrderId, completedAt, tx);
  await createInstalledPartsForWorkOrder(workOrderId, completedAt, tx);
  await autoCreateDeliveryOrderTx(workOrderId, userId ?? null, tx);

  return released;
}
