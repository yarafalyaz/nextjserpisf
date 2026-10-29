import { test, expect } from "@playwright/test"
import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"

/**
 * RANTAI BELI P2-1: PO approved → GR (buat+verifikasi) → tagihan (buat+konfirmasi)
 * → pembayaran (buat+konfirmasi), dengan asersi DB di tiap simpul.
 *
 * Fixture PO `e2e-po-chain` dari scripts/seed-remaining-e2e.ts blok 12.
 * Spec menekan tombol sungguhan; DB membuktikan pembukuan (stok, jurnal,
 * sisa tagihan), bukan chip status.
 */
// AUD-R11-01/03: serial — describe ini me-reset fixture bersama (SKU/PO E2E).
// fullyParallel membuat tes se-file paralel; tanpa serial, reset vs posting
// balapan dalam file yang sama. Paralel antar-file tetap jalan.
test.describe.serial("Pembelian — rantai penuh", () => {
  test("PO → terima → tagih → bayar, stok & jurnal & sisa terbukti di DB", async ({ page }) => {
    // 0. PO fixture: reset ke approved + bersihkan sisa run sebelumnya supaya
    // run idempoten (qty absolut, bukan akumulasi antar run).
    // AUD-R13-01: SEMUA cleanup scoping fixture — orphan-yatim global pun
    // dibatasi ke reference_id fixture (NOT IN + IN fixture = hanya yatim MILIK
    // fixture ini; yatim shard lain tak tersentuh).
    // AUD-R12-01: poRow DULU — semua cleanup di bawah scoping fixture ini.
    const poRow = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { documentNo: "E2E-PO-CHAIN" },
    })
    // GR fixture = semua GR milik PO ini (dibaca SEBELUM dihapus).
    const fixtureGrIds = (
      await prisma.goodsReceipt.findMany({
        where: { purchaseOrderId: poRow.id },
        select: { id: true },
      })
    ).map((g) => g.id)
    if (fixtureGrIds.length > 0) {
      // Movement + layer HANYA milik GR fixture (reference_id = GR id).
      // Global reference_type='GoodsReceipt' = hapus data shard lain.
      // Prisma.join: tiap id = parameter terpisah (bukan satu string koma).
      await prisma.$executeRaw`DELETE il FROM inventory_layers il JOIN stock_moves sm ON sm.id = il.stock_move_id WHERE sm.reference_type = 'GoodsReceipt' AND sm.reference_id IN (${Prisma.join(fixtureGrIds)})`
      await prisma.$executeRaw`DELETE FROM stock_moves WHERE reference_type = 'GoodsReceipt' AND reference_id IN (${Prisma.join(fixtureGrIds)})`
    }
    // (Layer yatim global DIBUANG R13-01: urutan hapus layer-sebelum-move sudah
    // benar → tak ada yatim baru. Sapu yatim lama = manual sekali, bukan tiap run.)
    const fixtureBillIds = (
      await prisma.vendorBill.findMany({
        where: { purchaseOrderId: poRow.id },
        select: { id: true },
      })
    ).map((b) => b.id)
    // Jurnal yatim MILIK fixture: reference GoodsReceipt/Bill yang id-nya fixture
    // tapi baris induknya sudah hilang (sisa run lama fixture SAMA).
    if (fixtureGrIds.length > 0) {
      await prisma.$executeRaw`DELETE je FROM journal_entries je JOIN journals j ON j.id = je.journal_id WHERE j.reference_type = 'GoodsReceipt' AND j.reference_id IN (${Prisma.join(fixtureGrIds)}) AND j.reference_id NOT IN (SELECT id FROM goods_receipts)`
      await prisma.$executeRaw`DELETE FROM journals WHERE reference_type = 'GoodsReceipt' AND reference_id IN (${Prisma.join(fixtureGrIds)}) AND reference_id NOT IN (SELECT id FROM goods_receipts)`
    }
    if (fixtureBillIds.length > 0) {
      await prisma.vendorPaymentAllocation.deleteMany({ where: { vendorBillId: { in: fixtureBillIds } } })
      // AUD-R12-03: payment via vendorBillId = bill fixture (penanda eksplisit).
      // Query lama (yatim + vendor_id PO) hapus payment tes lain se-vendor.
      await prisma.vendorPayment.deleteMany({ where: { vendorBillId: { in: fixtureBillIds } } })
      await prisma.vendorBillItem.deleteMany({ where: { vendorBillId: { in: fixtureBillIds } } })
      await prisma.vendorBill.deleteMany({ where: { id: { in: fixtureBillIds } } })
      // Jurnal yatim bill fixture (induk hilang, sisa run lama fixture sama).
      await prisma.$executeRaw`DELETE je FROM journal_entries je JOIN journals j ON j.id = je.journal_id WHERE j.reference_type = 'VendorBill' AND j.reference_id IN (${Prisma.join(fixtureBillIds)}) AND j.reference_id NOT IN (SELECT id FROM vendor_bills)`
      await prisma.$executeRaw`DELETE FROM journals WHERE reference_type = 'VendorBill' AND reference_id NOT IN (SELECT id FROM vendor_bills) AND reference_id IN (${Prisma.join(fixtureBillIds)})`
    }
    await prisma.goodsReceiptItem.deleteMany({ where: { goodsReceipt: { purchaseOrderId: poRow.id } } })
    await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: poRow.id } })
    // Idempoten penuh: GR run paralel/sisa bisa verified (PO ikut received).
    // Terima butuh PO approved/ordered/partial + GR draft. Kembalikan SEMUA
    // GR PO ini ke draft + PO ke approved — run ini selalu mulai dari nol.
    // (Verify ulang GR lama = stok ganda, jadi GR lama diverify-ulang di
    // langkah 2 run ini; stok direset qtyOnHand 0 di bawah + layer dibersihkan.)
    await prisma.goodsReceipt.updateMany({
      where: { purchaseOrderId: poRow.id },
      data: { status: "draft" },
    })
    await prisma.purchaseOrder.update({
      where: { id: poRow.id },
      data: { status: "approved" },
    })
    await prisma.item.updateMany({
      where: { sku: "E2E-BUY-ITEM" },
      data: { qtyOnHand: 0 },
    })
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { documentNo: "E2E-PO-CHAIN" },
    })
    // Snapshot SEBELUM goto /tambah: reset di atas sudah hapus semua GR, jadi
    // GR apa pun yang lahir sesudah ini = milik run ini (anti sisa run paralel).
    const maxGrBefore = await prisma.goodsReceipt.aggregate({
      _max: { id: true },
    })
    expect(["approved", "ordered", "partial_received"]).toContain(po.status)

    // 1. Buat penerimaan dari PO (prefill poId).
    await page.goto(`/pembelian/penerimaan/tambah?poId=${po.id}`, { waitUntil: "domcontentloaded" })
    await awaitReady(page, "form")

    // Header "Gudang Tujuan" wajib dipilih manual (combobox kosong walau baris
    // prefill) — tanpa ini tombol Terima Barang disabled.
    // QuickAddSelect = popover + input cari: ketik nama, pilih suggestion.
    // getByLabel cocok juga teks di dialog quick-add yang terbuka; scope ke form.
    // CommandInput di dalam popover punya placeholder "Cari gudang...".
    await page.getByRole("combobox", { name: /gudang tujuan/i }).click()
    await page.getByPlaceholder(/cari gudang/i).fill("Gudang E2E")
    await page.getByRole("option", { name: "Gudang E2E" }).click()
    await expect(page.getByRole("button", { name: "Terima Barang" })).toBeEnabled({
      timeout: 15_000,
    })
    // Tunggu toast hasil (sukses ATAU galat) — bukan navigasi buta.
    const toast = page.locator("[data-sonner-toast], [role='status'], .toaster, [data-testid='toast']").first()
    await page.getByRole("button", { name: "Terima Barang" }).click()
    // Sukses = URL pindah dari /tambah — tunggu navigasi, bukan sleep buta.
    // catch: bila gagal, asersi diagnostik di bawah yang membeberkan URL+toast.
    await page.waitForURL((url) => !url.pathname.endsWith("/pembelian/penerimaan/tambah"), { timeout: 30_000 }).catch(() => {})
    const afterUrl = page.url()
    const toastText = (await toast.count()) > 0 ? ((await toast.textContent()) ?? "") : ""
    // Bukti diagnostik bila masih di tambah: toast + URL.
    expect(
      `${afterUrl} :: ${toastText.slice(0, 200)}`,
    ).not.toContain("/pembelian/penerimaan/tambah")

    // GR terbaru untuk PO fixture = yang baru saja dibuat (id > id tertinggi
    // SEBELUM klik Terima — kunci poId saja tak cukup: run paralel / sisa run
    // lain di PO yang sama bisa menyodorkan GR verified basi → klik Verifikasi
    // ditolak "hanya dari status draf" + teks Terverifikasi tak muncul.
    // Poll hingga GR run ini lahir (klik Terima async di server).
    // AUD-R12-02: filter purchaseOrderId + status draft — id>saja bisa
    // comot GR PO lain dari shard paralel.
    let gr = null
    for (let i = 0; i < 20 && !gr; i++) {
      gr = await prisma.goodsReceipt.findFirst({
        where: {
          id: { gt: maxGrBefore._max.id ?? 0 },
          purchaseOrderId: po.id,
          status: "draft",
        },
        orderBy: { id: "desc" },
      })
      if (!gr) await new Promise((r) => setTimeout(r, 1000))
    }
    if (!gr) throw new Error("GR run ini tak lahir — Terima Barang gagal di server (cek toast/log)")
    expect(gr.status).toBe("draft")
    expect(gr.purchaseOrderId).toBe(po.id)

    // 2. Verifikasi GR → stok masuk + mutasi IN. Klik link dokumen di tabel
    // (spec tiba di daftar, bukan detail) lalu verifikasi di detail.
    await page.getByRole("link", { name: new RegExp(gr.documentNo.replace(/\//g, "\\/")) }).first().click()
    await page.waitForURL(/\/pembelian\/penerimaan\/[^/]+$/, { timeout: 30_000 })
    await page.getByRole("button", { name: "Verifikasi" }).first().click()
    await page.getByRole("button", { name: "Verifikasi" }).last().click()
    await expect(page.getByText("Terverifikasi").first()).toBeVisible({ timeout: 30_000 })

    // Movement milik GR ini (reference GoodsReceipt + id GR), bukan movement lama.
    const moves = await prisma.stockMove.findMany({
      where: { referenceType: "GoodsReceipt", referenceId: gr.id },
    })
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.status).toBe("posted")
      expect(m.impact).toBe("IN")
    }
    const layer = await prisma.inventoryLayer.findFirstOrThrow({
      where: { item: { sku: "E2E-BUY-ITEM" } },
      orderBy: { id: "desc" },
    })
    expect(Number(layer.remaining)).toBe(10)
    const item = await prisma.item.findUniqueOrThrow({ where: { sku: "E2E-BUY-ITEM" } })
    expect(Number(item.qtyOnHand)).toBe(10)

    // 3. Buat tagihan dari GR (prefill grId) → konfirmasi → jurnal AP lahir.
    await page.goto(`/pembelian/tagihan/tambah?grId=${gr.id}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Simpan", exact: true }).click()
    // Sukses = redirect ke DAFTAR tagihan (form push ke /pembelian/tagihan).
    await page.waitForURL(/\/pembelian\/tagihan$/, { timeout: 30_000 })
    // Tagihan milik GR ini = yang baru dibuat (tegas 1 baris: cleanup di awal).
    const billsForGr = await prisma.vendorBill.findMany({
      where: { goodsReceiptId: gr.id },
      orderBy: { id: "desc" },
    })
    expect(billsForGr.length).toBe(1)
    const bill = billsForGr[0]
    expect(bill.goodsReceiptId).toBe(gr.id)

    // Buka detail bill baru dari daftar, lalu konfirmasi di sana.
    await page.getByRole("link", { name: new RegExp(bill.documentNo.replace(/\//g, "\\/")) }).first().click()
    await page.waitForURL(/\/pembelian\/tagihan\/[^/]+$/, { timeout: 30_000 })
    // Tegaskan detail ini milik GR rantai (tolak salah-klik ke bill basi).
    await expect(page.getByText("E2E-PO-CHAIN").first()).toBeVisible({ timeout: 15_000 })
    const confirmedBill = bill
    expect(confirmedBill.goodsReceiptId).toBe(gr.id)
    await page.getByRole("button", { name: "Konfirmasi" }).first().click()
    await page.getByRole("button", { name: "Konfirmasi" }).last().click()
    await expect(page.getByText("Diposting").first()).toBeVisible({ timeout: 30_000 })
    // Konfirmasi = server action async; jurnal lahir sesudah revalidasi.
    // Poll DB (bukan sleep buta) sampai jurnal POSTED muncul.
    let journals: { id: number }[] = []
    for (let i = 0; i < 20; i++) {
      journals = await prisma.journal.findMany({
        where: { referenceType: "VendorBill", referenceId: confirmedBill.id },
      })
      if (journals.length > 0) break
      await page.waitForTimeout(1000)
    }
    expect(journals.length).toBe(1)
    for (const j of journals) {
      const lines = await prisma.journalEntry.findMany({ where: { journalId: j.id } })
      const dr = lines.reduce((s, l) => s + Number(l.debit), 0)
      const cr = lines.reduce((s, l) => s + Number(l.credit), 0)
      expect(dr).toBeCloseTo(cr, 2)
      expect(lines.length).toBeGreaterThanOrEqual(2)
    }

    // 4. Bayar tagihan → konfirmasi → sisa 0, status lunas. Dari detail tagihan
    // via tombol "Bayar" (prefill billId + vendor + jumlah otomatis). Scope ke
    // <main>: link "Bayar" juga ada di sidebar/nav.
    await page.locator("main").getByRole("link", { name: "Bayar" }).click()
    await page.waitForURL(/\/pembelian\/pembayaran-vendor\/tambah/, { timeout: 30_000 })
    await page.waitForLoadState("networkidle")
    // Metode pembayaran wajib — Combobox CommandInput: ketik + pilih.
    // Rekening kas/bank wajib untuk transfer (kolom No. Rekening diisi).
    await page.getByRole("combobox", { name: /metode pembayaran/i }).click()
    await page.getByPlaceholder(/pilih \/ ketik metode/i).fill("Transfer")
    await page.getByRole("option", { name: /transfer/i }).click()
    await page.getByLabel(/no\. rekening/i).fill("E2E-001")
    // Jumlah prefill = sisa tagihan; tegaskan sebelum simpan.
    const amountBox = page.getByLabel(/jumlah \(rp\)/i)
    await expect(amountBox).toHaveValue(/500[\.\s]?000/)
    await page.getByRole("button", { name: "Simpan", exact: true }).click()
    // Sukses = redirect ke daftar; gagal = tetap di tambah + toast galat.
    // Poll URL (bukan sleep buta — sleep flaky di CI lambat).
    await page.waitForURL(/\/pembelian\/pembayaran-vendor(\?|$)/, { timeout: 30_000 }).catch(() => {})
    const payToast = page.locator("li", { hasText: /gagal|wajib|tidak|kurang/i }).first()
    if (page.url().includes("/pembayaran-vendor/tambah")) {
      const msg = (await payToast.count()) > 0 ? await payToast.textContent() : "(tanpa toast)"
      throw new Error("pembayaran gagal tersimpan, masih di /tambah: " + (msg ?? "").slice(0, 200))
    }

    // Payment tercatat (draft) dari tombol Bayar; payment menaut tagihan via
    // kolom vendorBillId — baris ALOKASI baru lahir saat KONFIRMASI.
    const payment = await prisma.vendorPayment.findFirstOrThrow({
      where: { vendorBillId: confirmedBill.id },
      orderBy: { id: "desc" },
    })
    expect(Number(payment.amount)).toBe(500000)
    // Konfirmasi dari menu aksi baris (ActionDropdown → "Konfirmasi & Posting").
    await page.goto("/pembelian/pembayaran-vendor", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: /buka menu aksi/i }).first().click()
    await page.getByRole("menuitem", { name: /konfirmasi/i }).click()
    await page.getByRole("button", { name: /konfirmasi/i }).last().click()
    await expect(page.getByText(/dikembalikan|dibayar|diposting/i).first()).toBeVisible({
      timeout: 30_000,
    })
    // Alokasi lahir di confirm (async) — poll sampai muncul, lalu tegaskan.
    let alloc = null
    for (let i = 0; i < 20; i++) {
      alloc = await prisma.vendorPaymentAllocation.findFirst({
        where: { vendorBillId: confirmedBill.id },
        orderBy: { id: "desc" },
      })
      if (alloc) break
      await page.waitForTimeout(1000)
    }
    if (!alloc) throw new Error("alokasi pembayaran tak kunjung lahir sesudah konfirmasi")
    const paidBill = await prisma.vendorBill.findUniqueOrThrow({ where: { id: confirmedBill.id } })
    expect(Number(paidBill.balanceDue)).toBe(0)
    expect(["paid", "confirmed", "posted"].includes(paidBill.status)).toBe(true)
    expect(Number(alloc.amount)).toBe(500000)
    expect(payment.id).toBeGreaterThan(0)
  })
})
