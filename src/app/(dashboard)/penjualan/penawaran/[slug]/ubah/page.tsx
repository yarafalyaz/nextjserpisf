export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { QuotationForm } from "@/components/forms/quotation-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { LockedEditGuard, lockedDocPreset } from "@/components/ui/locked-edit-guard"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { loadQuotationFormOptions } from "../../_components/quotation-options"
import { buildInvoiceThresholdInfo } from "@/lib/sales/invoice-threshold"
export const metadata: Metadata = { title: "Ubah Penawaran" }

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_quotations")

  const { slug } = await params
  const canEditQuotations = await hasPermission("edit_quotations")

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} as Record<string, never> },
    {
      bySlug: (s, where) =>
        prisma.quotation.findFirst({ where: { slug: s, ...where }, include: { sections: { include: { items: true } } } }),
      byId: (id, where) =>
        prisma.quotation.findUnique({ where: { id, ...where }, include: { sections: { include: { items: true } } } }),
    },
  )

  if (!data) notFound()

  // GL-BR-003 K1: cermin guard server updateQuotation fail-closed
  // (cancelled/setelah-pelunasan-nyata pasti ditolak). Final tanpa
  // pelunasan nyata tetap boleh Ubah (fabrication pre-settlement).
  const _d = data;
  if (!_d) notFound();
  const quotLocked = lockedDocPreset("penawaran", String(_d.slug ?? _d.id))
  function quotLockedGuard() {
    return (
      <LockedEditGuard
        crumbs={quotLocked.crumbs}
        documentLabel={`Penawaran ${_d.documentNo}`}
        correctionLabel={quotLocked.correctionLabel}
        backHref={quotLocked.backHref}
        backLabel={quotLocked.backLabel}
      />
    )
  }
  if (_d.status === "cancelled") {
    return quotLockedGuard()
  }
  const quotationRealSettlementCount = await prisma.salesPayment.count({
    where: {
      NOT: { paymentMethod: "down_payment" },
      salesInvoice: {
        OR: [
          { quotationId: _d.id },
          { salesOrder: { quotationId: _d.id } },
        ],
      },
    },
  })
  if (quotationRealSettlementCount > 0) {
    return quotLockedGuard()
  }

  const { customers, vehicles: customerVehicleOptions, itemsList, paymentMethods, shippingMethods, products, unitOptions } =
    await loadQuotationFormOptions()

  const quotation = {
    ...data,
    date: data.date.toISOString().split("T")[0],
    validUntil: data.validUntil?.toISOString().split("T")[0] ?? null,
    deletedAt: data.deletedAt?.toISOString() ?? null,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
    subtotal: Number(data.subtotal),
    discount: Number(data.discount),
    tax: Number(data.tax),
    grandTotal: Number(data.grandTotal),
    sections: data.sections.map((section) => ({
      ...section,
      createdAt: section.createdAt.toISOString(),
      updatedAt: section.updatedAt.toISOString(),
      items: section.items.map((item) => ({
        ...item,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        total: Number(item.total),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    })),
  }

  const itemOptions = itemsList.map((item) => ({
    ...item,
    price: Number(item.price),
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penawaran", href: "/penjualan/penawaran" },
  { label: "Penawaran", href: "/penjualan/penawaran" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Penawaran</h1>
      </div>
      <QuotationForm
        quotation={quotation}
        invoiceThreshold={buildInvoiceThresholdInfo(
          data.invoiceThresholdPercent == null
            ? null
            : Number(data.invoiceThresholdPercent),
        )}
        canEditQuotations={canEditQuotations}
        customers={customers}
        customerVehicles={customerVehicleOptions}
        items={itemOptions}
        products={products}
        unitOptions={unitOptions}
        paymentMethods={paymentMethods}
        shippingMethods={shippingMethods}
      />
    </div>
  )
}
