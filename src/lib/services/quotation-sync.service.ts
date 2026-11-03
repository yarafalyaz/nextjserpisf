 
import { Prisma, SalesInvoiceStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import {
  assessCreditGateInTx,
  assertCreditGatePassed,
  consumeApprovedCreditOverrideInTx,
} from '@/lib/services/credit-gate.service'
import { quotationHasRealSettlement, hasRealSettlement } from '@/lib/services/sales-settlement.service'

interface QuotationItem {
  itemId: number | null
  qty: number
  unitPrice: number
  discount: number
  total: number
  description?: string | null
  uom?: string | null
}

function flattenQuotationItems(sections: { items: any[] }[]): QuotationItem[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      itemId: item.itemId,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount ?? 0),
      total: Number(item.total ?? Number(item.qty) * Number(item.unitPrice) - Number(item.discount ?? 0)),
      description: item.description ?? null,
      uom: item.uom ?? null,
    }))
  )
}

/**
 * Re-sync linked SO/Invoice items when a quotation is edited.
 *
 * GL-BR-003 K1 (AC-GL-005): dokumen posted/final immutable. Resync hanya
 * menyentuh SO DRAFT dan faktur DRAFT dalam satu tx terkunci. SO/faktur
 * posted/final (sent/confirmed/processing/partial/posted/paid) atau
 * berpelunasan nyata DILEWATI — koreksi sah lewat retur/void, bukan
 * tulis-ulang resync. Pemanggil updateQuotation/reviseQuotation sudah
 * mengunci edit di hulu (settlement guard); guard di sini lapis fail-closed.
 */
