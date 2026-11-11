export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/button";
import { DownPaymentForm } from "@/components/forms/down-payment-form";
import { getActivePaymentMethods } from "@/lib/services/method.service";
import { loadDownPaymentFormOptions } from "../../_components/down-payment-options";
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
export const metadata: Metadata = { title: "Tambah Uang Muka" };

const quotationHref = (slug: string) => `/penjualan/uang-muka/tambah/penawaran/${slug}`;
const orderHref = (slug: string) => `/penjualan/uang-muka/tambah/pesanan/${slug}`;

export default async function CreateDownPaymentPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ quotationId?: string; salesOrderId?: string }>;
}) {
  await requirePermission("create_down_payments");

  const params = await searchParams;
  const { segments } = await routeParams;
  const seg = parsePrefillSegments(segments, ["penawaran", "pesanan"]);

  // Tautan lama `?quotationId=`/`?salesOrderId=` → bentuk path.
  if (!seg.penawaran && !seg.pesanan) {
    if (params.quotationId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.quotation, params.quotationId, quotationHref, "/penjualan/uang-muka/tambah");
    }
    if (params.salesOrderId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.salesOrder, params.salesOrderId, orderHref, "/penjualan/uang-muka/tambah");
    }
  }

  let quotationId = seg.penawaran
    ? await resolvePrefillId(prisma.quotation, seg.penawaran, quotationHref)
    : undefined;
  let prefillNotice: string | null = null;

  // Tautan dari detail Pesanan Penjualan mengirim segmen `pesanan/<slug>`.
  // Uang muka tertaut ke PENAWARAN, jadi pesanan itu diterjemahkan ke
  // penawarannya. Pesanan mandiri (tanpa penawaran) memang tidak bisa
  // dibuatkan uang muka penjualan; itu dijelaskan, bukan dibuang diam-diam.
  if (!quotationId && seg.pesanan) {
    const salesOrderId = await resolvePrefillId(prisma.salesOrder, seg.pesanan, orderHref);
    const so = await prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      select: { quotationId: true, documentNo: true },
    });
    if (so?.quotationId) {
      quotationId = so.quotationId;
    } else if (so) {
      prefillNotice =
        `Pesanan Penjualan ${so.documentNo} tidak berasal dari penawaran. ` +
        `Uang muka penjualan hanya bisa dibuat dari Penawaran (berstatus Diterima, Disetujui, atau sudah terkonversi), jadi pilihan awal tidak dipakai.`;
    }
  }

  const [{ customers, quotations }, paymentMethods] = await Promise.all([
    loadDownPaymentFormOptions({ isActive: true, deletedAt: null }),
    getActivePaymentMethods(),
  ]);

  // Pre-fill from quotation if provided
  const preselectedQuotation = quotationId
    ? quotations.find((q) => q.id === quotationId)
    : undefined;
  if (quotationId && !preselectedQuotation && !prefillNotice) {
    prefillNotice =
      `Penawaran #${quotationId} tidak termasuk yang bisa dibuatkan uang muka ` +
      `(harus berstatus Diterima, Disetujui, atau sudah terkonversi). Pilihan awal tidak dipakai.`;
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Uang Muka", href: "/penjualan/uang-muka" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Buat Uang Muka Penjualan</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pencatatan pembayaran uang muka dari pelanggan atas penawaran penjualan yang disetujui.
          </p>
        </div>
      </div>
      {prefillNotice && (
        <Alert variant="destructive">
          <AlertTitle>Pemberitahuan Dokumen Awal</AlertTitle>
          <AlertDescription>{prefillNotice}</AlertDescription>
        </Alert>
      )}
      {quotations.length === 0 && (
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-950 dark:text-amber-200">
          <AlertTitle className="font-semibold text-amber-900 dark:text-amber-100">
            Memerlukan Penawaran yang Disetujui
          </AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            <p>
              Uang muka penjualan hanya dapat dikaitkan dengan Penawaran berstatus{" "}
              <strong>Diterima</strong>, <strong>Disetujui</strong>, atau yang sudah{" "}
              <strong>terkonversi</strong> menjadi Pesanan Penjualan. Penawaran draf harus disetujui terlebih dahulu agar komitmen nilai komersial sah secara akuntansi.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button href="/penjualan/penawaran" size="sm" variant="outline" className="border-amber-600/30 bg-background text-foreground hover:bg-amber-50 dark:hover:bg-amber-950/40">
                Buka Daftar Penawaran
              </Button>
              <Button href="/penjualan/antrean-penawaran" size="sm" variant="ghost" className="text-amber-900 hover:text-amber-950 hover:bg-amber-100/50 dark:text-amber-200 dark:hover:bg-amber-950/60">
                Lihat Antrean Persetujuan
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <DownPaymentForm
        customers={customers}
        quotations={quotations}
        defaultQuotationId={quotationId}
        defaultCustomerId={preselectedQuotation?.customerId}
        paymentMethods={paymentMethods}
      />
    </div>
  );
}
