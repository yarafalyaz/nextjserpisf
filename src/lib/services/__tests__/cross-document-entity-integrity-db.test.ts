import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"

/**
 * Integritas keselarasan entitas lintas-dokumen (putaran 252) — READ-ONLY,
 * gate `RUN_DB_INTEGRATION=1`.
 *
 * Menguji invarian rantai dokumen yang tidak di-enforce di tingkat skema
 * relational foreign key (karena skema menyimpan customerId / vendorId
 * di header tiap tabel anak):
 *
 *  1. Penjualan berantai:
 *     - Setiap Faktur Penjualan (`SalesInvoice`) yang merujuk `SalesOrder`
 *       wajib memiliki `customerId` yang persis sama dengan pelanggan SalesOrder.
 *     - Setiap Surat Jalan (`DeliveryOrder`) yang merujuk `SalesOrder`
 *       wajib memiliki `customerId` yang persis sama dengan pelanggan SalesOrder.
 *     - Setiap Pembayaran Piutang (`SalesPayment`) yang memiliki `customerId`
 *       wajib identik dengan pelanggan pada faktur yang dilunasinya (`SalesInvoice`).
 *     - Setiap Retur Penjualan (`SalesReturn`) yang merujuk `SalesInvoice`
 *       wajib memiliki `customerId` yang persis sama.
 *  2. Pembelian berantai:
 *     - Setiap Tagihan Pemasok (`VendorBill`) yang merujuk `PurchaseOrder`
 *       wajib memiliki `vendorId` yang persis sama dengan pemasok di PurchaseOrder.
 *     - Setiap Pembayaran Utang (`VendorPayment`) yang memiliki target `vendorBillId`
 *       wajib memiliki `vendorId` yang persis sama dengan pemasok pada tagihan tersebut.
 */

const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

