
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";

/**
 * Down Payment Hook - Observer pattern replacement.
 * Triggered when a Down Payment is confirmed.
 * Creates: Work Order, Project, Sales Order, Sales Invoice.
 */

interface FlatItem {
  itemId: number | null;
  itemName: string;
  qty: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  sectionName: string;
}

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
                items: true,
              },
            },
            customer: true,
            customerVehicle: true,
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
    const allItems: FlatItem[] = quotation.sections.flatMap((section) =>
      section.items.map((item) => ({
        itemId: item.itemId,
        itemName: item.description ?? "",
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount ?? 0),
        subtotal: Number(item.total),
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
        date: new Date(),
        status: "pending",
        notes: `Auto-generated dari DP ${dp.documentNo}`,
        createdBy: userId ?? null,
      },
    });

    // Create Work Order Items
    if (allItems.length > 0) {
      await tx.workOrderItem.createMany({
        data: allItems
          .filter((item) => item.itemId !== null)
          .map((item) => ({
            workOrderId: workOrder.id,
            itemId: item.itemId!,
            qty: item.qty,
            cost: item.unitPrice,
          })),
      });
    }

    // ─── 2. Create Project ───────────────────────────────────────────────
    const project = await tx.project.create({
      data: {
        name: `Project - ${quotation.customer?.name ?? ""} - ${woDocNo}`,
        customerId: quotation.customerId,
        status: "active",
        startDate: new Date(),
        notes: `Auto-generated dari DP ${dp.documentNo}. Quotation: ${quotation.documentNo}`,
        createdBy: userId ?? null,
      },
    });

    // Initialize default project stages
    await tx.projectStage.createMany({
      data: [
        { projectId: project.id, name: "Persiapan", sortOrder: 1, status: "pending" },
        { projectId: project.id, name: "Pengerjaan", sortOrder: 2, status: "pending" },
        { projectId: project.id, name: "Quality Check", sortOrder: 3, status: "pending" },
        { projectId: project.id, name: "Selesai", sortOrder: 4, status: "pending" },
      ],
    });

    // ─── 3. Create Sales Order + Items ───────────────────────────────────
    const soDocNo = await generateDocumentNumber("SO");

    const salesOrder = await tx.salesOrder.create({
      data: {
        documentNo: soDocNo,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        date: new Date(),
        subtotal: quotation.subtotal,
        discount: quotation.discount ?? 0,
        tax: quotation.tax ?? 0,
        grandTotal: quotation.grandTotal,
        totalAmount: quotation.grandTotal,
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
          total: item.subtotal,
        })),
      });
    }

    // ─── 5. Update Down Payment status ───────────────────────────────────
    await tx.downPayment.update({
      where: { id: dpId },
      data: {
        status: "confirmed",
      },
    });

    // ─── 6. Update Quotation status → converted ─────────────────────────
    await tx.quotation.update({
      where: { id: quotation.id },
      data: { status: "converted" },
    });
  });
}
