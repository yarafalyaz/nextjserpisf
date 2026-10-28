/**
 * Landed-cost allocation for goods receipts.
 *
 * The PO carries `shippingCost` + `serviceFee` (an estimate of the freight and
 * platform/handling fees for the whole order) plus `discount` (the rollup of
 * the order's line discounts). Those costs must end up in the HPP (inventory
 * value) of the goods they carried — not as a separate expense — otherwise
 * per-product margin looks better than it really is.
 *
 * A single GR absorbs only the share of the pool that matches the value it
 * receives:
 *
 *   thisValue = Σ (baseQty × poNetUnitPrice)
 *   share     = pool × (thisValue / poNetValue)
 *
 * Because Σ(thisValue) over every receipt of a fully-received PO equals
 * `poNetValue`, the shares sum to exactly `pool` — no freight is stranded on a
 * partial receipt and none is double-booked when the balance arrives later.
 *
 * The pool is split in two so the UI can show the composition per line:
 *
 *   chargePool   = actual freight/handling (GR override) OR the GR's share of
 *                  the PO estimate (shippingCost + serviceFee)
 *   discountPool = the GR's share of the PO discount
 *   netPool      = chargePool − discountPool  → what actually lands in HPP
 *
 * When the caller passes explicit `shippingCost` / `otherCost` (> 0) the PO
 * estimate is ignored for this receipt and the entered amounts are used as-is
 * (the user knows the real freight better than the order did). The discount is
 * NOT an estimate of freight, so it keeps applying proportionally regardless.
 *
 * NOTE on double-counting: the allocation weight is the PO's NET unit price
 * (`poItem.total / poItem.qty`, i.e. already net of that line's discount), but
 * the caller is expected to enter the GR unit cost GROSS (the PO unit price).
 * The discount is then applied exactly once, through `discountPool`. If a GR
 * unit cost were entered already net of the discount, the discount would be
 * subtracted twice.
 *
 * Pure function: no DB, no clock — trivially unit-testable.
 */

/** A single received line, already converted to the item's BASE unit. */
export type LandedCostLine = {
  /** Received qty in the item's BASE unit of measure. */
  baseQty: number
  /** PO net unit price (poItem.total / poItem.qty); used as the allocation weight. */
  poNetUnitPrice: number
  /**
   * V7 vonis F-2026-10-28-125-V: alokasi landed HANYA untuk baris barang.
   * Baris jasa/subkontrak (default `true` bila tidak diisi) TIDAK boleh
   * menyerap porsi pool — dulu bobot dihitung dari semua baris tetapi alokasi
   * hanya dipakai baris stok, sehingga porsi baris jasa menguap tanpa jejak.
   */
  weighted?: boolean
}

export type AllocateLandedCostInput = {
  lines: LandedCostLine[]
  /** PO-level `shippingCost` + `serviceFee` estimate for the whole order. */
  poCostPool: number
  /** Full PO goods value (Σ poItem.total). Denominator of the value share. */
  poNetValue: number
  /** PO-level discount for the whole order (a positive number). */
  poDiscount?: number
  /** GR-level actual shipping cost. > 0 overrides the PO estimate. */
  shippingCost?: number
  /** GR-level other costs (packing, admin, …). > 0 overrides the PO estimate. */
  otherCost?: number
  /**
   * GR-level bank / payment admin fee (e.g. "Admin BCA").
   *
   * V3 vonis F-2026-10-28-125-V: BUKAN biaya perolehan — biaya admin bank tidak
   * membawa persediaan ke lokasi/kondisi, jadi TIDAK masuk `lineAdditions`,
   * unit cost, average cost, maupun InventoryLayer. Pool ini tetap dilaporkan
   * (`adminAdditions` / `adminFee`) supaya pemanggil bisa menjurnalnya sebagai
   * beban periode bernama, selaras `accounting.hook.ts:2798-2856`.
   */
  adminFee?: number
  /**
   * V8 vonis F-2026-10-28-125-V: GR ini melunasi PO (`allReceived`) → serap
   * sisa pool estimasi, bukan hanya porsi proporsional. Hanya berlaku bila GR
   * tidak memasukkan ongkir aktual (aktual selalu menang atas estimasi).
   */
  isFinalReceipt?: boolean
  /**
   * Nilai barang PO (Σ qty × harga neto) yang SUDAH diterima sebelum GR ini.
   * Dipakai menghitung sisa pool yang wajib di-true-up oleh GR terakhir (V8).
   */
  receivedValueBefore?: number
}