describe("integritas keselarasan entitas lintas-dokumen (DB, read-only)", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it.skipIf(SKIP)(
    "rantai penjualan: Invoice, DO, Payment, dan Return mewarisi customer yang identik dengan dokumen asal",
    async () => {
      // 1. SalesInvoice -> SalesOrder
      const invoiceMismatches = await prisma.$queryRaw<
        Array<{
          invoiceId: number
          invoiceNo: string | null
          invoiceCustomerId: number
          soId: number
          soNo: string | null
          soCustomerId: number
        }>
      >`
        SELECT
          si.id AS invoiceId,
          si.document_no AS invoiceNo,
          si.customer_id AS invoiceCustomerId,
          so.id AS soId,
          so.document_no AS soNo,
          so.customer_id AS soCustomerId
        FROM sales_invoices si
        JOIN sales_orders so ON so.id = si.sales_order_id
        WHERE si.customer_id <> so.customer_id
          AND si.deleted_at IS NULL
          AND so.deleted_at IS NULL;
      `

      expect(
        invoiceMismatches,
        `Ditemukan SalesInvoice dengan customer_id yang berbeda dari SalesOrder induknya: ${JSON.stringify(
          invoiceMismatches,
        )}`,
      ).toEqual([])

      // 2. DeliveryOrder -> SalesOrder
      const doMismatches = await prisma.$queryRaw<
        Array<{
          doId: number
          doNo: string | null
          doCustomerId: number
          soId: number
          soNo: string | null
          soCustomerId: number
        }>
      >`
        SELECT
          d.id AS doId,
          d.document_no AS doNo,
          d.customer_id AS doCustomerId,
          so.id AS soId,
          so.document_no AS soNo,
          so.customer_id AS soCustomerId
        FROM delivery_orders d
        JOIN sales_orders so ON so.id = d.sales_order_id
        WHERE d.customer_id <> so.customer_id
          AND so.deleted_at IS NULL;
      `

      expect(
        doMismatches,
        `Ditemukan DeliveryOrder dengan customer_id yang berbeda dari SalesOrder induknya: ${JSON.stringify(
          doMismatches,
        )}`,
      ).toEqual([])

      // 3. SalesPayment -> SalesInvoice
      const paymentMismatches = await prisma.$queryRaw<
        Array<{
          paymentId: number
          paymentNo: string
          paymentCustomerId: number
          invoiceId: number
          invoiceNo: string | null
          invoiceCustomerId: number
        }>
      >`
        SELECT
          sp.id AS paymentId,
          sp.document_no AS paymentNo,
          sp.customer_id AS paymentCustomerId,
          si.id AS invoiceId,
          si.document_no AS invoiceNo,
          si.customer_id AS invoiceCustomerId
        FROM sales_payments sp
        JOIN sales_invoices si ON si.id = sp.sales_invoice_id
        WHERE sp.customer_id IS NOT NULL
          AND sp.customer_id <> si.customer_id
          AND si.deleted_at IS NULL;
      `

      expect(
        paymentMismatches,
        `Ditemukan SalesPayment dengan customer_id yang berbeda dari SalesInvoice yang dilunasi: ${JSON.stringify(
          paymentMismatches,
        )}`,
      ).toEqual([])

      // 4. SalesReturn -> SalesInvoice
      const returnMismatches = await prisma.$queryRaw<
        Array<{
          returnId: number
          returnNo: string | null
          returnCustomerId: number
          invoiceId: number
          invoiceNo: string | null
          invoiceCustomerId: number
        }>
      >`
        SELECT
          sr.id AS returnId,
          sr.document_no AS returnNo,
          sr.customer_id AS returnCustomerId,
          si.id AS invoiceId,
          si.document_no AS invoiceNo,
          si.customer_id AS invoiceCustomerId
        FROM sales_returns sr
        JOIN sales_invoices si ON si.id = sr.sales_invoice_id
        WHERE sr.customer_id <> si.customer_id
          AND si.deleted_at IS NULL;
      `

      expect(
        returnMismatches,
        `Ditemukan SalesReturn dengan customer_id yang berbeda dari SalesInvoice induknya: ${JSON.stringify(
          returnMismatches,
        )}`,
      ).toEqual([])
    },
  )

  it.skipIf(SKIP)(
    "rantai pembelian: Tagihan dan Pembayaran mewarisi vendor yang identik dengan dokumen asal",
    async () => {
      // 1. VendorBill -> PurchaseOrder
      const billMismatches = await prisma.$queryRaw<
        Array<{
          billId: number
          billNo: string | null
          billVendorId: number
          poId: number
          poNo: string | null
          poVendorId: number
        }>
      >`
        SELECT
          vb.id AS billId,
          vb.document_no AS billNo,
          vb.vendor_id AS billVendorId,
          po.id AS poId,
          po.document_no AS poNo,
          po.vendor_id AS poVendorId
        FROM vendor_bills vb
        JOIN purchase_orders po ON po.id = vb.purchase_order_id
        WHERE vb.vendor_id <> po.vendor_id
          AND vb.deleted_at IS NULL
          AND po.deleted_at IS NULL;
      `

      expect(
        billMismatches,
        `Ditemukan VendorBill dengan vendor_id yang berbeda dari PurchaseOrder induknya: ${JSON.stringify(
          billMismatches,
        )}`,
      ).toEqual([])

      // 2. VendorPayment -> VendorBill (targeted bill)
      const paymentMismatches = await prisma.$queryRaw<
        Array<{
          paymentId: number
          paymentNo: string
          paymentVendorId: number
          billId: number
          billNo: string | null
          billVendorId: number
        }>
      >`
        SELECT
          vp.id AS paymentId,
          vp.document_no AS paymentNo,
          vp.vendor_id AS paymentVendorId,
          vb.id AS billId,
          vb.document_no AS billNo,
          vb.vendor_id AS billVendorId
        FROM vendor_payments vp
        JOIN vendor_bills vb ON vb.id = vp.vendor_bill_id
        WHERE vp.vendor_id <> vb.vendor_id
          AND vb.deleted_at IS NULL
          AND vp.deleted_at IS NULL;
      `

      expect(
        paymentMismatches,
        `Ditemukan VendorPayment dengan vendor_id yang berbeda dari VendorBill yang ditargetkan: ${JSON.stringify(
          paymentMismatches,
        )}`,
      ).toEqual([])
    },
  )
})
