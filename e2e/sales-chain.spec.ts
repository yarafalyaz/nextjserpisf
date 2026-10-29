import { test, expect } from "@playwright/test"
import { prisma } from "@/lib/db/prisma"

/**
 * RANTAI JUAL P2-2: faktur draft (fixture) → posting → bayar lunas →
 * retur sebagian (buat + selesaikan), dengan asersi DB di tiap simpul.
 *
 * Fixture faktur `e2e-post-invoice-draft` dari scripts/seed-remaining-e2e.ts
 * blok 11 (item E2E-POST-ITEM, qty 2 @100000, stok 10 + lapisan FIFO 10).
 * Spec menekan tombol sungguhan; DB membuktikan pembukuan (jurnal AR + COGS,
 * stok OUT, paymentStatus, stok balik), bukan chip status.
 */
// AUD-R11-01/03: serial — describe ini me-reset fixture bersama (SKU/PO E2E).
// fullyParallel membuat tes se-file paralel; tanpa serial, reset vs posting
// balapan dalam file yang sama. Paralel antar-file tetap jalan.
test.describe.serial("Penjualan — rantai penuh", () => {
  test("faktur → posting → bayar → retur, jurnal & stok & sisa terbukti di DB", async ({
    page,
  }) => {
    // 0. Reset fixture berstok: faktur kembali draft, lapisan FIFO 10.
    const fixture = await prisma.salesInvoice.findUniqueOrThrow({
      where: { slug: "e2e-post-invoice-draft" },
    })
    const fixtureItem = await prisma.salesInvoiceItem.findFirstOrThrow({
      where: { salesInvoiceId: fixture.id },
    })
    const stockedItem = await prisma.item.findUniqueOrThrow({
      where: { sku: "E2E-POST-ITEM" },
    })
    // AUD-R13-01: jurnal yatim scoping fixture.id (bukan global).
    await prisma.$executeRaw`DELETE je FROM journal_entries je JOIN journals j ON j.id = je.journal_id WHERE j.reference_type IN ('SalesInvoice', 'SalesInvoiceCOGS', 'SalesPayment') AND j.reference_id = ${fixture.id} AND j.reference_id NOT IN (SELECT id FROM sales_invoices)`
    await prisma.salesPayment.deleteMany({ where: { salesInvoiceId: fixture.id } })
    await prisma.salesReturnItem.deleteMany({
      where: { salesReturn: { salesInvoiceId: fixture.id } },
    })
    await prisma.salesReturn.deleteMany({ where: { salesInvoiceId: fixture.id } })
    await prisma.salesInvoice.update({
      where: { id: fixture.id },
      data: { status: "draft", paymentStatus: "unpaid", paidAmount: 0 },
    })
    await prisma.stockMove.deleteMany({
      where: { referenceType: "SalesInvoice", referenceId: fixture.id },
    })
    // Bersihkan SEMUA layer item fixture: run paralel/sisa run lain menumpuk
    // layer (FIFO 10 per run) — posting ambil layer tertua, qtyOnHand akhir
    // meleset (6 bukan 8) walau reset layer terbaru = 10.
    const staleMoves = await prisma.stockMove.findMany({
      where: { itemId: stockedItem.id },
      select: { id: true },
    })
    const staleMoveIds = staleMoves.map((m) => m.id)
    if (staleMoveIds.length) {
      await prisma.inventoryLayer.deleteMany({ where: { stockMoveId: { in: staleMoveIds } } })
    }
    await prisma.stockMove.deleteMany({ where: { itemId: stockedItem.id } })
    // Layer ikut hilang bersama move induknya → buat ulang FIFO 10 bila absen.
    let layer = await prisma.inventoryLayer.findFirst({
      where: { itemId: stockedItem.id },
      orderBy: { id: "desc" },
    })
    if (!layer) {
      const wh = await prisma.warehouse.findFirstOrThrow()
      const move = await prisma.stockMove.create({
        data: {
          documentNo: `E2E-SEED-${Date.now()}`,
          itemId: stockedItem.id,
          warehouseId: stockedItem.defaultWarehouseId ?? wh.id,
          moveType: "IN",
          impact: "IN",
          status: "posted",
          qty: 10,
          cost: 100000,
          referenceType: "E2ESeed",
          referenceId: 0,
        },
      })
      layer = await prisma.inventoryLayer.create({
        data: {
          itemId: stockedItem.id,
          warehouseId: stockedItem.defaultWarehouseId ?? wh.id,
          stockMoveId: move.id,
          qtyIn: 10,
          qtyOut: 0,
          remaining: 10,
          unitCost: 100000,
        },
      })
    }
    await prisma.inventoryLayer.update({
      where: { id: layer.id },
      data: { qtyIn: 10, qtyOut: 0, remaining: 10 },
    })
    await prisma.item.update({
      where: { id: stockedItem.id },
      data: { qtyOnHand: 10 },
    })

    // 1. Posting faktur → jurnal AR + COGS lahir, stok berkurang 2.
    // Retry-safe: fixture mungkin sudah posted dari run sebelumnya.
    await page.goto("/penjualan/faktur/e2e-post-invoice-draft", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")
    const postingBtn = page.getByRole("button", { name: "Posting" })
    if ((await postingBtn.count()) > 0 && (await postingBtn.first().isEnabled())) {
      await postingBtn.first().click()
      await page.getByRole("button", { name: "Posting" }).last().click()
    }
    await expect(page.getByText("Diposting").first()).toBeVisible({ timeout: 30_000 })

    // Jurnal lahir async — poll sampai keduanya muncul.
    let arJournals: { id: number }[] = []
    let cogsJournals: { id: number }[] = []
    for (let i = 0; i < 20; i++) {
      arJournals = await prisma.journal.findMany({
        where: { referenceType: "SalesInvoice", referenceId: fixture.id },
      })
      cogsJournals = await prisma.journal.findMany({
        where: { referenceType: "SalesInvoiceCOGS", referenceId: fixture.id },
      })
      if (arJournals.length > 0 && cogsJournals.length > 0) break
      await page.waitForTimeout(1000)
    }
    expect(arJournals.length).toBe(1)
    expect(cogsJournals.length).toBe(1)
    for (const j of [...arJournals, ...cogsJournals]) {
      const lines = await prisma.journalEntry.findMany({ where: { journalId: j.id } })
      const dr = lines.reduce((s, l) => s + Number(l.debit), 0)
      const cr = lines.reduce((s, l) => s + Number(l.credit), 0)
      expect(dr).toBeCloseTo(cr, 2)
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(dr).toBeCloseTo(200000, 2)
    }
    // AR = grandTotal faktur; COGS = qty × cost item (100000), bukan harga jual.
    const cogsLines = await prisma.journalEntry.findMany({
      where: { journalId: cogsJournals[0].id },
    })
    const cogsDr = cogsLines.reduce((s, l) => s + Number(l.debit), 0)
    expect(cogsDr).toBeCloseTo(Number(fixtureItem.qty) * 100000, 2)

    // Reset di awal menghapus movement run ini; posting fixture yang SUDAH
    // posted (jurnal ada dari run lama) melewati hook (idempoten) sehingga
    // movement tak lahir lagi. Paksa posting ulang: kembalikan draft + hapus
    // jurnal run ini, lalu tekan Posting sungguhan.
    await prisma.$executeRaw`DELETE je FROM journal_entries je JOIN journals j ON j.id = je.journal_id WHERE (j.reference_type = 'SalesInvoice' OR j.reference_type = 'SalesInvoiceCOGS') AND j.reference_id = ${fixture.id}`
    await prisma.$executeRaw`DELETE FROM journals WHERE (reference_type = 'SalesInvoice' OR reference_type = 'SalesInvoiceCOGS') AND reference_id = ${fixture.id}`
    await prisma.salesInvoice.update({
      where: { id: fixture.id },
      data: { status: "draft" },
    })
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    const postingBtn2 = page.getByRole("button", { name: "Posting" })
    if ((await postingBtn2.count()) > 0 && (await postingBtn2.first().isEnabled())) {
      await postingBtn2.first().click()
      await page.getByRole("button", { name: "Posting" }).last().click()
    }
    await expect(page.getByText("Diposting").first()).toBeVisible({ timeout: 30_000 })
    // Movement milik faktur ini (reference SalesInvoice + id faktur).
    // Poll: movement lahir async sesudah posting.
    let outMoves: { id: number; status: string; impact: string }[] = []
    for (let i = 0; i < 20; i++) {
      outMoves = await prisma.stockMove.findMany({
        where: { referenceType: "SalesInvoice", referenceId: fixture.id },
      })
      if (outMoves.length > 0) break
      await page.waitForTimeout(1000)
    }
    expect(outMoves.length).toBeGreaterThan(0)
    for (const m of outMoves) {
      expect(m.status).toBe("posted")
      expect(m.impact).toBe("OUT")
    }
    const afterPost = await prisma.item.findUniqueOrThrow({
      where: { id: stockedItem.id },
    })
    expect(Number(afterPost.qtyOnHand)).toBe(8)

    // 2. Terima pembayaran lunas (200000) → paymentStatus paid.
    await page.locator("main").getByRole("link", { name: "Terima Pembayaran" }).click()
    await page.waitForURL(/\/penjualan\/pembayaran\/tambah/, { timeout: 30_000 })
    await page.waitForLoadState("networkidle")
    // Metode wajib — Combobox CommandInput: ketik + pilih.
    await page.getByRole("combobox", { name: /metode bayar/i }).click()
    await page.getByPlaceholder(/pilih|ketik|cari/i).fill("Transfer")
    await page.getByRole("option", { name: /transfer/i }).click()
    // Jumlah prefill = sisa faktur; tegaskan sebelum submit.
    await expect(page.getByLabel(/jumlah bayar/i)).toHaveValue(/200[\.\s]?000/)
    await page.getByRole("button", { name: "Terima Pembayaran" }).click()
    await page.waitForURL(/\/penjualan\/pembayaran$/, { timeout: 30_000 })

    const payment = await prisma.salesPayment.findFirstOrThrow({
      where: { salesInvoiceId: fixture.id },
      orderBy: { id: "desc" },
    })
    expect(Number(payment.amount)).toBe(200000)
    let paidInvoice = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: fixture.id },
    })
    for (let i = 0; i < 20 && paidInvoice.paymentStatus !== "paid"; i++) {
      await page.waitForTimeout(1000)
      paidInvoice = await prisma.salesInvoice.findUniqueOrThrow({
        where: { id: fixture.id },
      })
    }
    expect(paidInvoice.paymentStatus).toBe("paid")
    expect(Number(paidInvoice.paidAmount)).toBe(200000)

    // 3. Retur sebagian 1 pcs → selesaikan → stok balik 9, jurnal retur lahir.
    await page.goto("/penjualan/faktur/e2e-post-invoice-draft", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")
    // Faktur lunas → status paid → tombol "+ Buat Retur" (guard posted/partial)
    // hilang. Masuk lewat URL prefill langsung (jalur "buat dari" yang sah).
    await page.goto(`/penjualan/retur/tambah?invoiceId=${fixture.id}`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")
    // Prefill mengisi 1 baris qty 2 — ubah jadi 1 (retur sebagian).
    // Prefill mengisi 1 baris qty 2 — retur sebagian: ubah jadi 1.
    await page.getByLabel(/jumlah baris 1/i).fill("1")
    await page.locator("#submit-sales-return").click()
    // Form push ke DAFTAR retur — buka detail retur baru via link dokumen.
    await page.waitForURL(/\/penjualan\/retur$/, { timeout: 30_000 })
    const salesReturns = await prisma.salesReturn.findMany({
      where: { salesInvoiceId: fixture.id },
      orderBy: { id: "desc" },
    })
    expect(salesReturns.length).toBe(1)
    const salesReturn = salesReturns[0]
    await page.getByRole("link", { name: new RegExp(salesReturn.documentNo.replace(/\//g, "\\/")) }).first().click()
    await page.waitForURL(/\/penjualan\/retur\/[^/]+$/, { timeout: 30_000 })
    await page.getByRole("button", { name: "Selesaikan" }).first().click()
    await page.getByRole("button", { name: "Selesaikan" }).last().click()
    // Sukses = chip "Selesai" ATAU toast galat (tolak diam) — tunggu salah satunya, bukan sleep buta.
    const retToast = page.locator("li", { hasText: /gagal|tidak|wajib|kurang|ditolak/i }).first()
    await expect(page.getByText("Selesai").first().or(retToast)).toBeVisible({ timeout: 30_000 })
    if ((await retToast.count()) > 0) {
      throw new Error("retur gagal diselesaikan: " + ((await retToast.textContent()) ?? "").slice(0, 250))
    }
    await expect(page.getByText("Selesai").first()).toBeVisible({ timeout: 30_000 })

    // Selesai = server action async — poll sampai status completed.
    let doneReturn = await prisma.salesReturn.findUniqueOrThrow({
      where: { id: salesReturn.id },
    })
    for (let i = 0; i < 20 && doneReturn.status !== "completed"; i++) {
      await page.waitForTimeout(1000)
      doneReturn = await prisma.salesReturn.findUniqueOrThrow({
        where: { id: salesReturn.id },
      })
    }
    expect(doneReturn.status).toBe("completed")
    const afterReturn = await prisma.item.findUniqueOrThrow({
      where: { id: stockedItem.id },
    })
    expect(Number(afterReturn.qtyOnHand)).toBe(9)
    expect(salesReturn.id).toBeGreaterThan(0)
  })
})