export type AllocateLandedCostResult = {
  /**
   * Per-line NET landed-cost amount (charge − discount) to add to that line.
   * V3: admin fee TIDAK termasuk di sini (beban periode, bukan kapitalisasi).
   */
  lineAdditions: number[]
  /** Per-unit net landed-cost addition for each line (lineAdditions / baseQty). */
  perUnitAdditions: number[]
  /** Per-line share of the freight/handling charge, before discount. */
  chargeAdditions: number[]
  /** Per-line share of the bank/admin fee (dilaporkan saja; TIDAK dikapitalisasi). */
  adminAdditions: number[]
  /** Per-unit bank/admin-fee share for each line (adminAdditions / baseQty). */
  adminPerUnitAdditions: number[]
  /** Per-line share of the discount (a positive number that is subtracted). */
  discountAdditions: number[]
  /** Effective freight/handling for this GR (explicit value, or the derived share). */
  shippingCost: number
  /** Effective other cost for this GR. */
  otherCost: number
  /** Effective bank/admin fee for this GR (explicit value). */
  adminFee: number
  /** Effective discount for this GR (a positive number). */
  discount: number
  /** Net total capitalised by this GR (== Σ lineAdditions == charge − discount). */
  absorbed: number
  /**
   * V7: porsi pool yang tak punya baris barang tujuan (GR jasa murni, atau
   * seluruh baris barang berbobot nol sementara qty juga nol). Nilainya WAJIB
   * dijurnal sebagai beban periode bernama oleh pemanggil — DILARANG menguap
   * tanpa jejak.
   */
  unallocatedPool: number
  /**
   * V5: dasar bobot yang benar-benar dipakai. `null` = nilai beli neto (sah).
   * `"qty"`/`"even"` hanya sah sebagai fallback dan wajib tercatat di memo
   * alokasi, bukan diam-diam.
   */
  weightFallback: "qty" | "even" | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Allocate `pool` across `weights`, rounding each share to 2dp and pushing the
 * rounding drift onto the largest-weight line so Σ(result) == pool to the cent.
 */
function allocateByWeights(pool: number, weights: number[], totalWeight: number): number[] {
  const out = weights.map(() => 0)
  if (pool <= 0 || totalWeight <= 0) return out
  let allocated = 0
  let largestIdx = 0
  let largestWeight = -1
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] > largestWeight) {
      largestWeight = weights[i]
      largestIdx = i
    }
    const share = round2((pool * weights[i]) / totalWeight)
    out[i] = share
    allocated += share
  }
  out[largestIdx] = round2(out[largestIdx] + (pool - allocated))
  return out
}

