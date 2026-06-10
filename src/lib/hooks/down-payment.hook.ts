import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { notificationService } from "@/lib/services/notification.service";
import { onSalesInvoicePosted } from "@/lib/hooks/accounting.hook";
import { Status, WorkOrderStatus, SalesStatus } from "@/lib/constants";

/**
 * Down Payment Hook - Observer pattern replacement.
 * Triggered when a Down Payment is confirmed.
 * Creates: Work Order, Project, Sales Order, Sales Invoice.
 *
 * Parity with Laravel DownPaymentObserver:
 * 1. Quotation status must be "accepted"
 * 2. Idempotency: skip silently if WO/SO/Invoice already exist
 * 3. Create WorkOrder + WorkOrderItems from quotation sections
 * 4. Create Project + initializeStages
 * 5. Create SalesOrder + SalesOrderItems
 * 6. Create SalesInvoice + SalesInvoiceItems (paidAmount = DP amount)
 * 7. Update quotation status → converted
 * 8. Stock check for every item, record shortage in WO notes
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
  const readyDocuments: Array<{ type: "WorkOrder" | "SalesOrder" | "SalesInvoice"; documentNo: string; context: string }> = []
  let postedInvoiceId: number | null = null

  await prisma.$transaction(async (tx) => {
    // Serialize concurrent confirmDownPayment calls so the idempotency checks below
    // cannot both pass and double-create WO/SO/Invoice (+ double revenue).
    await tx.$queryRaw`SELECT id FROM down_payments WHERE id = ${dpId} FOR UPDATE`;
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

    // Guard: already confirmed — silent skip (idempotency).
    // Recovery: if a prior confirm committed the invoice but the process died
    // before the post-commit onSalesInvoicePosted call (revenue/COGS/stock-out),
    // re-capture the invoice id so the idempotent posting hook below completes
    // it on retry instead of leaving a "posted" invoice with no GL revenue.
    if (dp.status === SalesStatus.CONFIRMED) {
      const orphanInv = await tx.salesInvoice.findFirst({
        where: { quotationId: dp.quotationId },
        select: { id: true },
      });
      postedInvoiceId = orphanInv?.id ?? null;
      return;
    }

    const quotation = dp.quotation;
    if (!quotation) {
      throw new Error("Quotation tidak ditemukan untuk Down Payment ini.");
    }

    if (quotation.status !== SalesStatus.ACCEPTED) {
      throw new Error("Quotation belum di-accept.");
    }

    // ─── Idempotency Check ────────────────────────────────────────────
    // Laravel observer: skip silently if WO/SO/Invoice already exist
    const existingWO = await tx.workOrder.findFirst({
      where: { quotationId: quotation.id },
    });
    if (existingWO) {
      return;
    }
    const existingSO = await tx.salesOrder.findFirst({
      where: { quotationId: quotation.id },
    });
    if (existingSO) {
      return;
    }
    const existingInv = await tx.salesInvoice.findFirst({
      where: { quotationId: quotation.id },
    });
    if (existingInv) {
      return;
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

    // ─── Generate BOM Material Stock Notes & Services ─────────────────
    let bomNotes = `Auto-generated dari DP ${dp.documentNo}\n`;
    let serviceList = "";
    let materialHeaderAdded = false;
    
    try {
      for (const item of allItems) {
        // Cari produk BOM berdasarkan nama item/deskripsi quotation. Lewati jika
        // nama kosong — `contains: ""` akan cocok dengan produk pertama mana pun
        // dan menghasilkan catatan BOM yang salah.
        const matchedProduct = item.itemName.trim() === ""
          ? null
          : await tx.product.findFirst({
          where: {
            name: {
              contains: item.itemName,
            },
          },
          include: {
            materials: {
              include: {
                product: true,
              },
            },
          },
        });

        if (matchedProduct) {
          // Ambil detail bahan penyusun dengan item (untuk stok)
          const materialsWithStock = await tx.productMaterial.findMany({
            where: { productId: matchedProduct.id },
          });

          // Fetch items for stock in parallel
          const materialItems = await tx.item.findMany({
            where: { id: { in: materialsWithStock.map(m => m.itemId) } },
            select: { id: true, name: true, qtyOnHand: true, unitOfMeasure: true },
          });

          if (materialsWithStock.length > 0) {
            if (!materialHeaderAdded) {
              bomNotes += `\n[RINCIAN KEBUTUHAN MATERIAL & CEK STOK]\n`;
              materialHeaderAdded = true;
            }
            bomNotes += `\nProduk Perakitan: ${matchedProduct.name} (Qty: ${item.qty})\n`;
            materialsWithStock.forEach(mat => {
              const dbItem = materialItems.find(i => i.id === mat.itemId);
              const qtyNeeded = Number(mat.qty) * item.qty;
              const stock = dbItem ? Number(dbItem.qtyOnHand) : 0;
              const uom = dbItem ? dbItem.unitOfMeasure : "PCS";
              const isShortage = stock < qtyNeeded;

              bomNotes += `- ${dbItem?.name || `Item #${mat.itemId}`}: Butuh ${qtyNeeded} ${uom} | Stok Saat Ini: ${stock} ${uom} ${isShortage ? "(Stok Kurang!)" : "(Cukup)"}\n`;
            });
          }
        } else {
          // Non-BOM item: check stock if it has a valid itemId
          if (item.itemId !== null) {
            const stockItem = await tx.item.findUnique({
              where: { id: item.itemId },
              select: { id: true, name: true, qtyOnHand: true, unitOfMeasure: true },
            });
            if (stockItem) {
              if (!materialHeaderAdded) {
                bomNotes += `\n[RINCIAN KEBUTUHAN MATERIAL & CEK STOK]\n`;
                materialHeaderAdded = true;
              }
              const isShortage = Number(stockItem.qtyOnHand) < item.qty;
              bomNotes += `- ${stockItem.name}: Butuh ${item.qty} ${stockItem.unitOfMeasure ?? "PCS"} | Stok Saat Ini: ${stockItem.qtyOnHand} ${stockItem.unitOfMeasure ?? "PCS"} ${isShortage ? "(Stok Kurang!)" : "(Cukup)"}\n`;
            } else if (item.itemName.trim() !== "") {
              serviceList += `- ${item.itemName} (Volume/Qty: ${item.qty})\n`;
            }
          } else if (item.itemName.trim() !== "") {
            // Pure service item (no itemId) — log as service
            serviceList += `- ${item.itemName} (Volume/Qty: ${item.qty})\n`;
          }
        }
      }

      if (serviceList !== "") {
        bomNotes += `\n[INSTRUKSI JASA / PENGERJAAN FISIK BENGKEL]\n${serviceList}`;
      }
    } catch (err) {
      console.error("Gagal men-generate catatan stok BOM:", err);
    }

    // ─── 1. Create Work Order ─────────────────────────────────────────
    const woDocNo = await generateDocumentNumber("WO");

    const workOrder = await tx.workOrder.create({
      data: {
        documentNo: woDocNo,
        quotationId: quotation.id,
        customerId: quotation.customerId,
        customerVehicleId: quotation.customerVehicleId,
        date: new Date(),
        status: WorkOrderStatus.PENDING,
        notes: bomNotes.trim(),
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

    // ─── 2. Create Project ───────────────────────────────────────────
    const projectDocNo = await generateDocumentNumber("PRJ");

    const project = await tx.project.create({
      data: {
        documentNo: projectDocNo,
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
        { projectId: project.id, name: "Persiapan", sortOrder: 1, status: Status.PENDING },
        { projectId: project.id, name: "Pengerjaan", sortOrder: 2, status: Status.PENDING },
        { projectId: project.id, name: "Quality Check", sortOrder: 3, status: Status.PENDING },
        { projectId: project.id, name: "Selesai", sortOrder: 4, status: Status.PENDING },
      ],
    });

    // ─── 3. Create Sales Order + Items ───────────────────────────────
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
        status: SalesStatus.CONFIRMED,
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
          total: item.subtotal,
        })),
      });
    }

    // ─── 4. Create Sales Invoice + Items ─────────────────────────────
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

    // Record the DP as a SalesPayment so later payment recalculation includes it
    // (recalc sums SalesPayment rows; without this, paidAmount would be overwritten
    // and the DP "lost"). No payment journal here — the cash was already journaled
    // at down-payment receipt (onDownPaymentReceived), so adding one would double cash.
    if (Number(dp.amount) > 0) {
      const payDocNo = await generateDocumentNumber("PAY");
      await tx.salesPayment.create({
        data: {
          documentNo: payDocNo,
          salesInvoiceId: invoice.id,
          customerId: quotation.customerId,
          amount: dp.amount,
          paymentDate: new Date(),
          paymentMethod: "down_payment",
          notes: `Uang muka dari DP ${dp.documentNo}`,
          createdBy: userId ?? null,
        },
      });
    }
    postedInvoiceId = invoice.id;

    // ─── 5. Update Down Payment status ───────────────────────────────
    await tx.downPayment.update({
      where: { id: dpId },
      data: {
        status: SalesStatus.CONFIRMED,
      },
    });

    // ─── 6. Update Quotation status → converted ─────────────────────
    await tx.quotation.update({
      where: { id: quotation.id },
      data: { status: SalesStatus.CONVERTED },
    });

    readyDocuments.push(
      { type: "WorkOrder", documentNo: workOrder.documentNo, context: `Dari DP ${dp.documentNo}` },
      { type: "SalesOrder", documentNo: salesOrder.documentNo, context: `Dari DP ${dp.documentNo}` },
      { type: "SalesInvoice", documentNo: invoice.documentNo, context: `Dari DP ${dp.documentNo}` },
    );
  });

  for (const doc of readyDocuments) {
    await notificationService.notifyDocumentReady(doc.type, doc.documentNo, doc.context)
  }

  // Recognize revenue + COGS + stock-out for the auto-generated invoice (it is
  // created already "posted", so trigger the posting hook once after commit).
  if (postedInvoiceId !== null) {
    await onSalesInvoicePosted(postedInvoiceId, userId)
  }
}
