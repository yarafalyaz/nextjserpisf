export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PaymentForm } from "@/components/forms/payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getActivePaymentMethods } from "@/lib/services/method.service"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pembayaran" }

/**
 * Segmen path `faktur/<slug>` → faktur yang langsung terpilih di form.
 * Slug sama dengan yang dipakai URL detail faktur (`009-inv-iro-10-2026`);
 * id numerik tetap diterima sebagai cadangan tautan lama. Kunci tak
 * dikenal dianggap URL yang salah (404), sama seperti pasangan
 * kunci/nilai di halaman absensi dan laporan.
 */
function parsePaymentSegments(segments: string[] | undefined): { invoiceSegment?: string } {
  if (!segments?.length) return {}
  if (segments.length % 2 !== 0) notFound()
  const parsed: { invoiceSegment?: string } = {}
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i]
    const value = segments[i + 1]
    if (key === "faktur" && value) parsed.invoiceSegment = value
    else notFound()
  }
  return parsed
}

export default async function CreatePaymentPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ invoiceId?: string }>
}) {
  await requirePermission("create_sales_payments")
  const params = await searchParams
  const { segments } = await routeParams
  const { invoiceSegment } = parsePaymentSegments(segments)

  // Tautan lama `?invoiceId=<id>` → bentuk path `faktur/<slug>`. Query
  // rusak dibuang ke form polos supaya URL lama tidak beredar lagi.
  if (params.invoiceId !== undefined && invoiceSegment === undefined) {
    const legacyId = Number(params.invoiceId)
    const legacy =
      Number.isInteger(legacyId) && legacyId > 0
        ? await prisma.salesInvoice.findUnique({
            where: { id: legacyId },
            select: { slug: true },
          })
        : null
    redirect(
      legacy?.slug
        ? `/penjualan/pembayaran/tambah/faktur/${legacy.slug}`
        : "/penjualan/pembayaran/tambah",
    )
  }

  // Resolusi segmen `faktur/<slug>` ke faktur nyata. Bentuk tak kanonis
  // (id numerik, awalan slug yang unik seperti `009`) memantul ke URL slug
  // utuh; segmen yang tidak menunjuk faktur mana pun adalah URL salah (404).
  const requestedInvoice = invoiceSegment
    ? await prisma.salesInvoice.findFirst({
        where: {
          OR: [
            { slug: invoiceSegment },
            ...(/^\d+$/.test(invoiceSegment) ? [{ id: Number(invoiceSegment) }] : []),
          ],
        },
        select: { id: true, slug: true, documentNo: true, status: true },
      })
    : null
  if (invoiceSegment && !requestedInvoice) {
    const prefixMatches = await prisma.salesInvoice.findMany({
      where: { slug: { startsWith: invoiceSegment } },
      select: { slug: true },
      take: 2,
    })
    if (prefixMatches.length === 1 && prefixMatches[0].slug) {
      redirect(`/penjualan/pembayaran/tambah/faktur/${prefixMatches[0].slug}`)
    }
    notFound()
  }
  if (requestedInvoice?.slug && invoiceSegment !== requestedInvoice.slug) {
    redirect(`/penjualan/pembayaran/tambah/faktur/${requestedInvoice.slug}`)
  }
  const requestedId = requestedInvoice?.id

  const [invoices, accounts, paymentMethods, withholdingTypes] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: ["posted", "partial"] } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.account.findMany({
      where: { isActive: true, type: "ASSET", code: { startsWith: "1" } },
      orderBy: { code: "asc" },
    }),
    getActivePaymentMethods(),
    // Jenis PPh untuk potongan sisi penjualan (opsional di form).
    prisma.withholdingTaxType.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true, rate: true },
      orderBy: { code: "asc" },
    }),
  ])

  // Faktur yang diminta tetapi di luar daftar bayar (konsep, lunas,
  // dibatalkan) tidak boleh hilang diam-diam di form kosong — jelaskan
  // statusnya supaya operator tahu langkah yang benar.
  const requestedUnpayable =
    requestedInvoice && !invoices.some((inv) => inv.id === requestedInvoice.id)
      ? requestedInvoice
      : null

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Pembayaran", href: "/penjualan/pembayaran" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Terima Pembayaran</h1>
      </div>
      {requestedUnpayable && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Faktur {requestedUnpayable.documentNo} belum bisa dibayar
            </p>
            <p className="text-muted-foreground">
              Status faktur saat ini: {statusLabel(requestedUnpayable.status)}. Pembayaran hanya
              diterima untuk faktur yang sudah diposting.{" "}
              <Link
                href={entityHref("/penjualan/faktur", requestedUnpayable)}
                className="font-medium text-primary underline underline-offset-2"
              >
                Buka faktur untuk mempostingnya
              </Link>
            </p>
          </div>
        </div>
      )}
      <PaymentForm
        invoices={JSON.parse(JSON.stringify(invoices))}
        accounts={accounts}
        defaultInvoiceId={
          requestedId && invoices.some((inv) => inv.id === requestedId) ? requestedId : undefined
        }
        paymentMethods={paymentMethods}
        withholdingTypes={withholdingTypes.map((type) => ({ ...type, rate: Number(type.rate) }))}
      />
    </div>
  )
}
