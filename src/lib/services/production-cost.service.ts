import { Prisma } from "@prisma/client"
import { prisma, TxClient } from "@/lib/db/prisma"
import { safeAdd, safeSubtract, safeMultiply } from "@/lib/utils/math"
import { stockJournalService } from "@/lib/services/stock-journal.service"
import { assertJobCostMutable } from "@/lib/services/job-closeout.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"

/**
 * Non-material production cost rollup (PRD FAB-06/07/08/09).
 *
 * `ProductionOrder.totalActualCost` starts as the sum of issued material cost
 * (`issueMaterial`). Non-material cost lines (`ProductionCost`: labor, machine,
 * overhead, subcontract, service) are additive on top of that. This module
 * keeps the two in sync without ever double-counting: the material portion is
 * never recomputed here, only the non-material delta is applied.
 */

/**
 * Apply a non-material cost delta to a production order's actual cost. Positive
 * delta on add, negative on delete/update-reduction. Never lets the running
 * total go below zero (a cost line can't push HPP negative).
 *
 * The order row is locked (`SELECT ... FOR UPDATE`) before the read-modify-write
 * so a concurrent `issueMaterial` (which uses the same lock) cannot interleave
 * and drop one side's cost — the two write the same `total_actual_cost` column.
 */
export async function applyProductionCostDelta(
  productionOrderId: number,
  delta: number,
  client: TxClient | typeof prisma = prisma,
  actor?: { userId?: number; costLineId?: number },
): Promise<void> {
  if (delta === 0) return
  await client.$queryRaw`SELECT id FROM production_orders WHERE id = ${productionOrderId} FOR UPDATE`
  const order = await client.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: { totalActualCost: true, documentNo: true },
  })
  if (!order) return
  const previous = Number(order.totalActualCost)
  const next = Math.max(0, safeAdd(previous, delta, 2))
  await client.productionOrder.update({
    where: { id: productionOrderId },
    data: { totalActualCost: next },
  })
  // Non-material cost must be DEBITED to WIP too, or the finished-goods receipt
  // credits WIP by the full actual cost while only the material portion was ever
  // debited — leaving WIP negative per job. Journal the EFFECTIVE change (the
  // clamp above can absorb part of a negative delta) so the GL mirrors the rollup.
  const effective = safeSubtract(next, previous, 2)
  if (effective !== 0 && client !== prisma) {
    await stockJournalService.onProductionCostAbsorbed(
      client as TxClient,
      effective,
      order.documentNo ?? `PO-${productionOrderId}`,
      actor?.costLineId ?? productionOrderId,
      actor?.userId,
    )
  }
}

/**
 * Mirror a service/subcontract PurchaseOrder's value onto a single `subcontract`
 * ProductionCost line for the production order(s) its work order fulfils
 * (VEH/G4 → FAB-08: subcontract is a real cost of the job and must show up in
 * HPP). The line is unique per `purchaseOrderId`; a change to the PO's value
 * applies only the delta so the order's running total stays exact.
 *
 * Only service POs linked to a work order participate, and only when that work
 * order has at least one production order. Passing a non-positive amount removes
 * the line (and subtracts it from HPP). Non-service POs are ignored (their value
 * is capitalised into inventory at goods receipt).
 */
