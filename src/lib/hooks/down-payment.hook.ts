// @ts-nocheck
import { prisma, TxClient } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Down Payment Hook - Observer pattern replacement.
 * Triggered when a Down Payment is confirmed.
 * Creates: Work Order, Project, Sales Order, Sales Invoice.
 */

// ─────────────────────────────────────────────────────────────────────────────
// onDownPaymentConfirmed
// - Create Work Order + Items
// - Create Project + Initialize Stages
// - Create Sales Order + Items
// - Create Sales Invoice + Items
// - Update Quotation status → converted
// - Idempotency check
// ─────────────────────────────────────────────────────────────────────────────

export async function onDownPaymentConfirmed(
  dpId: number,
  userId?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const dp = await tx.downPayment.findUniqueOrThrow({
      where: { id: dpId },
      include: {
        quotation: {
          include: {
            sections: {
              include: {
                items: {
                  include: { item: true },
                },
              },
            },
            customer: true,
            customerVehicle: { include: { vehicle: true } },
          },
        },
      },
    });

    // Guard: already confirmed
    if (dp.status === "confirmed") {
      throw new Error("Down Payment sudah dikonfirmasi sebelumnya.");
    }

    const quotation = dp.quotation;
    if (!quotation) {
      throw new Error("Quotation tidak ditemukan untuk Down Payment ini.");
    }

    if (quotation.status !== "accepted") {
      throw new Error("Quotation belum di-accept.");
    }

    // ─── Idempotency Check ───────────────────────────────────────────────
    const existingWO = await tx.workOrder.findFirst({
      where: { quotationId: quotation.id },
    });
    if (existingWO) {
      throw new Error("Dokumen sudah dibuat untuk quotation ini (idempotency).");
    }

    // Flatten all items from quotation sections
    const allItems = quotation.sections.flatMap((section) =>
      section.items.map((item) => ({
        itemId: item.itemId,
        itemName: item.item?.name ?? "",
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount ?? 0),
        subtotal: Number(item.subtotal),
        sectionName: section.name,
      }))
    );

    // ─── 1. Create Work Order ────────────────────────────────────────────
    const woDocNo = await generateDocumentNumber("WO");

    const workOrder = await tx.workOrder.create({
      data: {
        documentNo: woDocNo,
        quotationId: quotation.id,
        customerId: quotation.customerId,
        customerVehicleId: quotation.customerVehicleId,
        status: "pending",
        notes: `Auto-generated dari DP ${dp.documentNo}`,
        createdBy: userId ?? null,
      },
    });

    // Create Work Order Items
    if (allItems.length > 0) {
      await tx.workOrderItem.createMany({
        data: allItems.map((item) => ({
          workOrderId: workOrder.id,
          itemId: item.itemId,
          qty: item.qty,
          unitCost: item.unitPrice,
          description: item.itemName,
        })),
      });
    }

    // ─── Stock Shortage Warnings ──────────────────────────────────────────
    const stockWarnings: string[] = [];
    for (const item of allItems) {
      const stock = await tx.item.findUnique({
        where: { id: item.itemId },
        select: { qtyOnHand: true, name: true },
      });
      if (stock && Number(stock.qtyOnHand) < Number(item.qty)) {
        stockWarnings.push(
          `⚠️ Stok ${stock.name} kurang (tersedia: ${stock.qtyOnHand}, butuh: ${item.qty})`
        );
      }
    }
    if (stockWarnings.length > 0) {
      const currentNotes = workOrder.notes || "";
      await tx.workOrder.update({
        where: { id: workOrder.id },
        data: { notes: `${currentNotes}\n${stockWarnings.join("\n")}`.trim() },
      });
    }

    // ─── 2. Create Project + Initialize Stages ───────────────────────────
    const projectDocNo = await generateDocumentNumber("PRJ");

    const project = await tx.project.create({
      data: {
        documentNo: projectDocNo,
        name: `Project - ${quotation.customer?.name ?? ""} - ${woDocNo}`,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        workOrderId: workOrder.id,
        status: "active",
        startDate: new Date(),
        createdBy: userId ?? null,
      },
    });

    // Initialize default project stages
    const defaultStages = [
      { name: "Persiapan", order: 1, status: "pending" },
      { name: "Pengerjaan", order: 2, status: "pending" },
      { name: "Quality Check", order: 3, status: "pending" },
      { name: "Selesai", order: 4, status: "pending" },
    ];

    await tx.projectStage.createMany({
      data: defaultStages.map((stage) => ({
        projectId: project.id,
        name: stage.name,
        sortOrder: stage.order,
        status: stage.status,
      })),
    });

    // ─── 3. Create Sales Order + Items ───────────────────────────────────
    const soDocNo = await generateDocumentNumber("SO");

    const salesOrder = await tx.salesOrder.create({
      data: {
        documentNo: soDocNo,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        workOrderId: workOrder.id,
        date: new Date(),
        subtotal: quotation.subtotal,
        discount: quotation.discount ?? 0,
        tax: quotation.tax ?? 0,
        grandTotal: quotation.grandTotal,
        status: "confirmed",
        notes: `Auto-generated dari DP ${dp.documentNo}`,
        createdBy: userId ?? null,
      },
    });

    if (allItems.length > 0) {
      await tx.salesOrderItem.createMany({
        data: allItems.map((item) => ({
          salesOrderId: salesOrder.id,
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount,
          subtotal: item.subtotal,
        })),
      });
    }

    // ─── 4. Create Sales Invoice + Items ─────────────────────────────────
    const invDocNo = await generateDocumentNumber("INV");

    const invoice = await tx.salesInvoice.create({
      data: {
        documentNo: invDocNo,
        customerId: quotation.customerId,
        salesOrderId: salesOrder.id,
        quotationId: quotation.id,
        date: new Date(),
        subtotal: quotation.subtotal,
        discount: quotation.discount ?? 0,
        tax: quotation.tax ?? 0,
        grandTotal: quotation.grandTotal,
        totalAmount: quotation.grandTotal,
        taxAmount: quotation.tax ?? 0,
        paidAmount: dp.amount,
        status: "posted",
        paymentStatus: Number(dp.amount) >= Number(quotation.grandTotal) ? "paid" : "partial",
        notes: `Auto-generated dari DP ${dp.documentNo}`,
        createdBy: userId ?? null,
      },
    });

    if (allItems.length > 0) {
      await tx.salesInvoiceItem.createMany({
        data: allItems.map((item) => ({
          salesInvoiceId: invoice.id,
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount,
          subtotal: item.subtotal,
        })),
      });
    }

    // ─── 5. Update Down Payment status ───────────────────────────────────
    await tx.downPayment.update({
      where: { id: dpId },
      data: {
        status: "confirmed",
        workOrderId: workOrder.id,
        salesOrderId: salesOrder.id,
        salesInvoiceId: invoice.id,
      },
    });

    // ─── 6. Update Quotation status → converted ─────────────────────────
    await tx.quotation.update({
      where: { id: quotation.id },
      data: { status: "converted" },
    });
  });
}
