import { prisma, TxClient } from "@/lib/db/prisma";
import { safeSum } from "@/lib/utils/math";
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
  userId?: number,
  txClient?: TxClient
): Promise<void> {
  const readyDocuments: Array<{ type: "WorkOrder" | "SalesOrder" | "SalesInvoice"; documentNo: string; context: string }> = []

  const execute = async (tx: TxClient) => {
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

    // Also lock the QUOTATION row. The DP row lock above only serializes
    // confirms of the SAME down payment; a quotation may have multiple DPs
    // (createDownPayment allows cumulative DPs), so two different DPs on the
    // same quotation confirmed concurrently would both pass the
    // existingWO/SO/Invoice idempotency checks below and double-create the
    // documents (+ double revenue/COGS/stock-out). Locking the quotation makes
    // that check-then-create atomic per quotation. Lock order is dp -> quotation;
    // convertQuotationToOrder locks the quotation only, so there is no cycle.
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${dp.quotationId} FOR UPDATE`;

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
      if (orphanInv) {
        await onSalesInvoicePosted(orphanInv.id, userId, tx);
      }
      return;
    }

    const quotation = dp.quotation;
    if (!quotation) {
      throw new Error("Quotation tidak ditemukan untuk Down Payment ini.");
    }

    if (
      quotation.status !== SalesStatus.ACCEPTED &&
      quotation.status !== SalesStatus.CONVERTED &&
      quotation.status !== SalesStatus.APPROVED
    ) {
      throw new Error("Quotation belum di-accept.");
    }

    // ─── Multi-DP & Idempotency Check ─────────────────────────────────
    // If the invoice already exists, this quotation has already been converted
    // (e.g. by a previous DP). This is a subsequent down payment.
    const existingInv = await tx.salesInvoice.findFirst({
      where: { quotationId: quotation.id },
    });

    if (existingInv) {
      // Create SalesPayment for this subsequent DP linked to the existing invoice
      if (Number(dp.amount) > 0) {
        const payDocNo = await generateDocumentNumber("PAY");
        await tx.salesPayment.create({
          data: {
            documentNo: payDocNo,
            salesInvoiceId: existingInv.id,
            customerId: quotation.customerId,
            amount: dp.amount,
            paymentDate: new Date(),
            paymentMethod: "down_payment",
            notes: `Uang muka dari DP ${dp.documentNo}`,
            createdBy: userId ?? null,
          },
        });

        // Recalculate invoice paid amount & status inside the same transaction
        const payments = await tx.salesPayment.findMany({
          where: { salesInvoiceId: existingInv.id },
          select: { amount: true },
        });
        
        // safeSum avoids JavaScript floating point drift (e.g. 0.1 + 0.7 = 0.7999999)
        // which would cause a fully paid invoice to stick at "partial" status.
        const totalPaid = safeSum(payments.map((p) => p.amount), 2);
        const grandTotal = Number(existingInv.grandTotal ?? 0);
        
        let invStatus: "posted" | "partial" | "paid" = "posted";
        let paymentStatus: "posted" | "partial" | "paid" = "posted";
        if (totalPaid >= grandTotal) {
          invStatus = "paid";
          paymentStatus = "paid";
        } else if (totalPaid > 0) {
          invStatus = "partial";
          paymentStatus = "partial";
        }

        await tx.salesInvoice.update({
          where: { id: existingInv.id },
          data: { paidAmount: totalPaid, status: invStatus, paymentStatus },
        });
      }

      // Mark this DP as confirmed
      await tx.downPayment.update({
        where: { id: dpId },
        data: { status: SalesStatus.CONFIRMED },
      });

      if (tx.quotationHistory) {
        await tx.quotationHistory.create({
          data: {
            quotationId: quotation.id,
            action: "down_payment",
            description: `Pembayaran uang muka DP ${dp.documentNo} diterima sebesar ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(dp.amount))}`,
            userId: userId ?? null,
          }
        });
      }

      return; // Stop here; do not re-create WO/SO/Invoice!
    }

    // Otherwise, this is the FIRST DP: we need to create the WO/SO/Invoice.
    // Idempotency: skip silently if WO/SO already exist without an invoice (shouldn't happen, but guards against partial state).
    const existingWO = await tx.workOrder.findFirst({
      where: { quotationId: quotation.id },
    });
    if (existingWO) return;
    const existingSO = await tx.salesOrder.findFirst({
      where: { quotationId: quotation.id },
    });
    if (existingSO) return;

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

    // ─── Project Info ───────────────────────────────────────────────────
    let bomNotes = `Otomatis dibuat dari DP ${dp.documentNo}\n`;
    let serviceList = "";
    let materialHeaderAdded = false;

    try {
      // Look up project info from quotation
      const project = quotation.projectId
        ? await tx.project.findUnique({ where: { id: quotation.projectId }, select: { name: true, startDate: true, endDate: true } })
        : null;
      const projectName = project?.name ?? "-";
      const customerName = quotation.customer?.name ?? "-";
      const fmtDate = (d: Date | null) => !d ? "-" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

      bomNotes += `\n[INFORMASI PROYEK]\n`;
      bomNotes += `Nama Proyek  : ${projectName}\n`;
      bomNotes += `Pelanggan    : ${customerName}\n`;
      bomNotes += `Tanggal Mulai: ${fmtDate(project?.startDate ?? null)}\n`;
      bomNotes += `Tanggal Selesai: ${fmtDate(project?.endDate ?? null)}\n`;

      const validItemNames = Array.from(
        new Set(
          allItems
            .map((i) => i.itemName.trim())
            .filter((n) => n.length > 0)
        )
      );

      // OR-contains on every distinct item name. We pick the first matching
      // product per line below — same semantics as the old per-line
      // product.findFirst({ name: { contains: item.itemName } }).
      // Also fetch by code pattern (descriptions often contain "[PRD-0001] OKE").
      const matchedProducts = validItemNames.length === 0
        ? []
        : await tx.product.findMany({
            include: { materials: true },
          });
      const productByName = new Map<string, typeof matchedProducts[number] | null>();
      for (const n of validItemNames) {
        const nl = n.toLowerCase();
        productByName.set(
          n,
          matchedProducts.find((p) => {
            const pName = p.name.toLowerCase();
            const pCode = (p.code ?? "").toLowerCase();
            // Bidirectional: description contains product name/code, OR product name contains description
            return nl.includes(pName) || nl.includes(pCode) || pName.includes(nl);
          }) ?? null
        );
      }

      // Pre-collect every itemId we will need: BOM material itemIds + non-BOM
      // direct itemIds. One findMany feeds both the material block and the
      // non-BOM block below.
      const neededItemIds = new Set<number>();
      for (const item of allItems) {
        if (item.itemId !== null) neededItemIds.add(item.itemId);
      }
      for (const p of matchedProducts) {
        for (const m of p.materials) neededItemIds.add(m.itemId);
      }
      const stockItems =
        neededItemIds.size === 0
          ? []
          : await tx.item.findMany({
              where: { id: { in: Array.from(neededItemIds) } },
              select: { id: true, name: true, qtyOnHand: true, unitOfMeasure: true, minStock: true },
            });
      const stockById = new Map(stockItems.map((s) => [s.id, s]));

      // Pass 2: render notes using the pre-fetched maps. Zero DB round-trips.
      bomNotes += `\n[DAFTAR ITEM PERINTAH KERJA]\n`;

      for (const item of allItems) {
        // Cari produk BOM berdasarkan nama item/deskripsi quotation. Lewati jika
        // nama kosong — `contains: ""` akan cocok dengan produk pertama mana pun
        // dan menghasilkan catatan BOM yang salah.
        const matchedProduct = item.itemName.trim() === ""
          ? null
          : productByName.get(item.itemName.trim()) ?? null;

        if (matchedProduct && matchedProduct.materials.length > 0) {
          // BOM product — show bullet + material breakdown
          if (!materialHeaderAdded) {
            materialHeaderAdded = true;
          }
          bomNotes += `\n● ${item.itemName} (Qty: ${item.qty})\n`;
          bomNotes += `  Breakdown Material:\n`;

          matchedProduct.materials.forEach(mat => {
            const dbItem = stockById.get(mat.itemId);
            const qtyNeeded = Number(mat.qty) * item.qty;
            const stock = dbItem ? Number(dbItem.qtyOnHand) : 0;
            const uom = dbItem ? dbItem.unitOfMeasure : "PCS";
            const minStock = dbItem ? Number(dbItem.minStock) : 0;

            let statusLabel: string;
            if (stock <= 0) {
              statusLabel = "Habis";
            } else if (stock < qtyNeeded || stock <= minStock) {
              statusLabel = `Tinggal sedikit (Stok: ${stock} ${uom})`;
            } else {
              statusLabel = `Stok ada (Stok: ${stock} ${uom})`;
            }

            bomNotes += `  - ${dbItem?.name || `Item #${mat.itemId}`}: Butuh ${qtyNeeded} ${uom} → ${statusLabel}\n`;
          });
        } else if (item.itemId !== null) {
          // Direct item (non-BOM) — check stock
          const stockItem = stockById.get(item.itemId);
          if (stockItem) {
            const stock = Number(stockItem.qtyOnHand);
            const uom = stockItem.unitOfMeasure ?? "PCS";
            const minStockVal = Number(stockItem.minStock);

            let statusLabel: string;
            if (stock <= 0) {
              statusLabel = "Habis";
            } else if (stock < item.qty || stock <= minStockVal) {
              statusLabel = `Tinggal sedikit (Stok: ${stock} ${uom})`;
            } else {
              statusLabel = `Stok ada (Stok: ${stock} ${uom})`;
            }

            bomNotes += `- ${stockItem.name}: Butuh ${item.qty} ${uom} → ${statusLabel}\n`;
          } else if (item.itemName.trim() !== "") {
            serviceList += `- ${item.itemName} (Volume/Qty: ${item.qty})\n`;
          }
        } else if (item.itemName.trim() !== "") {
          // Pure service item (no itemId) — log as service
          serviceList += `- ${item.itemName} (Volume/Qty: ${item.qty})\n`;
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

    // Create Work Order Items — include BOM/custom items (itemId=null) with
    // description so they appear in the WO items table.
    if (allItems.length > 0) {
      await tx.workOrderItem.createMany({
        data: allItems
          .filter((item) => item.itemId !== null || (item.itemName && item.itemName.trim() !== ""))
          .map((item) => ({
            workOrderId: workOrder.id,
            itemId: item.itemId ?? 0,
            qty: item.qty,
            cost: item.unitPrice,
            description: item.itemName || null,
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
        notes: `Otomatis dibuat dari DP ${dp.documentNo}. Quotation: ${quotation.documentNo}`,
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
        notes: `Otomatis dibuat dari DP ${dp.documentNo}`,
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
        notes: `Otomatis dibuat dari DP ${dp.documentNo}`,
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
    // Recognize revenue + COGS + stock-out for the auto-generated invoice (it is
    // created already "posted", so trigger the posting hook inside the transaction).
    await onSalesInvoicePosted(invoice.id, userId, tx);

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

    if (tx.quotationHistory) {
      await tx.quotationHistory.create({
        data: {
          quotationId: quotation.id,
          action: "down_payment",
          description: `Pembayaran uang muka DP ${dp.documentNo} diterima sebesar ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(dp.amount))}`,
          userId: userId ?? null,
        }
      });

      await tx.quotationHistory.create({
        data: {
          quotationId: quotation.id,
          action: "converted",
          description: `Penawaran dikonversi menjadi Pesanan Penjualan (${salesOrder.documentNo}), Perintah Kerja (${workOrder.documentNo}), dan Faktur (${invoice.documentNo})`,
          userId: userId ?? null,
        }
      });
    }

    readyDocuments.push(
      { type: "WorkOrder", documentNo: workOrder.documentNo, context: `Dari DP ${dp.documentNo}` },
      { type: "SalesOrder", documentNo: salesOrder.documentNo, context: `Dari DP ${dp.documentNo}` },
      { type: "SalesInvoice", documentNo: invoice.documentNo, context: `Dari DP ${dp.documentNo}` },
    );
  };

  if (txClient) {
    await execute(txClient);
  } else {
    await prisma.$transaction(execute);
  }

  // Batch the ready-document notifications: a single admin lookup + a single
  // createMany, instead of one (admin findMany + notification createMany) per
  // document. readyDocuments holds up to 3 entries (WO/SO/Invoice).
  if (readyDocuments.length > 0) {
    await notificationService.notifyDocumentsReadyBatch(readyDocuments)
  }

}