export async function resyncOnEdit(quotationId: number, userId: number | null = null): Promise<void> {
  // K4: kunci + baca-ulang quotation DALAM tx (TOCTOU). Baca luar dihapus:
  // pemanggil bisa diam-diam dibalik status quotation pesaing di antara baca
  // dan resync.
  await prisma.$transaction(async (tx) => {
    // K4: kunci baris quotation (TOCTOU) — baca status diputus dari baris
    // terkunci dalam tx yang sama.
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`
    const quotation = await tx.quotation.findUnique({
      where: { id: quotationId },
      include: { sections: { include: { items: true } } },
    })
    if (!quotation) return
    if (quotation.status === 'cancelled') return
    // Never propagate changes once the customer has really paid.
    if (await quotationHasRealSettlement(quotationId, tx)) return

    const items = flattenQuotationItems(quotation.sections)
    // R6IE-07: baris faktur membawa snapshot jenis jasa/barang — ekspor
    // Coretax membaca kolom ini, bukan Item.isService berjalan. Resync
    // menulis ulang seluruh baris, jadi snapshot wajib dibekukan ulang di
    // sini; tanpa itu edit penawaran mengosongkan isService dan ekspor pajak
    // menolak faktur tersebut selamanya. Baris tanpa itemId tetap null.
    const syncItemIds = [...new Set(items.map((i) => i.itemId).filter((id): id is number => id != null))]
    const isServiceById = new Map<number, boolean>()
    if (syncItemIds.length > 0) {
      const masters = await tx.item.findMany({
        where: { id: { in: syncItemIds } },
        select: { id: true, isService: true },
      })
      for (const m of masters) isServiceById.set(m.id, m.isService)
    }
    const salesOrders = await tx.salesOrder.findMany({
      where: {
        quotationId,
        // K1: hanya SO DRAFT yang di-resync. Posted/final (approved/
        // confirmed/processing/dsb) dilewati — koreksi sah lewat retur/void.
        status: 'draft',
      },
    })

    // Hoist the invoice lookup OUTSIDE the SO loop. Previously each SO triggered
    // its own `tx.salesInvoice.findMany({ where: { salesOrderId: so.id, ... } })`
    // round-trip, so S unfinished SOs cost S findMany calls even though all the
    // invoices share a single `salesOrderId IN (...)` shape. Now: 1 findMany,
    // then group the rows in-memory by salesOrderId. Drops DB round-trips from
    // S to 1 (S queries → 1 query) when more than one SO is being re-synced.
    const salesOrderIds = salesOrders.map((s) => s.id)
    const allInvoices =
      salesOrderIds.length === 0
        ? []
        : await tx.salesInvoice.findMany({
            where: {
              salesOrderId: { in: salesOrderIds },
              // K1: hanya faktur DRAFT yang ikut resync. Posted/final
              // (sent/posted/partial/paid) dilewati — koreksi sah lewat
              // retur/void, bukan tulis-ulang + reverse+repost diam-diam.
              status: SalesInvoiceStatus.draft,
            },
          })

    // Putaran 73: kunci baris SO + faktur calon (id naik, anti-deadlock),
    // lalu baca ulang status dari baris terkunci. Bacaan snapshot di atas
    // bisa basi: postInvoice/updateSalesOrder mengunci baris dokumennya
    // sendiri, jadi tanpa berbagi kunci ini resync menimpa faktur yang
    // baru saja posted (GL-BR-003 jebol). Settlement juga dinilai sesudah
    // kunci faktur, bukan dari snapshot awal transaksi.
    const candidateInvoiceIds = allInvoices.map((inv) => inv.id).sort((a, b) => a - b)
    if (salesOrderIds.length > 0 && typeof tx.$executeRaw === "function") {
      const sortedSoIds = [...salesOrderIds].sort((a, b) => a - b)
      await tx.$executeRaw`SELECT id FROM sales_orders WHERE id IN (${Prisma.join(sortedSoIds)}) ORDER BY id FOR UPDATE`
    }
    if (candidateInvoiceIds.length > 0 && typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id IN (${Prisma.join(candidateInvoiceIds)}) ORDER BY id FOR UPDATE`
    }
    const freshSalesOrders = salesOrderIds.length === 0
      ? []
      : await tx.salesOrder.findMany({
          where: { id: { in: salesOrderIds }, status: "draft" },
          select: { id: true },
        })
    const freshSalesOrderIds = new Set(freshSalesOrders.map((s) => s.id))
    const freshInvoices = candidateInvoiceIds.length === 0
      ? []
      : await tx.salesInvoice.findMany({
          where: { id: { in: candidateInvoiceIds }, status: SalesInvoiceStatus.draft },
        })

    const invoicesBySO = new Map<number, typeof freshInvoices>()
    for (const inv of freshInvoices) {
      // salesOrderId is non-null on schema (required FK), but Prisma's TS type
      // marks the join column as nullable. The where:{ in: salesOrderIds }
      // filter above guarantees we never see null; the explicit assertion
      // (plus the null check for type narrowing) keeps tsc happy and is a
      // defensive guard if the filter is ever relaxed.
      const soId = inv.salesOrderId
      if (soId == null) continue
      const list = invoicesBySO.get(soId) ?? []
      list.push(inv)
      invoicesBySO.set(soId, list)
    }

    for (const so of salesOrders) {
      // Putaran 73: SO yang keluar dari draft sesudah kunci dilewati utuh.
      if (!freshSalesOrderIds.has(so.id)) continue
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: so.id } })
      if (items.length > 0) {
        await tx.salesOrderItem.createMany({
          data: items.map((qi) => ({
            salesOrderId: so.id,
            itemId: qi.itemId,
            description: qi.description,
            qty: qi.qty,
            unitPrice: qi.unitPrice,
            discount: qi.discount,
            total: qi.total,
          })),
        })
      }

      // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 6: kenaikan hasil
      // resync dinilai per dokumen terdampak SEBELUM tulis; tertahan =
      // throw = rollback seluruh resync (quotation edit ikut gagal).
      if (Number(quotation.grandTotal) > Number(so.grandTotal)) {
        // Jalur resync tanpa alasan peminta: tertahan tanpa rekod
        // pending (fase 3 butuh alasan Q-CL2-3); CreditGateBlockedError
        // merollback seluruh resync dan dibungkus pemanggil quotation
        // menjadi hasil gagal. Approved bersidik sama tetap terpakai.
        const soSyncAttempt = {
          customerId: so.customerId,
          documentType: 'sales_order' as const,
          attemptedAmount: Number(quotation.grandTotal),
          requestedBy: userId ?? 0,
          quotationId,
          existingDocumentId: so.id,
          requestReason: null,
        }
        const soSyncOverrideId = assertCreditGatePassed(
          await assessCreditGateInTx(tx, soSyncAttempt),
        )
        if (soSyncOverrideId != null) {
          await consumeApprovedCreditOverrideInTx(tx, soSyncOverrideId, soSyncAttempt, {
            id: so.id,
            documentNo: so.documentNo,
          })
        }
      }

      // Putaran 44: customer penawaran ikut diselaraskan — edit penawaran
      // yang memindah customer menata ulang SO ini, jadi pihak yang tampil
      // wajib sama di seluruh rantai (hanya SO draft yang sampai sini).
      await tx.salesOrder.update({
        where: { id: so.id },
        data: {
          customerId: quotation.customerId,
          subtotal: quotation.subtotal,
          discount: quotation.discount,
          tax: quotation.tax,
          grandTotal: quotation.grandTotal,
          totalAmount: quotation.grandTotal,
        },
      })

      const invoices = invoicesBySO.get(so.id) ?? []

      for (const inv of invoices) {
        // K1: guard ganda — lewati faktur non-draft maupun berpelunasan nyata.
        if (await hasRealSettlement(inv.id, tx)) continue
        if (inv.status !== SalesInvoiceStatus.draft) continue

        await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: inv.id } })
        if (items.length > 0) {
          await tx.salesInvoiceItem.createMany({
            data: items.map((qi) => ({
              salesInvoiceId: inv.id,
              itemId: qi.itemId,
              description: qi.description,
              qty: qi.qty,
              // Putaran 114: uom penawaran = satuan baris faktur; tanpa ini
              // posting menghitung qty 1:1 (hook hanya melihat uom kosong).
              uom: qi.uom,
              // Snapshot jenis baris dari master (bukan klaim historis harga).
              isService: qi.itemId != null ? (isServiceById.get(qi.itemId) ?? null) : null,
              unitPrice: qi.unitPrice,
              discount: qi.discount,
              total: qi.total,
            })),
          })
        }

        // F-2026-10-25-035-B: kenaikan invoice hasil resync dinilai
        // sebelum tulis/repost; tertahan = rollback seluruh resync.
        if (Number(quotation.grandTotal) > Number(inv.grandTotal)) {
          const invSyncAttempt = {
            customerId: inv.customerId,
            documentType: 'sales_invoice' as const,
            attemptedAmount: Number(quotation.grandTotal),
            requestedBy: userId ?? 0,
            quotationId,
            salesOrderId: inv.salesOrderId,
            existingDocumentId: inv.id,
            requestReason: null,
          }
          const invSyncOverrideId = assertCreditGatePassed(
            await assessCreditGateInTx(tx, invSyncAttempt),
          )
          if (invSyncOverrideId != null) {
            await consumeApprovedCreditOverrideInTx(tx, invSyncOverrideId, invSyncAttempt, {
              id: inv.id,
              documentNo: inv.documentNo,
            })
          }
        }

        // Putaran 44: pihak faktur draft ikut diselaraskan dengan penawaran.
        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            customerId: quotation.customerId,
            subtotal: quotation.subtotal,
            discount: quotation.discount,
            tax: quotation.tax,
            taxAmount: quotation.tax,
            grandTotal: quotation.grandTotal,
            totalAmount: quotation.grandTotal,
          },
        })

        // K1: guard di atas memastikan faktur di sini selalu draft — tidak ada
        // re-derive status payment maupun reverse+repost di jalur resync.
      }
    }
  })
}
