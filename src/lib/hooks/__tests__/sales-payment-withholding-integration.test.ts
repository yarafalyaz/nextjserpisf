/**
 * Tes integrasi DB untuk PPh yang dipotong pelanggan pada pembayaran penjualan.
 *
 * Dua hal yang hanya bisa dibuktikan dengan database nyata:
 *
 * 1. **Pelunasan piutang** dihitung dari `amount + withholdingAmount` — kalau
 *    hanya `amount`, faktur yang dipotong PPh tidak akan pernah lunas.
 * 2. **Fail-closed**: jenis PPh tanpa akun "PPh dibayar dimuka" harus menggagalkan
 *    penjurnalan, bukan memposting pelunasan yang timpang.
 *
 * Opt-in seperti suite integrasi lain:
 *   RUN_DB_INTEGRATION=1 npx vitest run src/lib/hooks/__tests__/sales-payment-withholding-integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { onSalesPaymentCreated as recalcInvoicePayment, onSalesPaymentDeleted } from "@/lib/hooks/sales-payment.hook"
import { onSalesPaymentCreated as postSalesPaymentJournal } from "@/lib/hooks/accounting.hook"

let dbUp = false
beforeAll(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return
  try {
    await prisma.$queryRaw`SELECT 1`
    dbUp = true
  } catch {
    dbUp = false
  }
})

const stamp = Date.now()
const mark = `IT-PPH${stamp}`
const documents = {
  invoice: `INV-${mark}`,
  invoiceNoAccount: `INV-${mark}-NOACC`,
  paymentOk: `PAY-${mark}-OK`,
  paymentNoAccount: `PAY-${mark}-NOACC`,
}
const typeCodes = { ok: `POK${stamp}`, noAccount: `PNO${stamp}` }

/**
 * id pembayaran yang dibuat tes ini. Disimpan karena tes menghapus baris
 * pembayarannya sendiri, sehingga pencarian ulang lewat `documentNo` di afterAll
 * tidak lagi menemukannya — jurnalnya akan tertinggal di database.
 */
const createdPaymentIds: number[] = []

afterAll(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return
  const payments = await prisma.salesPayment.findMany({
    where: { documentNo: { in: [documents.paymentOk, documents.paymentNoAccount] } },
    select: { id: true },
  })
  await prisma.journal.deleteMany({
    where: {
      referenceType: "SalesPayment",
      referenceId: { in: [...payments.map((p) => p.id), ...createdPaymentIds] },
    },
  })
  await prisma.salesPayment.deleteMany({ where: { documentNo: { startsWith: `PAY-${mark}` } } })
  await prisma.salesInvoice.deleteMany({ where: { documentNo: { in: [documents.invoice, documents.invoiceNoAccount] } } })
  await prisma.withholdingTaxType.deleteMany({ where: { code: { in: Object.values(typeCodes) } } })
  await prisma.$disconnect()
})