export async function syncServicePurchaseOrderCost(
  input: {
    purchaseOrderId: number
    amount: number
    documentNo: string
    createdBy: number | null
  },
  client: TxClient | typeof prisma = prisma,
): Promise<{ posted: number; productionOrderIds: number[]; skippedProductionOrderIds: number[] }> {
  const po = await client.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    select: { isService: true, workOrderId: true, vendorId: true },
  })
  if (!po || !po.isService || po.workOrderId == null) {
    return { posted: 0, productionOrderIds: [], skippedProductionOrderIds: [] }
  }

  const allProductionOrders = await client.productionOrder.findMany({
    where: { workOrderId: po.workOrderId },
    select: { id: true, status: true, qty: true, completedQty: true },
  })
  // F-2026-10-21-009-V: WO closed membekukan semua PO anak — sync jasa
  // dilewati seluruhnya dan dilaporkan skipped (pola F-71 completed).
  const woRow = await client.workOrder.findUnique({
    where: { id: po.workOrderId },
    select: { status: true },
  })
  if (woRow?.status === "closed") {
    return {
      posted: 0,
      productionOrderIds: [],
      skippedProductionOrderIds: allProductionOrders.map((o) => o.id),
    }
  }
  // Baca ulang DI BAWAH kunci baris WO: snapshot di atas tak cukup —
  // closeWorkOrder mengunci baris WO yang sama lalu mengklaim
  // completed -> closed, jadi tutup yang commit di antara snapshot dan
  // tulis terserialisasi di titik ini (sync menunggu kunci; sesudah
  // close commit, baris terbaca closed). Status otoritatif WAJIB berasal
  // dari bacaan terkunci itu sendiri: transaksi pemanggil bisa sudah
  // membentuk snapshot REPEATABLE READ sebelum kunci diperoleh (locking
  // read tidak membentuk/menyegarkan snapshot), jadi findUnique sesudah
  // kunci tetap membaca nilai lama. Client tanpa $queryRaw atau baris
  // tanpa status jatuh ke snapshot di atas; jalur produksi selalu punya
  // $queryRaw dan WO yang terhubung selalu berstatus. Urutan kunci
  // WO -> ProductionOrder adalah urutan global: issueMaterial dan
  // createProductionOrder selaras dengannya sejak putaran 79 (sebelumnya
  // PO -> WO / produk -> WO, deadlock melawan jalur ini dan pasangan
  // decideBomRevisionChange).
  if (typeof client.$queryRaw === "function") {
    const lockedWo = (await client.$queryRaw`SELECT status FROM work_orders WHERE id = ${po.workOrderId} FOR UPDATE`) as
      | Array<{ status: string }>
      | undefined
    if (lockedWo?.[0]?.status === "closed") {
      return {
        posted: 0,
        productionOrderIds: [],
        skippedProductionOrderIds: allProductionOrders.map((o) => o.id),
      }
    }
  }
  // F-2026-10-20-71: a completed order's HPP is final — `totalActualCost` was
  // zeroed and `releasedCost` frozen at completion (final release in
  // manufacturing.actions), so a late service bill must not re-open it: writing
  // here would raise the total off zero and post Dr WIP / Cr absorption with no
  // further release to credit it (WIP hangs, GL != subledger). Completed orders
  // are skipped entirely — existing subcontract lines on them stay as history —
  // and reported so the caller can log it and surface a warning. The vendor
  // bill itself still posts to AP normally; only the HPP mirror is refused.
  // STOK-14: order parsial (completedQty > 0) ikut dibekukan — biaya susulan
  // di sini mengubah unit cost release berikutnya saja, sama seperti jalur
  // manual di production-cost.actions (mutableOrderError).
  const completedIds = new Set(
    allProductionOrders
      .filter((o) => o.status === "completed" || o.status === "closed" || Number(o.completedQty ?? 0) > 0)
      .map((o) => o.id),
  )
  let productionOrders = allProductionOrders.filter((o) => !completedIds.has(o.id))
  let skippedProductionOrderIds = allProductionOrders
    .filter((o) => completedIds.has(o.id))
    .map((o) => o.id)
  // Set beku EFEKTIF: filter snapshot di atas ditambah order yang baru
  // membeku pada baca-ulang terkunci di bawah. Filter baris existing wajib
  // memakai set ini — memakai snapshot lama membuat baris subkontrak milik
  // order yang baru saja membeku lolos sebagai "yatim" lalu dihapus +
  // WIP-nya dikredit oleh loop cleanup, padahal order itu masih menyimpan
  // sisa pool-nya (rilis akhir terbit dengan biaya kurang).
  const frozenIds = new Set(completedIds)
  if (allProductionOrders.length === 0) {
    return { posted: 0, productionOrderIds: [], skippedProductionOrderIds: [] }
  }

  // Baca ulang DI BAWAH kunci baris PO (urut id): filter completed/parsial
  // di atas adalah snapshot — completeProductionOrder mengunci baris yang
  // sama, jadi complete/rilis parsial yang commit di antara snapshot dan
  // tulis terlihat di sini dan order itu dipindah ke skipped. Tanpa ini
  // biaya jasa menaikkan totalActualCost PO completed dari nol (Dr WIP
  // menggantung) atau mengubah unit cost release akhir.
  if (typeof client.$queryRaw === "function") {
    const candidateIds = productionOrders.map((o) => o.id).sort((a, b) => a - b)
    if (candidateIds.length > 0) {
      await client.$queryRaw`SELECT id FROM production_orders WHERE id IN (${Prisma.join(candidateIds)}) FOR UPDATE`
      const lockedOrders = await client.productionOrder.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, status: true, completedQty: true },
      })
      const newlyFrozen = new Set(
        lockedOrders
          .filter((o) => o.status === "completed" || o.status === "closed" || Number(o.completedQty ?? 0) > 0)
          .map((o) => o.id),
      )
      if (newlyFrozen.size > 0) {
        productionOrders = productionOrders.filter((o) => !newlyFrozen.has(o.id))
        skippedProductionOrderIds = [...skippedProductionOrderIds, ...newlyFrozen]
        for (const id of newlyFrozen) frozenIds.add(id)
      }
    }
  }

  const desiredTotal = Math.max(0, Number(input.amount) || 0)
  // Only lines on live (or unknown-order) targets are managed; lines pinned to
  // a completed order are left untouched on every path below.
  const existingLines = (
    await client.productionCost.findMany({
      where: { purchaseOrderId: input.purchaseOrderId, category: "subcontract" },
      select: { id: true, amount: true, productionOrderId: true },
    })
  ).filter((l) => l.productionOrderId == null || !frozenIds.has(l.productionOrderId))

  if (desiredTotal === 0) {
    if (existingLines.length) {
      for (const line of existingLines) {
        await client.productionCost.delete({ where: { id: line.id } })
        if (line.productionOrderId != null) {
          await applyProductionCostDelta(line.productionOrderId, -Number(line.amount), client, {
            userId: input.createdBy ?? undefined,
            costLineId: line.id,
          })
        }
      }
    }
    return { posted: 0, productionOrderIds: productionOrders.map((o) => o.id), skippedProductionOrderIds }
  }

  // STOK-15: nilai PO dibobotkan qty terencana tiap order, bukan dibagi
  // rata per order — order qty 1 tidak boleh menelan biaya jasa yang
  // sama dengan order qty 100 (HPP per unit meledak). Bobot memakai
  // qty yang sama untuk semua sync ulang supaya redistribusi stabil.
  // Bila semua qty kosong/nol, jatuh ke bagi rata. Satu baris per
  // production order menjaga atribusi HPP tetap presisi.
  const totalQty = productionOrders.reduce((s, o) => safeAdd(s, Number(o.qty) || 0, 2), 0)

  const byOrder = new Map(existingLines.filter((l) => l.productionOrderId != null).map((l) => [l.productionOrderId!, l]))

  let allocated = 0
  for (let i = 0; i < productionOrders.length; i++) {
    const orderId = productionOrders[i].id
    // Order terakhir menyerap sisa pembulatan: total selalu persis.
    // safeMultiply(a, b, 2) membulatkan hasil kali ke 2 desimal (pola
    // codebase), jadi porsi = round(total * qtyOrder / totalQty).
    const target =
      i === productionOrders.length - 1
        ? safeSubtract(desiredTotal, allocated, 2)
        : totalQty > 0
          ? safeMultiply(desiredTotal, (Number(productionOrders[i].qty) || 0) / totalQty, 2)
          : Math.round((desiredTotal / productionOrders.length) * 100) / 100
    allocated = safeAdd(allocated, target, 2)
    const existing = byOrder.get(orderId)
    const currentAmount = existing ? Number(existing.amount) : 0

    // Jurnal serapan dikunci per BARIS biaya: baris yang baru dibuat wajib
    // menyumbang id-nya sendiri. Jatuh ke id perintah produksi (perilaku
    // lama) membuat jurnal baris pertama berbagi kunci dengan baris lain
    // pada perintah yang sama.
    let costLineId = existing?.id
    if (existing) {
      await client.productionCost.update({
        where: { id: existing.id },
        data: {
          amount: target,
          description: `Subkontrak PO ${input.documentNo}`,
        },
      })
    } else {
      const createdLine = await client.productionCost.create({
        data: {
          productionOrderId: orderId,
          workOrderId: po.workOrderId,
          purchaseOrderId: input.purchaseOrderId,
          vendorId: po.vendorId,
          category: "subcontract",
          description: `Subkontrak PO ${input.documentNo}`,
          amount: target,
          postedAt: new Date(),
          createdBy: input.createdBy,
        },
      })
      costLineId = createdLine.id
    }
    await applyProductionCostDelta(orderId, target - currentAmount, client, {
      userId: input.createdBy ?? undefined,
      costLineId,
    })
  }

  // Clean up any orphaned lines for production orders that no longer exist.
  for (const line of existingLines) {
    if (line.productionOrderId == null || !productionOrders.some((o) => o.id === line.productionOrderId)) {
      await client.productionCost.delete({ where: { id: line.id } })
      if (line.productionOrderId != null) {
        await applyProductionCostDelta(line.productionOrderId, -Number(line.amount), client, {
          userId: input.createdBy ?? undefined,
          costLineId: line.id,
        })
      }
    }
  }

  // `existingTotal` is the prior total; return the newly posted amount. When
  // every order was skipped there is no live order to carry the value, so
  // nothing was posted into HPP at all.
  return {
    posted: productionOrders.length ? desiredTotal : 0,
    productionOrderIds: productionOrders.map((o) => o.id),
    skippedProductionOrderIds,
  }
}

