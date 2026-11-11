export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { InvoiceExchangeForm, type ExchangeableInvoice } from "../../_components/invoice-exchange-form"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { isSettled } from "@/lib/finance/settlement-status"
import { loadReturnCreditByInvoiceId } from "@/lib/reports/return-credit"
import { parsePrefillSegments, resolvePrefillId } from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Tukar Faktur" }

const customerHref = (slug: string) => `/penjualan/tukar-faktur/tambah/pelanggan/${slug}`
const invoiceHref = (slug: string) => `/penjualan/tukar-faktur/tambah/faktur/${slug}`

export default async function CreateInvoiceExchangePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermission("create_invoice_exchanges")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["pelanggan", "faktur"])

  // Redirect legacy query params: ?customer=<id> atau ?invoiceId=<id>
  if (!seg.pelanggan && !seg.faktur) {
    if (params.customer !== undefined && params.invoiceId !== undefined) {
      const custId = Number(params.customer)
      const invId = Number(params.invoiceId)
      const [cust, inv] = await Promise.all([
        Number.isInteger(custId) && custId > 0
          ? prisma.customer.findUnique({ where: { id: custId }, select: { slug: true } })
          : null,
        Number.isInteger(invId) && invId > 0
          ? prisma.salesInvoice.findUnique({ where: { id: invId }, select: { slug: true } })
          : null,
      ])
      const custSlug = cust?.slug ?? params.customer
      const invSlug = inv?.slug ?? params.invoiceId
      if (custSlug && invSlug) {
        redirect(`/penjualan/tukar-faktur/tambah/pelanggan/${custSlug}/faktur/${invSlug}`)
      } else if (custSlug) {
        redirect(customerHref(custSlug))
      } else if (invSlug) {
        redirect(invoiceHref(invSlug))
      }
    } else if (params.customer !== undefined) {
      const custId = Number(params.customer)
      const cust = Number.isInteger(custId) && custId > 0
        ? await prisma.customer.findUnique({ where: { id: custId }, select: { slug: true } })
        : null
      redirect(cust?.slug ? customerHref(cust.slug) : (Number.isInteger(custId) && custId > 0 ? customerHref(params.customer) : "/penjualan/tukar-faktur/tambah"))
    } else if (params.invoiceId !== undefined) {
      const invId = Number(params.invoiceId)
      const inv = Number.isInteger(invId) && invId > 0
        ? await prisma.salesInvoice.findUnique({ where: { id: invId }, select: { slug: true } })
        : null
      redirect(inv?.slug ? invoiceHref(inv.slug) : (Number.isInteger(invId) && invId > 0 ? invoiceHref(params.invoiceId) : "/penjualan/tukar-faktur/tambah"))
    }
  }

  // Resolve ID dari segmen path kanonis
  let resolvedCustomerId: number | null = null
  let resolvedInvoiceId: number | null = null

  if (seg.pelanggan) {
    resolvedCustomerId = await resolvePrefillId(prisma.customer, seg.pelanggan, (slug) => {
      return seg.faktur
        ? `/penjualan/tukar-faktur/tambah/pelanggan/${slug}/faktur/${seg.faktur}`
        : customerHref(slug)
    })
  }

  if (seg.faktur) {
    resolvedInvoiceId = await resolvePrefillId(prisma.salesInvoice, seg.faktur, (slug) => {
      return seg.pelanggan
        ? `/penjualan/tukar-faktur/tambah/pelanggan/${seg.pelanggan}/faktur/${slug}`
        : invoiceHref(slug)
    })
  }

  // Jika faktur diketahui tetapi pelanggan belum ditentukan di path, auto-assign customer dari faktur
  if (resolvedInvoiceId && !resolvedCustomerId) {
    const inv = await prisma.salesInvoice.findUnique({
      where: { id: resolvedInvoiceId },
      select: { customerId: true, customer: { select: { slug: true } }, slug: true },
    })
    if (inv) {
      resolvedCustomerId = inv.customerId
      const cSlug = inv.customer?.slug ?? String(inv.customerId)
      const iSlug = inv.slug ?? String(resolvedInvoiceId)
      redirect(`/penjualan/tukar-faktur/tambah/pelanggan/${cSlug}/faktur/${iSlug}`)
    }
  }

  const validCustomerId = resolvedCustomerId
  const validInitialInvoiceId = resolvedInvoiceId

  const customers = await prisma.customer.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      paymentTerm: { select: { days: true, isActive: true } },
    },
  })

  const currentCustomer = validCustomerId
    ? customers.find((c) => c.id === validCustomerId)
    : null
  const paymentTermDays = currentCustomer?.paymentTerm?.isActive
    ? currentCustomer.paymentTerm.days
    : null

  let invoices: ExchangeableInvoice[] = []
  if (validCustomerId) {
    const [candidates, alreadyExchanged] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          customerId: validCustomerId,
          deletedAt: null,
          status: { in: ["posted", "partial"] },
        },
        orderBy: { date: "asc" },
        select: { id: true, documentNo: true, date: true, grandTotal: true, paidAmount: true },
      }),
      prisma.invoiceExchangeItem.findMany({
        where: { exchange: { deletedAt: null } },
        select: { salesInvoiceId: true },
      }),
    ])

    const exchanged = new Set(alreadyExchanged.map((item) => item.salesInvoiceId))
    const returnCreditByInvoiceId = await loadReturnCreditByInvoiceId(candidates.map((c) => c.id))
    invoices = candidates
      .filter(
        (invoice) =>
          !isSettled(invoice.grandTotal, Number(invoice.paidAmount) + (returnCreditByInvoiceId.get(invoice.id) ?? 0)),
      )
      .filter((invoice) => !exchanged.has(invoice.id))
      .map((invoice) => ({
        id: invoice.id,
        documentNo: salesInvoiceLabel(invoice),
        date: invoice.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
        grandTotal: Number(invoice.grandTotal),
        paidAmount: Number(invoice.paidAmount),
      }))
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Tukar Faktur", href: "/penjualan/tukar-faktur" },
          { label: "Tambah" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Tambah Tukar Faktur</h1>
      <InvoiceExchangeForm
        customerOptions={customers.map((customer) => ({
          value: customer.slug ?? String(customer.id),
          label: customer.name,
          slug: customer.slug,
          numericId: customer.id,
          paymentTermDays: customer.paymentTerm?.isActive ? customer.paymentTerm.days : null,
        }))}
        customerId={currentCustomer ? (currentCustomer.slug ?? String(currentCustomer.id)) : ""}
        invoices={invoices}
        initialSelectedInvoiceIds={validInitialInvoiceId ? [validInitialInvoiceId] : []}
        paymentTermDays={paymentTermDays}
      />
    </div>
  )
}
