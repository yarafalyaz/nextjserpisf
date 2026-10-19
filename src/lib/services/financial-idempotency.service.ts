/**
 * AUD-R5: idempotency key finansial persisten.
 * Satu intent/submit = satu baris UNIQUE. Pola pakai (di DALAM transaksi):
 *   const claim = await claimIdempotencyKey(tx, scope, key, userId)
 *   if (claim.replayed) return { success: true } // retry: hasil awal berlaku
 *   ... tulis jurnal/saldo ...
 *   await bindIdempotencyKey(tx, scope, key, refType, refId)
 * Key dibuat CLIENT per submit (crypto.randomUUID per klik tombol) — BUKAN
 * dari atribut bisnis (kredit+faktur+nominal bisa sah berulang). Dua submit
 * beda = dua key beda = dua operasi sah. Retry submit sama = replay.
 */
export type IdemTx = {
  financialIdempotencyKey: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: any) => Promise<{ id: number }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<unknown>
  }
}

export async function claimIdempotencyKey(
  tx: IdemTx,
  scope: "customer_credit_allocate" | "customer_credit_refund",
  key: string,
  userId?: number,
): Promise<{ replayed: boolean }> {
  if (!key || key.length > 191) throw new Error("Idempotency key tidak valid")
  try {
    await tx.financialIdempotencyKey.create({
      data: { key, scope, createdBy: userId ?? null },
    })
    return { replayed: false }
  } catch (e) {
    // UNIQUE violation = key sudah ada = retry submit yang sama → replay.
    const msg = e instanceof Error ? e.message : String(e)
    if (/unique|duplicate|P2002/i.test(msg)) return { replayed: true }
    throw e
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