/**
 * Mirror an NCR's `reworkCost` onto a single `rework` ProductionCost line for the
 * production order the NCR references (PRD FAB-11 → FAB-09: rework is a real cost
 * of the job and must show up in HPP). The line is unique per NCR; a change to
 * the NCR's rework cost applies only the delta so the order's running total stays
 * exact.
 *
 * Only `referenceType === "ProductionOrder"` participates — rework captured
 * against a work order or goods receipt has no production HPP to roll into.
 * Passing a non-positive amount removes the line (and subtracts it from HPP).
 */
export async function syncReworkCostToOrder(
  input: {
    nonconformance: { id: number; referenceType: string; referenceId: number }
    reworkCost: number
    reworkHours: number
    documentNo: string
    createdBy: number | null
  },
  client: TxClient | typeof prisma = prisma,
): Promise<{ posted: number; productionOrderId: number | null; skipped?: boolean }> {
  const { nonconformance } = input
  if (nonconformance.referenceType !== "ProductionOrder") {
    return { posted: 0, productionOrderId: null }
  }
  const productionOrderId = nonconformance.referenceId
  const desired = Math.max(0, Number(input.reworkCost) || 0)

  // F-009-V: PO closed / WO induk closed membekukan sync rework — lempar
  // agar tx pemanggil (resolveNonconformance) rollback, bukan diam.
  await assertJobCostMutable({ productionOrderId }, "diubah rework-nya", client)

  // BUGHUNT round3 #12 / pola F-71 (syncServicePurchaseOrderCost): PO
  // `completed` HPP-nya final — totalActualCost dinolkan + releasedCost
  // dibekukan saat complete, jadi sync rework ke sini menaikkan total dari 0
  // dan memposting Dr WIP tanpa release pengkredit (WIP menggantung,
  // closeProductionOrder tertahan sisa WIP≠0 selamanya). Beda dengan
  // `closed` di atas yang melempar: completed DILEWATI tanpa tulis apa pun
  // (baris rework existing pun dibiarkan sebagai riwayat) dan dilaporkan
  // `skipped` supaya pemanggil bisa memberi tahu user — resolusi NCR sendiri
  // tetap sah, hanya cermin biaya ke HPP yang ditolak. Cancelled tetap lewat:
  // totalnya tidak pernah dinolkan completion, jadi penghapusan baris saat
  // biaya dibersihkan tetap konsisten.
  const orderStatus = await client.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: { status: true, completedQty: true },
  })
  // STOK-14: parsial juga dibekukan (completedQty > 0), alasan sama seperti
  // completed di atas — biaya rework susulan hanya membebani release akhir.
  if (orderStatus?.status === "completed" || Number(orderStatus?.completedQty ?? 0) > 0) {
    return { posted: 0, productionOrderId, skipped: true }
  }

  // Baca ulang DI BAWAH kunci baris PO: snapshot di atas bukan guard —
  // completeProductionOrder mengunci baris yang sama, jadi complete yang
  // commit di antara snapshot dan tulis akan terlihat di sini. Tanpa ini
  // biaya rework menaikkan totalActualCost PO completed dari nol dan Dr
  // WIP menggantung tanpa release pengkredit.
  if (typeof client.$queryRaw === "function") {
    await client.$queryRaw`SELECT id FROM production_orders WHERE id = ${productionOrderId} FOR UPDATE`
    const lockedStatus = await client.productionOrder.findUnique({
      where: { id: productionOrderId },
      select: { status: true, completedQty: true },
    })
    if (lockedStatus?.status === "completed" || lockedStatus?.status === "closed" || Number(lockedStatus?.completedQty ?? 0) > 0) {
      return { posted: 0, productionOrderId, skipped: true }
    }
  }

  const existing = await client.productionCost.findUnique({
    where: { nonconformanceId: nonconformance.id },
    select: { id: true, amount: true },
  })
  const currentAmount = existing ? Number(existing.amount) : 0

  // Delta bukan nol menulis jurnal WIP bertanggal hari ini lewat
  // applyProductionCostDelta -> onProductionCostAbsorbed: periode berjalan
  // yang terkunci wajib menolak SEBELUM baris biaya berubah. Jalur resolusi
  // NCR adalah satu-satunya pemanggil dan tak punya gerbang periode sendiri
  // (aksi biaya lain menjaga di aksinya masing-masing) — putaran 83.
  // Delta nol / PO selesai (skipped di atas) / non-produksi tidak menulis
  // jurnal, jadi tidak digerbang.
  if (desired !== currentAmount) {
    await assertPeriodOpen(new Date(), client as TxClient)
  }

  // Remove the line when the rework cost is cleared.
  if (desired === 0) {
    if (existing) {
      await client.productionCost.delete({ where: { id: existing.id } })
      await applyProductionCostDelta(productionOrderId, -currentAmount, client, {
        userId: input.createdBy ?? undefined,
        costLineId: existing.id,
      })
    }
    return { posted: 0, productionOrderId }
  }

  // Sama seperti sync subkontrak: jurnal dikunci id baris ini sendiri,
  // termasuk baris yang baru dibuat di cabang create.
  let costLineId = existing?.id
  if (existing) {
    await client.productionCost.update({
      where: { id: existing.id },
      data: {
        amount: desired,
        hours: input.reworkHours,
        description: `Biaya rework NCR ${input.documentNo}`,
      },
    })
  } else {
    const createdLine = await client.productionCost.create({
      data: {
        productionOrderId,
        category: "rework",
        description: `Biaya rework NCR ${input.documentNo}`,
        hours: input.reworkHours,
        amount: desired,
        nonconformanceId: nonconformance.id,
        postedAt: new Date(),
        createdBy: input.createdBy,
      },
    })
    costLineId = createdLine.id
  }
  await applyProductionCostDelta(productionOrderId, desired - currentAmount, client, {
    userId: input.createdBy ?? undefined,
    costLineId,
  })
  return { posted: desired, productionOrderId }
}
