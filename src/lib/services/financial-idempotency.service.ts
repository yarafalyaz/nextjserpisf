/**
 * AUD-R6: idempotency key finansial persisten — kontrak "satu key = satu
 * scope + satu hasil final".
 * - Key dibuat CLIENT per intent (stabil untuk retry, baru untuk intent baru).
 * - Claim DULU (INSERT UNIQUE): menang = pemilik; kalah = baca baris existing.
 * - Replay SAH hanya bila scope SAMA. Scope beda = konflik → error, bukan
 *   sukses palsu. Key tanpa hasil final (crash sebelum bind) = error konflik
 *   "belum selesai" — bukan sukses, bukan tulis ulang buta.
 * - Hanya P2002 pada constraint key yang = replay; error DB lain dilempar.
 * - Replay mengembalikan referensi hasil awal (tipe + id) agar pemanggil bisa
 *   tunjukkan bukti operasi pertama, bukan sukses generik.
 */
export type IdemScope = "customer_credit_allocate" | "customer_credit_refund"

export type IdemExisting = {
  scope: string
  payloadHash: string | null
  resultRefType: string | null
  resultRefId: number | null
  createdBy: number | null
}

/**
 * AUD-R8-01: bedakan error DEFINITIF (aman ganti key) vs AMBIGU (pertahankan
 * key, retry sama). Definitif = validasi yang terjadi SEBELUM mutasi apa pun:
 * key invalid, nominal, saldo, pelanggan, periode, scope-beda, payload-beda.
 * AMBIGU = exception setelah klaim/insert (koneksi putus, deadlock, timeout,
 * crash) — status commit tak pasti. Marker: prefix "[DEFINITIF] ".
 */
export function isDefinitiveError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.startsWith("[DEFINITIF] ")
}

export function definitive(msg: string): Error {
  return new Error(`[DEFINITIF] ${msg}`)
}

/**
 * AUD-R8-02: fingerprint kanonis payload operasi. Scope sama + key sama +
 * payload beda = konflik (bukan replay). Format: scope|field=v|... (stabil,
 * tanpa secret).
 */
export function payloadFingerprint(parts: Record<string, string | number>): string {
  return Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join("|")
    .slice(0, 191)
}

/** AUD-R8-03: tipe hasil yang sah per scope. Replay dengan tipe salah = error. */
const EXPECTED_REF_TYPE: Record<IdemScope, string> = {
  customer_credit_allocate: "SalesPayment",
  customer_credit_refund: "Journal",
}

export type IdemTx = {
  financialIdempotencyKey: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: any) => Promise<{ id: number }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<IdemExisting | null>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<unknown>
  }
}

function isKeyConflict(e: unknown): boolean {
  // Prisma P2002 = unique violation. Batasi pada constraint key (bukan
  // unique lain di tabel yang sama) — cek kode + nama constraint/pesan key.
  if (typeof e !== "object" || e === null) return false
  const rec = e as Record<string, unknown>
  if (rec.code !== "P2002") return false
  const meta = rec.meta as Record<string, unknown> | undefined
  const target = meta ? String(meta.target ?? "") : ""
  if (target && !/\bkey\b/i.test(target)) return false
  if (!target) {
    const msg = e instanceof Error ? e.message : ""
    if (!/\bkey\b/i.test(msg)) return false
  }
  return true
}

/**
 * AUD-R7-01: validasi format key di server (satu pintu untuk semua scope).
 * Terima UUID v4 atau token aman 8-191 char [A-Za-z0-9_-]. Tak percaya buta
 * pada generator client.
 */
export function isValidIdempotencyKey(key: unknown): key is string {
  if (typeof key !== "string") return false
  if (key.length < 8 || key.length > 191) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return true
  return /^[A-Za-z0-9_-]+$/.test(key)
}

export async function claimIdempotencyKey(
  tx: IdemTx,
  scope: IdemScope,
  key: string,
  userId?: number,
  /** AUD-R8-02: fingerprint payload intent ini. Disimpan saat klaim menang;
   * dicocokkan saat replay. */
  fingerprint?: string,
): Promise<
  | { replayed: false }
  | { replayed: true; resultRefType: string | null; resultRefId: number | null }
> {
  if (!isValidIdempotencyKey(key)) throw definitive("Idempotency key tidak valid")
  try {
    await tx.financialIdempotencyKey.create({
      data: { key, scope, payloadHash: fingerprint ?? null, createdBy: userId ?? null },
    })
    return { replayed: false }
  } catch (e) {
    if (!isKeyConflict(e)) throw e
    // Kalah klaim: baca pemilik key. Di dalam tx yang sama, baris existing
    // sudah COMMIT oleh transaksi pertama (lock INSERT dilepas saat commit),
    // jadi findUnique melihat hasil final-nya.
    const existing = await tx.financialIdempotencyKey.findUnique({
      where: { key },
    })
    if (!existing) {
      // AUD-R7-02: konflik UNIQUE tapi baris tak terbaca (rollback transaksi
      // pertama antar claim, atau anomali isolasi). JANGAN sukses palsu —
      // gagal eksplisit: client retry dengan key SAMA aman (bila tx pertama
      // rollback, key bebas → klaim ulang menang; bila commit, replay sah).
      throw new Error(
        "Konflik idempotency key tanpa hasil terbaca — ulangi dengan key yang sama",
      )
    }
    // AUD-R6-02: scope beda = konflik nyata, BUKAN sukses.
    if (existing.scope !== scope) {
      throw definitive(
        `Idempotency key dipakai untuk operasi lain (${existing.scope}) — kirim key baru`,
      )
    }
    // AUD-R8-02: payload beda = konflik nyata, BUKAN replay. Key sama untuk
    // scope sama tapi kredit/faktur/nominal beda = intent BERBEDA yang
    // kebetulan pakai key sama (bug client/duplikat) — tolak tegas.
    if (fingerprint && existing.payloadHash && existing.payloadHash !== fingerprint) {
      throw definitive(
        "Idempotency key dipakai untuk nominal/target berbeda — kirim key baru untuk intent baru",
      )
    }
    if (!existing.resultRefType || !existing.resultRefId) {
      // Operasi pertama belum bind hasil (crash sebelum selesai): tolak
      // tulis ulang buta + tolak sukses palsu. Operator: cek jurnal/saldo
      // manual, lalu submit key baru.
      throw new Error(
        "Operasi dengan key ini belum selesai (tanpa hasil final) — jangan retry buta, cek jurnal/saldo lalu submit baru",
      )
    }
    // AUD-R8-03: tipe hasil harus cocok scope (data rusak/salah bind =
    // error, bukan ID palsu ke UI).
    const expected = EXPECTED_REF_TYPE[scope]
    if (existing.resultRefType !== expected || !existing.resultRefId) {
      throw definitive(
        `Hasil tersimpan key ini tidak valid (harus ${expected}) — hubungi admin, jangan retry buta`,
      )
    }
    return {
      replayed: true,
      resultRefType: existing.resultRefType,
      resultRefId: existing.resultRefId,
    }
  }
}

export async function bindIdempotencyKey(
  tx: IdemTx,
  key: string,
  resultRefType: string,
  resultRefId: number,
): Promise<void> {
  await tx.financialIdempotencyKey.update({
    where: { key },
    data: { resultRefType, resultRefId },
  })
}
