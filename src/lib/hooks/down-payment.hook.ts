import { prisma, TxClient } from "@/lib/db/prisma";
import { safeSum } from "@/lib/utils/math";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { notificationService } from "@/lib/services/notification.service";
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
    // P0-2 (review): retry TIDAK boleh memanggil onSalesInvoicePosted tanpa
    // gate. Posting resmi (postInvoice) menegakkan izin + approval +
    // period-lock; hook retry tak punya ketiganya. Retry hanya melengkapi
    // alokasi DP yang terlewat (lihat existingInv di atas) — bukan posting.
    if (dp.status === SalesStatus.CONFIRMED) {
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

    // P0-1: DP lanjutan tanpa invoice (ambang 50% belum tercapai saat DP
    // sebelumnya): tandai CONFIRMED dulu agar kumulatif termasuk DP ini,
    // lalu JATUH ke alur pembuatan di bawah — bukan return — supaya invoice
    // lahir tepat saat ambang tercapai oleh DP ini. WO/SO/Project tetap
    // dibuat sekali (dilewati bila sudah ada).
    if (!existingInv) {
      await tx.downPayment.update({
        where: { id: dpId },
        data: { status: SalesStatus.CONFIRMED },
      });
    }

    if (existingInv) {
      // P0-1 (review): DP lanjutan hanya boleh menambah SalesPayment untuk DP
      // INI — dan idempoten: DP yang sama di-retry tidak boleh membuat baris
      // kedua. Penandanya = notes berisi nomor dokumen DP (relasi otoritatif
      // DP→payment belum ada di skema; cocok amount/tanggal rapuh).
      const marker = `Uang muka dari DP ${dp.documentNo}`
      const alreadyAllocated = await tx.salesPayment.findFirst({
        where: { salesInvoiceId: existingInv.id, notes: { contains: marker } },
      })
      // Create SalesPayment for this subsequent DP linked to the existing invoice
      if (Number(dp.amount) > 0 && !alreadyAllocated) {
        const payDocNo = await generateDocumentNumber("PAY");
        await tx.salesPayment.create({
          data: {
            documentNo: payDocNo,
            salesInvoiceId: existingInv.id,
            customerId: quotation.customerId,
            amount: dp.amount,
            paymentDate: dp.paymentDate ?? new Date(),
            paymentMethod: "down_payment",
            notes: marker,
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

        // P0-2 (review): status DOKUMEN bukan status BAYAR. DP confirmation
        // hanya boleh menyentuh paymentStatus; status lifecycle (draft /
        // posted / approved) milik jalur posting resmi (postInvoice +
        // gate izin/approval/period-lock). Tanpa ini, faktur draft berubah
        // "posted" tanpa posting — stok-out + revenue/COGS lewat tanpa gate.
        let paymentStatus: "posted" | "partial" | "paid" = existingInv.paymentStatus as "posted" | "partial" | "paid";
        if (totalPaid >= grandTotal) {
          paymentStatus = "paid";
        } else if (totalPaid > 0) {
          paymentStatus = "partial";
        }

        await tx.salesInvoice.update({
          where: { id: existingInv.id },
          data: { paidAmount: totalPaid, paymentStatus },
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

    // Jalur pembuatan: WO/SO/Project dibuat SEKALI (dilewati bila sudah ada
    // dari DP sebelumnya); invoice dievaluasi ambang 50% setiap kali.
    const existingWO = await tx.workOrder.findFirst({
      where: { quotationId: quotation.id },
    });
    const existingSO = await tx.salesOrder.findFirst({
      where: { quotationId: quotation.id },
    });
    const needWorkDocs = !existingWO && !existingSO;

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
      // Paritas #8: catatan kekurangan stok adalah bagian deliverable hook ini.
      // Senyap di sini membuat WO terbit dengan info stok/BOM bolong tanpa ada
      // yang tahu — tandai di catatan WO supaya terlihat saat diperiksa.
      bomNotes += "\n[PERINGATAN] Catatan stok/BOM gagal dibuat otomatis — periksa ketersediaan material secara manual.\n";
    }

    // ─── 1-3. Work Order + Project + Sales Order (SEKALI per quotation) ──
    // Dilewati bila sudah ada dari DP sebelumnya; invoice di bawah tetap
    // dievaluasi ambang setiap kali.
    let workOrder = existingWO
    let salesOrder = existingSO
    if (needWorkDocs) {
    // ─── 1. Create Work Order ─────────────────────────────────────────
    const woDocNo = await generateDocumentNumber("WO");

    workOrder = await tx.workOrder.create({
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
    if (allItems.length > 0 && needWorkDocs) {
      await tx.workOrderItem.createMany({
        data: allItems
          .filter((item) => item.itemId !== null || (item.itemName && item.itemName.trim() !== ""))
          .map((item) => ({
            workOrderId: workOrder!.id,
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

    salesOrder = await tx.salesOrder.create({
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

    if (allItems.length > 0 && needWorkDocs) {
      await tx.salesOrderItem.createMany({
        data: allItems.map((item) => ({
          salesOrderId: salesOrder!.id,
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount,
          total: item.subtotal,
        })),
      });
    }
    } // end if (needWorkDocs): WO/Project/SO dibuat sekali

    // Di titik ini WO+SO pasti ada (dibuat di atas atau pre-existing).
    // Bila keduanya null berarti state parsial yang tak dikenal — gagal keras
    // daripada menulis invoice yatim tanpa dokumen kerja.
    if (!workOrder || !salesOrder) {
      throw new Error("Dokumen kerja (WO/SO) tidak ditemukan untuk quotation ini.")
    }

    // ─── 4. Create Sales Invoice + Items ─────────────────────────────
    // P0-1: invoice konversi DP dibuat SEKALI, hanya bila total DP
    // terverifikasi (CONFIRMED, bukan draft/cancelled) mencapai minimal 50%
    // dari nilai quotation — dihitung Decimal-safe (sen), bukan float.
    // Invoice lahir sebagai DRAFT: pembuatan ≠ posting; stock-out +
    // revenue/COGS terjadi saat posting manual lewat postInvoice.
    const verifiedDPs = await tx.downPayment.findMany({
      where: { quotationId: quotation.id, status: SalesStatus.CONFIRMED },
      select: { amount: true },
    })
    // Decimal(15,2) → sen integer: drift float (0.1+0.7) tak bisa lewat.
    const totalVerifiedSen = verifiedDPs.reduce(
      (sum, d) => sum + Math.round(Number(d.amount) * 100),
      0,
    )
    const grandTotalSen = Math.round(Number(quotation.grandTotal) * 100)
    // Ambang 50% dibulatkan KE ATAS ke sen: 50% dari Rp1 → Rp0,50.
    const thresholdSen = Math.ceil(grandTotalSen / 2)

    let invoice: { id: number; documentNo: string } | null = null
    if (totalVerifiedSen >= thresholdSen && salesOrder) {
    const invDocNo = await generateDocumentNumber("INV");

    const created = await tx.salesInvoice.create({
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
        paidAmount: 0,
        status: "draft",
        paymentStatus: "partial",
        notes: `Otomatis dibuat dari DP ${dp.documentNo}`,
        createdBy: userId ?? null,
      },
    });
    invoice = created

    if (allItems.length > 0) {
      await tx.salesInvoiceItem.createMany({
        data: allItems.map((item) => ({
          salesInvoiceId: created.id,
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
    // P0-1 (review): alokasi SEMUA verified DP yang belum teralokasi — bukan
    // cuma DP pemicu. Skenario: DP1 300 confirmed (di bawah ambang), DP2 200
    // confirmed → ambang tercapai → invoice lahir. Tanpa loop ini, 300 milik
    // DP1 hilang dari paidAmount dan AR overstate selamanya. Idempoten via
    // marker notes per nomor DP (retry aman; kelebihan di atas grandTotal
    // dicatat di notes, bukan dialokasi diam-diam).
    const allocatedMarkers = new Set(
      (
        await tx.salesPayment.findMany({
          where: { salesInvoiceId: created.id },
          select: { notes: true },
        })
      ).map((p) => p.notes ?? ""),
    )
    const verifiedForAllocation = await tx.downPayment.findMany({
      where: { quotationId: quotation.id, status: SalesStatus.CONFIRMED },
    })
    let allocatedSen = 0
    for (const vdp of verifiedForAllocation) {
      const vmarker = `Uang muka dari DP ${vdp.documentNo}`
      if ([...allocatedMarkers].some((n) => n.includes(vmarker))) continue
      if (Number(vdp.amount) <= 0) continue
      const payDocNo = await generateDocumentNumber("PAY");
      await tx.salesPayment.create({
        data: {
          documentNo: payDocNo,
          salesInvoiceId: created.id,
          customerId: quotation.customerId,
          amount: vdp.amount,
          paymentDate: vdp.paymentDate ?? new Date(),
          paymentMethod: "down_payment",
          notes: vmarker,
          createdBy: userId ?? null,
        },
      });
      allocatedSen += Math.round(Number(vdp.amount) * 100)
    }
    const createdSen = Math.round(Number(quotation.grandTotal) * 100)
    if (allocatedSen > createdSen) {
      await tx.salesInvoice.update({
        where: { id: created.id },
        data: {
          notes: `Otomatis dibuat dari DP ${dp.documentNo}. KELEBIHAN DP: teralokasi ${allocatedSen / 100} melebihi grandTotal ${createdSen / 100} — selisih menjadi kredit pelanggan, bukan pelunasan.`,
        },
      })
    }
    // TIDAK ada onSalesInvoicePosted di sini: invoice konversi lahir draft;
    // revenue/COGS/stock-out terjadi saat posting manual (postInvoice).
    // WO/SO/Project di atas tetap dibuat agar kerja bengkel bisa mulai
    // tanpa menunggu ambang 50% (keputusan bisnis #7).
    // paidAmount = total teralokasi (semua verified DP), bukan cuma DP pemicu.
    const allocatedTotal = allocatedSen / 100
    await tx.salesInvoice.update({
      where: { id: created.id },
      data: {
        paidAmount: allocatedTotal,
        paymentStatus: allocatedTotal >= Number(quotation.grandTotal) ? "paid" : "partial",
      },
    })
    }

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
          description: invoice
            ? `Penawaran dikonversi menjadi Pesanan Penjualan (${salesOrder.documentNo}), Perintah Kerja (${workOrder.documentNo}), dan Faktur (${invoice.documentNo})`
            : `Penawaran mulai dikerjakan: Pesanan Penjualan (${salesOrder.documentNo}), Perintah Kerja (${workOrder.documentNo}). Faktur menyusul saat DP terverifikasi mencapai 50%.`,
          userId: userId ?? null,
        }
      });
    }

    readyDocuments.push(
      { type: "WorkOrder", documentNo: workOrder.documentNo, context: `Dari DP ${dp.documentNo}` },
      { type: "SalesOrder", documentNo: salesOrder.documentNo, context: `Dari DP ${dp.documentNo}` },
      ...(invoice
        ? [{ type: "SalesInvoice" as const, documentNo: invoice.documentNo, context: `Dari DP ${dp.documentNo}` }]
        : []),
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
