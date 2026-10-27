import { prisma, TxClient } from "@/lib/db/prisma";
import { safeSum } from "@/lib/utils/math";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { salesInvoiceLabel } from "@/lib/utils/invoice-label";
import { commissionSnapshotForPaid } from "@/lib/services/commission-snapshot";
import { notificationService } from "@/lib/services/notification.service";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { stampWorkOrderFitmentSnapshot } from "@/lib/services/vehicle-fitment.service";
import { Status, WorkOrderStatus, SalesStatus } from "@/lib/constants";
import {
  computeInvoiceThresholdSen,
  resolveInvoiceThresholdPercent,
} from "@/lib/sales/invoice-threshold";
import {
  computeAllocationNet,
  snapshotFromDownPaymentRow,
} from "@/lib/tax/down-payment-vat";

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
  // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 4: gerbang dinilai SEKALI
  // di confirmDownPayment (hulu, atomik) — hook ini tidak menilai ulang.
  return onDownPaymentConfirmedInner(dpId, userId, txClient)
}

async function onDownPaymentConfirmedInner(
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
    // AUD-SAL-01: kecualikan invoice cancelled — DP baru tidak boleh
    // teralokasi ke dokumen batal (void menuntut payments kosong, jadi
    // invoice cancelled tak punya payment; DP yang masuk harus memicu
    // invoice pengganti, bukan menempel ke yang batal).
    const existingInv = await tx.salesInvoice.findFirst({
      where: { quotationId: quotation.id, status: { not: "cancelled" } },
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
        // AUD-R3-04 (putusan akuntan): PISAHKAN penerimaan kas dari alokasi.
        // Kas DP PENUH sudah dijurnal saat terima (Dr Kas / Cr 210102) — yang
        // dicatat di sini HANYA alokasi ke faktur, sebesar SISA faktur.
        // SalesPayment penuh + kredit selisih = double-count di laporan yang
        // menjumlah SalesPayment.amount sebagai pelunasan faktur.
        const prePaid = await tx.salesPayment.findMany({
          where: { salesInvoiceId: existingInv.id },
          select: { amount: true, withholdingAmount: true },
        });
        const prePaidSen = Math.round(safeSum(prePaid.map((p) => Number(p.amount) + Number(p.withholdingAmount ?? 0)), 2) * 100);
        const invGrandSen = Math.round(Number(existingInv.grandTotal ?? 0) * 100);
        const allocSen = Math.max(Math.min(Math.round(Number(dp.amount) * 100), invGrandSen - prePaidSen), 0);
        const payDocNo = await generateDocumentNumber("PAY");
        const allocPayment = await tx.salesPayment.create({
          data: {
            documentNo: payDocNo,
            salesInvoiceId: existingInv.id,
            customerId: quotation.customerId,
            amount: allocSen / 100,
            paymentDate: dp.paymentDate ?? new Date(),
            paymentMethod: "down_payment",
            notes: `${marker} (alokasi ${allocSen / 100} dari DP ${Number(dp.amount)}; sisa jadi kredit)`,
            createdBy: userId ?? null,
          },
        });

        // AUD-FIN-04 (putusan akuntan): alokasi DP lanjutan = reklas kewajiban
        // 210102 → piutang sebesar allocSen, DALAM tx sama. Kas PENUH sudah
        // dijurnal saat terima DP (onDownPaymentReceived: Dr Kas / Cr 210102)
        // — tanpa jurnal di sini AR tak turun + kewajiban tak lunas.
        // Idempoten: cek jurnal existing via referenceType/referenceId (pola
        // hook lain); zero-alloc (allocSen = 0) = tak ada jurnal.
        if (allocSen > 0) {
          const dpSettings = await tx.systemSetting.findFirst();
          const dpLiabilityId = (dpSettings as { customerDownPaymentAccountId?: number | null } | null)?.customerDownPaymentAccountId ?? null;
          const dpArId = (dpSettings as { salesReceivableAccountId?: number | null } | null)?.salesReceivableAccountId ?? null;
          if (!dpLiabilityId || !dpArId) {
            throw new Error(
              "Akun kewajiban UMP (210102) dan Piutang Usaha belum dikonfigurasi — alokasi DP lanjutan ditolak",
            );
          }
          const allocDate = dp.paymentDate ?? new Date();
          await assertPeriodOpen(allocDate, tx);
          const existingAllocJournal = await tx.journal.findFirst({
            where: { referenceType: "SalesPayment", referenceId: allocPayment.id },
          });
          if (!existingAllocJournal) {
            const allocJournalNo = await generateDocumentNumber("JRN");
            const allocAmount = allocSen / 100;
            // F-2026-10-25-004-V J-PL2: alokasi DP terutang = reklas NETO
            // PPN proporsional (snapshot DP beku). Kumulatif teralokasi
            // termasuk alokasi ini (prePaid + alloc) -> penutup menyerap
            // residu sen persis. DP non-kena / legacy (snapshot PPN 0)
            // memakai proporsional yang sama dan menghasilkan kaki lama
            // persis (net = bruto karena PPN snapshot nol).
            const dpSnapshot = snapshotFromDownPaymentRow(dp as never);
            const netAlloc = dpSnapshot
              ? computeAllocationNet({
                  allocAmount,
                  previouslyAllocated: prePaidSen / 100,
                  snapshot: dpSnapshot,
                  dpAmount: Number(dp.amount),
                })
              : { netAmount: allocAmount, ppnPortion: 0 };
            const dpTaxId = (dpSettings as { salesTaxAccountId?: number | null } | null)?.salesTaxAccountId ?? null;
            if (netAlloc.ppnPortion > 0 && !dpTaxId) {
              throw new Error(
                "Akun PPN Keluaran (210201) belum dikonfigurasi — alokasi DP terutang ditolak",
              );
            }
            const allocEntries: { accountId: number; debit: number; credit: number; memo: string }[] = [
              { accountId: dpLiabilityId, debit: allocAmount, credit: 0, memo: "Alokasi kewajiban UMP" },
              { accountId: dpTaxId ?? 0, debit: 0, credit: netAlloc.ppnPortion, memo: "Reklas PPN uang muka alokasi" },
              { accountId: dpArId, debit: 0, credit: netAlloc.netAmount, memo: "Pelunasan piutang via uang muka" },
            ].filter((e) => e.debit > 0 || e.credit > 0);
            await tx.journal.create({
              data: {
                journalNumber: allocJournalNo,
                transactionDate: allocDate,
                referenceType: "SalesPayment",
                referenceId: allocPayment.id,
                description: `Alokasi DP ${dp.documentNo} ke faktur ${existingInv.documentNo ?? existingInv.id}`,
                type: "AUTO",
                status: "POSTED",
                totalDebit: allocAmount,
                totalCredit: allocAmount,
                createdBy: userId ?? null,
                entries: {
                  create: allocEntries,
                },
              },
            });
          }
        }

        // Recalculate invoice paid amount & status inside the same transaction
        const payments = await tx.salesPayment.findMany({
          where: { salesInvoiceId: existingInv.id },
          select: { amount: true, withholdingAmount: true },
        });
        
        // safeSum avoids JavaScript floating point drift (e.g. 0.1 + 0.7 = 0.7999999)
        // which would cause a fully paid invoice to stick at "partial" status.
        // AUD-R3-04: payment di atas = ALOKASI (<= sisa), jadi totalPaid tak
        // bisa > grandTotal. overSen = DP penuh - yang teralokasi → kredit.
        // paidBefore = prePaid (sebelum payment alokasi ini), BUKAN total - DP.
        const grandTotal = Number(existingInv.grandTotal ?? 0);
        const dpSen = Math.round(Number(dp.amount) * 100);
        const overSen = dpSen - allocSen;
        if (overSen > 0) {
          const overAmount = overSen / 100;
          const creditDocNo = await generateDocumentNumber("CC");
          const existingCredit = await tx.customerCredit.findFirst({
            where: { sourceType: "DownPayment", sourceId: dp.id },
          });
          if (!existingCredit) {
            await tx.customerCredit.create({
              data: {
                documentNo: creditDocNo,
                customerId: quotation.customerId,
                sourceType: "DownPayment",
                sourceId: dp.id,
                receivedAmount: overAmount,
                notes: `Kelebihan DP ${dp.documentNo} atas faktur ${existingInv.documentNo} (teralokasi ${allocSen / 100} dari DP ${dpSen / 100}). Bisa dipakai ulang / di-refund.`,
                createdBy: userId ?? null,
              },
            });
          }
        }
        // PPh dipotong pelanggan tetap melunasi piutang (parity sales-payment.hook:
        // total = amount + withholdingAmount). Basis sen integer agar tak drift.
        const totalPaidSen = Math.round(safeSum(payments.map((p) => Number(p.amount) + Number(p.withholdingAmount ?? 0)), 2) * 100);
        const totalPaid = Math.min(totalPaidSen / 100, grandTotal);

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

        // BLOCKER-1 F-036-S: transisi ke paid di jalur ini WAJIB membekukan
        // snapshot tarif komisi (resolver sama seperti recalcCore) — loader
        // rekap menyaring faktur lunas; tanpa snapshot faktur ini terlewat.
        const commissionSnapshot = await commissionSnapshotForPaid(
          tx,
          {
            id: existingInv.id,
            customerId: quotation.customerId,
            date: existingInv.date as Date,
            commissionRatePercent: existingInv.commissionRatePercent ?? null,
          },
          paymentStatus === "paid",
        )

        await tx.salesInvoice.update({
          where: { id: existingInv.id },
          data: { paidAmount: totalPaid, paymentStatus, ...commissionSnapshot },
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
    // TASK-011 BUG-01: dokumen pendamping dilengkapi SATU-SATU. Pola lama
    // `!existingWO && !existingSO` melewati KEDUA pembuatan bila salah satu
    // sudah ada (mis. SO draft dari convertQuotationToOrder tanpa WO), lalu
    // penjaga `!workOrder || !salesOrder` di bawah melempar dan seluruh
    // konfirmasi DP (termasuk jurnal kas) rollback permanen.

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
    if (!workOrder) {
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
    if (allItems.length > 0) {
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

    // F-2026-10-22-063-S: snapshot PERINGATAN fitment baris WO turunan.
    await stampWorkOrderFitmentSnapshot(tx, workOrder.id);

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

    } // end if (!workOrder): WO + Project dibuat bila WO belum ada

    // ─── 3. Create Sales Order + Items (bila SO belum ada) ────────────
    if (!salesOrder) {
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

    if (allItems.length > 0) {
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
    } // end if (!salesOrder): SO dibuat bila SO belum ada

    // Di titik ini WO+SO pasti ada (dibuat di atas atau pre-existing).
    // Bila keduanya null berarti state parsial yang tak dikenal — gagal keras
    // daripada menulis invoice yatim tanpa dokumen kerja.
    if (!workOrder || !salesOrder) {
      throw new Error("Dokumen kerja (WO/SO) tidak ditemukan untuk quotation ini.")
    }

    // ─── 4. Create Sales Invoice + Items ─────────────────────────────
    // P0-1 + F-2026-10-22-065-S: invoice konversi DP dibuat SEKALI, hanya
    // bila total DP terverifikasi (CONFIRMED, bukan draft/cancelled)
    // mencapai ambang persen snapshot quotation (default fail-closed 50%)
    // — dihitung Decimal-safe (sen), bukan float. Ambang dibaca dari
    // snapshot Quotation.invoiceThresholdPercent, BUKAN master kategori
    // berjalan (AC-DP65-1/4). Invoice lahir sebagai DRAFT: pembuatan ≠
    // posting; stock-out + revenue/COGS terjadi saat posting manual lewat
    // postInvoice (vonis BOT 4 F-2026-10-22-073-V penjaga 3a).
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
    // Ambang efektif dari snapshot persen quotation, dibulatkan KE ATAS ke
    // sen: 50% dari Rp1 → Rp0,50. Snapshot korup fail-closed ke 50 + log
    // (AC-DP65-5); snapshot kosong diam (quotation lama, BR-DP65-02).
    const thresholdPercent = resolveInvoiceThresholdPercent(
      quotation.invoiceThresholdPercent == null ? null : Number(quotation.invoiceThresholdPercent),
      (raw) => console.error(`[down-payment] persen ambang invoice korup quotation ${quotation.id}: ${String(raw)} — fail-closed 50%`),
    )
    const thresholdSen = computeInvoiceThresholdSen(grandTotalSen, thresholdPercent)

    let invoice: { id: number; documentNo: string | null } | null = null
    if (totalVerifiedSen >= thresholdSen && salesOrder) {
    // K5: faktur otomatis dari DP lahir draft tanpa nomor; nomor resmi
    // diterbitkan saat posting (postInvoice di sales.actions).
    const invoiceCreatedAt = new Date()
    const created = await tx.salesInvoice.create({
      data: {
        documentNo: null,
        customerId: quotation.customerId,
        salesOrderId: salesOrder.id,
        quotationId: quotation.id,
        date: invoiceCreatedAt,
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
    invoice = { id: created.id, documentNo: created.documentNo }

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
    const createdSen = Math.round(Number(quotation.grandTotal) * 100)
    // TASK-011 BUG-02: alokasi awal WAJIB jurnal reklas Dr 210102 / Cr
    // Piutang per DP (pola sama jalur faktur-sudah-ada AUD-FIN-04 di atas).
    // Tanpa ini GL Piutang overstated dan kewajiban 210102 tak pernah lunas
    // walau subledger menyatakan faktur (sebagian) lunas. Akun dipetakan
    // sekali dari systemSetting yang sama; belum terpetakan = fail-closed.
    let allocAccounts: { liabilityId: number; arId: number } | null = null
    let allocatedSen = 0
    for (const vdp of verifiedForAllocation) {
      const vmarker = `Uang muka dari DP ${vdp.documentNo}`
      if ([...allocatedMarkers].some((n) => n.includes(vmarker))) continue
      if (Number(vdp.amount) <= 0) continue
      const payDocNo = await generateDocumentNumber("PAY");
      const allocPayment = await tx.salesPayment.create({
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
      const vdpSen = Math.round(Number(vdp.amount) * 100)
      // Porsi yang benar-benar melunasi faktur ini (kelebihan di atas
      // grandTotal menjadi kredit pelanggan di bawah, bukan reklas).
      const journalSen = Math.max(Math.min(vdpSen, createdSen - allocatedSen), 0)
      allocatedSen += vdpSen
      if (journalSen > 0) {
        if (!allocAccounts) {
          const dpSettings = await tx.systemSetting.findFirst();
          const liabilityId = (dpSettings as { customerDownPaymentAccountId?: number | null } | null)?.customerDownPaymentAccountId ?? null;
          const arId = (dpSettings as { salesReceivableAccountId?: number | null } | null)?.salesReceivableAccountId ?? null;
          if (!liabilityId || !arId) {
            throw new Error(
              "Akun kewajiban UMP (210102) dan Piutang Usaha belum dikonfigurasi — alokasi DP awal ditolak",
            );
          }
          allocAccounts = { liabilityId, arId }
        }
        const allocDate = vdp.paymentDate ?? new Date();
        await assertPeriodOpen(allocDate, tx);
        const existingAllocJournal = await tx.journal.findFirst({
          where: { referenceType: "SalesPayment", referenceId: allocPayment.id },
        });
        if (!existingAllocJournal) {
          const allocJournalNo = await generateDocumentNumber("JRN");
          const allocAmount = journalSen / 100;
          await tx.journal.create({
            data: {
              journalNumber: allocJournalNo,
              transactionDate: allocDate,
              referenceType: "SalesPayment",
              referenceId: allocPayment.id,
              description: `Alokasi DP ${vdp.documentNo} ke faktur ${created.documentNo ?? created.id}`,
              type: "AUTO",
              status: "POSTED",
              totalDebit: allocAmount,
              totalCredit: allocAmount,
              createdBy: userId ?? null,
              entries: {
                create: [
                  { accountId: allocAccounts.liabilityId, debit: allocAmount, credit: 0, memo: "Alokasi kewajiban UMP" },
                  { accountId: allocAccounts.arId, debit: 0, credit: allocAmount, memo: "Pelunasan piutang via uang muka" },
                ],
              },
            },
          });
        }
      }
    }
    // AUD-FIN-02 (putusan akuntan): KELEBIHAN DP = KREDIT PELANGGAN
    // terstruktur (customer_credits), BUKAN pelunasan, BUKAN catatan teks.
    // paidAmount dibatasi grandTotal (tak boleh overstate); selisih masuk
    // ledger per DP sumber. Idempoten: satu baris per quotation (sourceType
    // Quotation + sourceId), retry hanya menambah bila selisih bertambah.
    // Jurnal nol-net di kewajiban 210102 (reklas antar subledger pelanggan):
    // kas SUDAH masuk saat terima DP — jurnal di sini ganda bila Dr. Kas.
    const overSen = allocatedSen - createdSen
    if (overSen > 0) {
      const overAmount = overSen / 100
      const creditDocNo = await generateDocumentNumber("CC")
      await tx.customerCredit.create({
        data: {
          documentNo: creditDocNo,
          customerId: quotation.customerId,
          sourceType: "Quotation",
          sourceId: quotation.id,
          receivedAmount: overAmount,
          notes: `Kelebihan DP atas quotation ${quotation.documentNo} (teralokasi ${allocatedSen / 100} > grandTotal ${createdSen / 100}). Bisa dipakai ulang / di-refund.`,
          createdBy: userId ?? null,
        },
      })
      await tx.salesInvoice.update({
        where: { id: created.id },
        data: {
          notes: `Otomatis dibuat dari DP ${dp.documentNo}. KELEBIHAN DP ${overAmount} dicatat sebagai kredit pelanggan ${creditDocNo} — bukan pelunasan.`,
        },
      })
    }
    // TIDAK ada onSalesInvoicePosted di sini: invoice konversi lahir draft;
    // revenue/COGS/stock-out terjadi saat posting manual (postInvoice).
    // WO/SO/Project di atas tetap dibuat agar kerja bengkel bisa mulai
    // tanpa menunggu ambang 50% (keputusan bisnis #7).
    // paidAmount DIBATASI grandTotal — kelebihan sudah pindah ke ledger
    // (di atas), jadi paidAmount > grandTotal = overstate AR + double-count
    // (sekali di paidAmount, sekali di kredit). Cap di sini = satu sumber.
    // BLOCKER-1 F-036-S: faktur konversi yang lahir langsung lunas WAJIB
    // membawa snapshot tarif komisi sejak tulis ini (resolver sama seperti
    // recalcCore, per tanggal faktur = tanggal lahir faktur di sini).
    const allocatedTotal = Math.min(allocatedSen / 100, Number(quotation.grandTotal))
    const conversionGoingPaid = allocatedTotal >= Number(quotation.grandTotal)
    const commissionSnapshot = await commissionSnapshotForPaid(
      tx,
      { id: created.id, customerId: quotation.customerId, date: invoiceCreatedAt, commissionRatePercent: null },
      conversionGoingPaid,
    )
    await tx.salesInvoice.update({
      where: { id: created.id },
      data: {
        paidAmount: allocatedTotal,
        paymentStatus: conversionGoingPaid ? "paid" : "partial",
        ...commissionSnapshot,
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
        ? [{ type: "SalesInvoice" as const, documentNo: salesInvoiceLabel(invoice), context: `Dari DP ${dp.documentNo}` }]
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