export function allocateLandedCost(input: AllocateLandedCostInput): AllocateLandedCostResult {
  const { lines, poCostPool, poNetValue } = input
  const explicitShipping = Number(input.shippingCost ?? 0)
  const explicitOther = Number(input.otherCost ?? 0)
  const explicitTotal = explicitShipping + explicitOther
  const poDiscount = Number(input.poDiscount ?? 0)
  // The bank/admin fee is reported as its own pool so the caller can expense it
  // (V3) — it is NEVER added to the capitalised line value.
  const adminPool = Math.max(0, Number(input.adminFee ?? 0))

  const empty: AllocateLandedCostResult = {
    lineAdditions: lines.map(() => 0),
    perUnitAdditions: lines.map(() => 0),
    chargeAdditions: lines.map(() => 0),
    adminAdditions: lines.map(() => 0),
    adminPerUnitAdditions: lines.map(() => 0),
    discountAdditions: lines.map(() => 0),
    shippingCost: explicitShipping,
    otherCost: explicitOther,
    adminFee: round2(adminPool),
    discount: 0,
    absorbed: 0,
    unallocatedPool: 0,
    weightFallback: null,
  }
  if (lines.length === 0) return empty

  // V7: hanya baris barang yang menyerap pool (`weighted !== false`).
  const weightedIdx: number[] = []
  for (let i = 0; i < lines.length; i++) if (lines[i].weighted !== false) weightedIdx.push(i)

  const thisValue = lines.reduce(
    (s, l, i) => (lines[i].weighted !== false ? s + l.baseQty * l.poNetUnitPrice : s),
    0,
  )

  // The share of a whole-PO pool that this receipt must absorb. When the PO has
  // no goods value (pathological), fall back to absorbing the whole pool.
  const shareOf = (wholePool: number): number => {
    if (wholePool <= 0) return 0
    if (poNetValue > 0 && thisValue > 0) return (wholePool * thisValue) / poNetValue
    return wholePool
  }

  // Freight/handling: explicit GR actuals win over the PO estimate.
  let shippingCost: number
  let otherCost: number
  let chargePool: number
  if (explicitTotal > 0) {
    chargePool = explicitTotal
    shippingCost = explicitShipping
    otherCost = explicitOther
  } else if (input.isFinalReceipt && poNetValue > 0) {
    // V8 true-up: penerimaan TERAKHIR menyerap sisa pool estimasi, bukan hanya
    // porsi proporsionalnya. Tanpa ini sisa pembulatan lintas penerimaan dan
    // selisih nilai PO menggantung tanpa dokumen.
    const receivedBefore = Math.max(0, Number(input.receivedValueBefore ?? 0))
    const shareBefore = (Number(poCostPool) || 0) * (Math.min(receivedBefore, poNetValue) / poNetValue)
    chargePool = Math.max(0, round2(Number(poCostPool) || 0) - round2(shareBefore))
    shippingCost = chargePool
    otherCost = 0
  } else {
    chargePool = shareOf(Number(poCostPool) || 0)
    shippingCost = chargePool
    otherCost = 0
  }

  // Discount always applies proportionally (it is not a freight estimate).
  const discountPool = shareOf(poDiscount)

  // V7: GR tanpa baris barang (jasa murni) tidak boleh mengapitalisasi ongkir.
  // Porsinya dilaporkan sebagai `unallocatedPool` supaya pemanggil menjurnalnya
  // sebagai beban periode bernama — bukan menguap tanpa jejak.
  if (weightedIdx.length === 0) {
    return {
      ...empty,
      shippingCost,
      otherCost,
      unallocatedPool: round2(chargePool),
      discount: 0,
    }
  }

  if (chargePool <= 0 && discountPool <= 0 && adminPool <= 0) {
    return { ...empty, shippingCost, otherCost, discount: 0 }
  }

  // V5: weight each GOODS line by goods value, falling back to qty then to an
  // even split — the fallback is reported in `weightFallback`, never silent.
  let weights = lines.map((l, i) => (weightedIdx.includes(i) ? l.baseQty * l.poNetUnitPrice : 0))
  let totalWeight = weights.reduce((s, w) => s + w, 0)
  let weightFallback: "qty" | "even" | null = null
  if (totalWeight <= 0) {
    weights = lines.map((l, i) => (weightedIdx.includes(i) ? l.baseQty : 0))
    totalWeight = weights.reduce((s, w) => s + w, 0)
    if (totalWeight > 0) weightFallback = "qty"
  }
  if (totalWeight <= 0) {
    weights = lines.map((_, i) => (weightedIdx.includes(i) ? 1 : 0))
    totalWeight = weightedIdx.length
    weightFallback = "even"
  }

  const chargeAdditions = allocateByWeights(chargePool, weights, totalWeight)
  const adminAdditions = allocateByWeights(adminPool, weights, totalWeight)
  const discountAdditions = allocateByWeights(discountPool, weights, totalWeight)
  // V3: admin TIDAK masuk kapitalisasi — hanya charge − discount.
  const lineAdditions = lines.map((_, i) =>
    round2(chargeAdditions[i] - discountAdditions[i]),
  )
  // Per-unit WAJIB sen-exact (2dp): nilai ini dijumlah ke unit cost lalu ditulis
  // ke StockMove.cost + InventoryLayer.unitCost (Decimal(15,2)) DAN dipakai jurnal
  // GR sebagai qty × cost. Tanpa bulat, jurnal memesan 3 × 1033,333… = 3100,00
  // sedangkan layer menyimpan 1033,33 sehingga FIFO hanya melepas 3099,99 —
  // GL vs subledger stok selisih Rp0,01/baris. Sisa pool tak terbagi per unit
  // (maks < Rp0,01 × qty) memang tak bisa disimpan di kolom 2dp; lineAdditions/
  // absorbed tetap total pool eksak untuk pelaporan alokasi.
  const perUnitAdditions = lines.map((l, i) =>
    l.baseQty > 0 ? round2(lineAdditions[i] / l.baseQty) : 0
  )
  const adminPerUnitAdditions = lines.map((l, i) =>
    l.baseQty > 0 ? round2(adminAdditions[i] / l.baseQty) : 0
  )

  return {
    lineAdditions,
    perUnitAdditions,
    chargeAdditions,
    adminAdditions,
    adminPerUnitAdditions,
    discountAdditions,
    shippingCost,
    otherCost,
    adminFee: round2(adminPool),
    discount: round2(discountPool),
    absorbed: round2(lineAdditions.reduce((s, v) => s + v, 0)),
    unallocatedPool: 0,
    weightFallback,
  }
}