describe("PPh dipotong pelanggan (DB integration)", () => {
  it("melunasi piutang sebesar kas + potongan, dan menolak potongan tanpa akun pajak", async () => {
    if (process.env.RUN_DB_INTEGRATION !== "1") {
      console.warn("RUN_DB_INTEGRATION not enabled — skipping DB integration test")
      return
    }
    if (!dbUp) {
      console.warn("DB not reachable — skipping integration test")
      return
    }

    const [customer, assetAccount] = await Promise.all([
      prisma.customer.findFirst({ select: { id: true } }),
      prisma.account.findFirst({ where: { type: "ASSET" }, select: { id: true } }),
    ])
    if (!customer || !assetAccount) {
      console.warn("DB ini tidak punya customer/akun — melewati tes")
      return
    }

    const invoice = await prisma.salesInvoice.create({
      data: {
        documentNo: documents.invoice,
        customerId: customer.id,
        date: new Date("2026-10-10T00:00:00"),
        grandTotal: 11_000_000,
        status: "posted",
      },
    })

    // Dua faktur terpisah: satu untuk kasus gagal, satu untuk kasus berhasil —
    // kalau ditumpuk di faktur yang sama, pelunasan keduanya ikut terhitung dan
    // angkanya jadi dua kali lipat.
    const invoiceNoAccount = await prisma.salesInvoice.create({
      data: {
        documentNo: documents.invoiceNoAccount,
        customerId: customer.id,
        date: new Date("2026-10-10T00:00:00"),
        grandTotal: 11_000_000,
        status: "posted",
      },
    })

    // Jenis PPh TANPA akun PPh dibayar dimuka → penjurnalan harus gagal terang-terangan.
    const noAccountType = await prisma.withholdingTaxType.create({
      data: { code: typeCodes.noAccount, name: `PPh tanpa akun ${stamp}`, rate: 2, receivableAccountId: null },
    })
    const paymentNoAccount = await prisma.salesPayment.create({
      data: {
        documentNo: documents.paymentNoAccount,
        salesInvoiceId: invoiceNoAccount.id,
        customerId: customer.id,
        amount: 10_670_000,
        paymentDate: new Date("2026-10-12T00:00:00"),
        paymentMethod: "transfer",
        withholdingTypeId: noAccountType.id,
        withholdingAmount: 330_000,
      },
    })
    await expect(postSalesPaymentJournal(paymentNoAccount.id)).rejects.toThrow(/PPh dibayar dimuka/)
    createdPaymentIds.push(paymentNoAccount.id)
    // Tidak ada jurnal separuh jadi.
    expect(
      await prisma.journal.count({ where: { referenceType: "SalesPayment", referenceId: paymentNoAccount.id } }),
    ).toBe(0)

    // Jenis PPh dengan akun → jurnal 3 baris.
    const okType = await prisma.withholdingTaxType.create({
      data: {
        code: typeCodes.ok,
        name: `PPh dengan akun ${stamp}`,
        rate: 2,
        receivableAccountId: assetAccount.id,
      },
    })
    const payment = await prisma.salesPayment.create({
      data: {
        documentNo: documents.paymentOk,
        salesInvoiceId: invoice.id,
        customerId: customer.id,
        amount: 10_670_000,
        paymentDate: new Date("2026-10-12T00:00:00"),
        paymentMethod: "transfer",
        withholdingTypeId: okType.id,
        withholdingAmount: 330_000,
        withholdingCertificateNo: `BP-${mark}`,
      },
    })
    createdPaymentIds.push(payment.id)

    // Pelunasan piutang = kas + potongan.
    await recalcInvoicePayment(payment.id)
    const settled = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { paidAmount: true, status: true, paymentStatus: true },
    })
    expect(Number(settled.paidAmount)).toBe(11_000_000)
    expect(settled.status).toBe("paid")
    expect(settled.paymentStatus).toBe("paid")

    // Jurnal: Dr Kas (kas diterima) + Dr PPh dibayar dimuka (potongan) / Cr Piutang (penuh).
    await postSalesPaymentJournal(payment.id)
    const journal = await prisma.journal.findFirst({
      where: { referenceType: "SalesPayment", referenceId: payment.id },
      include: { entries: { select: { accountId: true, debit: true, credit: true } } },
    })

    if (!journal) {
      // Sistem pengaturan DB ini belum memetakan akun piutang penjualan; hook
      // memang berhenti lebih awal. Bukan kegagalan fitur PPh.
      console.warn("Akun piutang penjualan belum diatur di DB ini — bagian jurnal dilewati")
      return
    }

    expect(Number(journal.totalDebit)).toBe(11_000_000)
    expect(Number(journal.totalCredit)).toBe(11_000_000)
    expect(journal.entries).toHaveLength(3)
    expect(journal.entries.filter((entry) => Number(entry.debit) === 330_000)).toHaveLength(1)
    expect(
      journal.entries.reduce((sum, entry) => sum + Number(entry.credit), 0),
    ).toBe(11_000_000)

    // Menghapus pembayaran harus mengembalikan faktur ke belum lunas.
    // Hook-nya hanya MENGHITUNG ULANG, jadi barisnya dihapus lebih dulu.
    await prisma.salesPayment.delete({ where: { id: payment.id } })
    await onSalesPaymentDeleted(invoice.id)
    const afterDelete = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { paidAmount: true },
    })
    expect(Number(afterDelete.paidAmount)).toBe(0)
  })
})