/**
 * V8 vonis F-2026-10-28-125-V: residu pool landed cost WAJIB diselesaikan
 * eksplisit, tidak boleh menggantung tanpa dokumen.
 *
 * Tiga keadaan yang mungkin, dan semuanya dijawab di sini (bukan di pemanggil,
 * supaya keputusannya satu dan bisa diuji):
 *
 * - `none`       — estimasi sudah terserap seluruhnya (atau ongkir AKTUAL GR
 *                  dipakai; aktual selalu menang atas estimasi, jadi selisih
 *                  estimasi bukan biaya yang pernah terjadi → tidak dijurnal).
 * - `true_up`    — penerimaan terakhir yang sah menyerap sisa pool (dipakai
 *                  jalur GR: `isFinalReceipt`).
 * - `expense`    — PO ditutup/dibatalkan sebelum diterima penuh: sisa pool
 *                  menjadi beban bernama "Selisih Ongkos Kirim".
 *
 * Catatan jangkauan (jujur): jalur `expense` BELUM punya pemanggil karena
 * `cancelPurchaseOrder` menolak PO berstatus `partial_received`
 * (`src/actions/purchase.actions.ts:1001-1007`) dan belum ada aksi "tutup PO".
 * Fungsi ini tersedia supaya saat jalur itu dibuka, penyelesaiannya sudah
 * diputuskan dan teruji — bukan ditebak saat itu.
 */
export type LandedCostResidualOutcome = {
  /** `none` = tidak ada yang perlu dijurnal; `true_up` / `expense` = ada nilainya. */
  kind: "none" | "true_up" | "expense"
  /** Nilai yang wajib diselesaikan (0 untuk `none`). */
  amount: number
  /** Nama beban eksplisit untuk `kind === "expense"` (dipakai sebagai memo jurnal). */
  label: string
}

export const LANDED_COST_RESIDUAL_EXPENSE_LABEL = "Selisih Ongkos Kirim"

export function resolveLandedCostResidual(input: {
  /** Pool estimasi PO (shippingCost + serviceFee). */
  poCostPool: number
  /** Nilai yang sudah benar-benar dikapitalisasi ke layer sampai hari ini. */
  absorbedToDate: number
  /** PO sudah diterima penuh? */
  poFullyReceived: boolean
  /** GR memakai ongkir AKTUAL (bukan estimasi PO)? */
  usedActualCost?: boolean
}): LandedCostResidualOutcome {
  const pool = Math.max(0, Number(input.poCostPool) || 0)
  const absorbed = Math.max(0, Number(input.absorbedToDate) || 0)
  const residual = round2(pool - absorbed)
  if (pool <= 0 || residual <= 0 || input.usedActualCost) {
    return { kind: "none", amount: 0, label: "" }
  }
  if (input.poFullyReceived) {
    return { kind: "true_up", amount: residual, label: LANDED_COST_RESIDUAL_EXPENSE_LABEL }
  }
  return { kind: "expense", amount: residual, label: LANDED_COST_RESIDUAL_EXPENSE_LABEL }
}
