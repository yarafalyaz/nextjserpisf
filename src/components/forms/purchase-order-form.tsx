"use client";
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { purchaseOrderSchema, type PurchaseOrderInput } from "@/lib/validators";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "@/actions/purchase.actions";
import { AppDatePicker } from "@/components/ui/date-picker";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";
import { toLocalDateOnly } from "@/lib/utils/date-only"

interface PurchaseOrderFormProps {
  vendors: {
    id: number;
    name: string;
    paymentTerm?: { name: string; code: string; days: number } | null;
  }[];
  order?: {
    id: number;
    vendorId: number;
    date: string;
    notes?: string | null;
    paymentTerm?: string | null;
    shippingCost?: number;
    serviceFee?: number;
    items?: Array<{
      itemId: number;
      qty: number;
      unitPrice: number;
      discount?: number;
    }>;
  };
  items: {
    id: number;
    sku: string;
    name: string;
    cost: string;
    unitOfMeasure: string;
  }[];
  defaultPrId?: number;
  purchaseRequests?: {
    id: number;
    documentNo: string;
    title?: string | null;
    vendorId?: number | null;
  }[];
  preselectedPR?: {
    id: number;
    documentNo: string;
    title?: string | null;
    vendorId?: number | null;
    items: { itemId: number; qty: number; notes?: string | null }[];
  } | null;
}

interface POItem {
  itemId: number;
  qty: number;
  unitPrice: number;
  discount: number;
}

export function PurchaseOrderForm({
  vendors,
  items,
  defaultPrId,
  purchaseRequests,
  preselectedPR,
  order,
}: PurchaseOrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isService, setIsService] = useState<boolean>((order as any)?.isService ?? false);
  const [linkedPR, setLinkedPR] = useState<{
    id: number;
    documentNo: string;
    title?: string | null;
    vendorId?: number | null;
  } | null>(
    preselectedPR
      ? {
          id: preselectedPR.id,
          documentNo: preselectedPR.documentNo,
          title: preselectedPR.title,
          vendorId: preselectedPR.vendorId,
        }
      : null,
  );
  const [poItems, setPoItems] = useState<POItem[]>(
    order?.items && order.items.length > 0
      ? order.items.map((it) => ({
          itemId: it.itemId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discount: it.discount ?? 0,
        }))
      : preselectedPR && preselectedPR.items.length > 0
        ? preselectedPR.items.map((it) => {
            const master = items.find((i) => i.id === it.itemId);
            return {
              itemId: it.itemId,
              qty: it.qty,
              unitPrice: master ? Number(master.cost) : 0,
              discount: 0,
            };
          })
        : [{ itemId: 0, qty: 1, unitPrice: 0, discount: 0 }],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      vendorId: order?.vendorId ?? preselectedPR?.vendorId ?? undefined,
      date: order?.date ?? toLocalDateOnly(new Date()),
      notes: order?.notes ?? "",
      paymentTerm:
        order?.paymentTerm ??
        (() => {
          const prVendor = vendors.find((v) => v.id === preselectedPR?.vendorId);
          return prVendor?.paymentTerm?.name || prVendor?.paymentTerm?.code || "";
        })(),
      shippingCost: order?.shippingCost ?? 0,
      serviceFee: (order as any)?.serviceFee ?? 0,
      purchaseRequestId: defaultPrId,
    },
  });

  /** Copy the selected vendor's payment term into the (still editable) PO field. */
  function applyVendorTerm(vendorId: number | undefined) {
    const vendor = vendors.find((v) => v.id === vendorId);
    const term = vendor?.paymentTerm;
    if (term) setValue("paymentTerm", term.name || term.code);
  }

  function handlePRChange(prId: string) {
    const id = prId ? Number(prId) : undefined;
    setValue("purchaseRequestId", id);
    if (!id) {
      setLinkedPR(null);
      return;
    }
    const pr = purchaseRequests?.find((p) => p.id === id);
    setLinkedPR(
      pr
        ? { id: pr.id, documentNo: pr.documentNo, title: pr.title, vendorId: pr.vendorId }
        : null,
    );
    // Suggest the PR's vendor as the PO vendor (still changeable).
    if (pr?.vendorId) {
      setValue("vendorId", pr.vendorId);
      applyVendorTerm(pr.vendorId);
    }
    // Prefill items from the selected PR (only when we have the full PR payload).
    const full = preselectedPR && preselectedPR.id === id ? preselectedPR : null;
    if (full && full.items.length > 0) {
      setPoItems(
        full.items.map((it) => {
          const master = items.find((i) => i.id === it.itemId);
          return {
            itemId: it.itemId,
            qty: it.qty,
            unitPrice: master ? Number(master.cost) : 0,
            discount: 0,
          };
        }),
      );
    }
  }

  function addItem() {
    setPoItems([...poItems, { itemId: 0, qty: 1, unitPrice: 0, discount: 0 }]);
  }

  function removeItem(index: number) {
    setPoItems(poItems.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof POItem, value: number) {
    const updated = [...poItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "itemId") {
      const item = items.find((i) => i.id === value);
      if (item) updated[index].unitPrice = Number(item.cost);
    }
    setPoItems(updated);
  }

  const itemsTotal = poItems.reduce(
    (sum, item) => sum + (item.qty * item.unitPrice - item.discount),
    0,
  );
  const shippingCost = Number(watch("shippingCost")) || 0;
  const serviceFee = Number(watch("serviceFee")) || 0;
  const grandTotal = itemsTotal + shippingCost + serviceFee;

  function onSubmit(data: PurchaseOrderInput) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null)
            formData.append(key, String(value));
        });
        formData.append("items", JSON.stringify(poItems));
        formData.append("isService", isService ? "true" : "false");
        const result = order?.id
          ? await updatePurchaseOrder(order.id, formData)
          : await createPurchaseOrder(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          order?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan",
        );
        router.push("/pembelian/pesanan");
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        {(purchaseRequests && purchaseRequests.length > 0) || linkedPR ? (
          <FormSection title="Permintaan Pembelian" columns={1}>
            {linkedPR ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Terkait Permintaan</span>
                    <Link
                      href={`/pembelian/permintaan/${linkedPR.id}`}
                      className="font-mono text-sm font-medium text-foreground hover:underline"
                    >
                      {linkedPR.documentNo}
                    </Link>
                  </div>
                  {linkedPR.title ? (
                    <span className="text-sm text-muted-foreground">{linkedPR.title}</span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Item &amp; pemasok di bawah terisi dari permintaan ini (pemasok masih bisa diganti).
                  Setelah PO disimpan, permintaan otomatis ditandai dipesan.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Bila PO ini dibuat untuk memenuhi permintaan pembelian, pilih permintaannya di bawah.
              </p>
            )}
            {purchaseRequests && purchaseRequests.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="purchaseRequestId">Permintaan Pembelian (opsional)</Label>
                <Combobox
                  id="purchaseRequestId"
                  value={linkedPR ? String(linkedPR.id) : null}
                  onChange={(key) => handlePRChange(key ?? "")}
                  placeholder="Cari permintaan (No. dokumen)..."
                  options={purchaseRequests.map((p) => ({
                    value: String(p.id),
                    label: p.title ? `${p.documentNo} — ${p.title}` : p.documentNo,
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Kosongkan bila PO tidak terkait permintaan (mis. pembelian langsung).
                </p>
              </div>
            )}
          </FormSection>
        ) : null}

        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendorId">Pemasok *</Label>
            <Controller
              name="vendorId"
              control={control}
              rules={{}}
              render={({ field }) => (
                <Combobox
                  id="vendorId"
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => {
                    const vid = key ? Number(key) : undefined;
                    field.onChange(vid);
                    applyVendorTerm(vid);
                  }}
                  placeholder="Cari pemasok..."
                  options={vendors.map((v) => ({
                    value: String(v.id),
                    label: v.name,
                  }))}
                />
              )}
            />
            {errors.vendorId && (
              <span className="text-xs text-danger mt-1">
                {errors.vendorId.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal"
              name="date"
              value={watch("date")}
              onChange={(val) => setValue("date", val)}
              required
            />
            {errors.date && (
              <span className="text-xs text-danger mt-1">
                {errors.date.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Perkiraan Pengiriman"
              name="expectedDate"
              value={watch("expectedDate")}
              onChange={(val) => setValue("expectedDate", val)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentTerm">Termin Pembayaran</Label>
            <input
              id="paymentTerm"
              {...register("paymentTerm")}
              className="form-input"
              placeholder="Mis. Net 30, COD..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shippingCost">Biaya Pengiriman</Label>
            <Controller
              name="shippingCost"
              control={control}
              render={({ field }) => (
                <CurrencyInput
                  id="shippingCost"
                  value={field.value ?? 0}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="0"
                  prefix="Rp"
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="serviceFee">Biaya Layanan Platform</Label>
            <Controller
              name="serviceFee"
              control={control}
              render={({ field }) => (
                <CurrencyInput
                  id="serviceFee"
                  value={field.value ?? 0}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="0"
                  prefix="Rp"
                />
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Detail" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              rows={2}
              placeholder="Catatan PO..."
            />
          </div>
          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              id="isService"
              checked={isService}
              onChange={(e) => setIsService(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-default"
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="isService">PO Jasa / Subkontrak</Label>
              <p className="text-xs text-muted-foreground">
                Barang pada PO ini adalah jasa/subkontrak (mis. coating, bubut, laser cutting).
                Penerimaan tidak menggerakkan stok — biayanya langsung dibebankan (PRD FAB-08).
              </p>
            </div>
          </div>
        </FormSection>

        <FormSection title="Item" columns={1}>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Barang</h3>
              <Button
                type="button"
                onPress={addItem}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all"
              >
                + Tambah Item
              </Button>
            </div>

            <table
              className="w-full border-collapse"
              style={{ fontSize: "0.8125rem" }}
            >
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: "80px" }}>Jml</th>
                  <th style={{ width: "120px" }}>Harga</th>
                  <th style={{ width: "100px" }}>Diskon</th>
                  <th style={{ width: "120px" }}>Total</th>
                  <th style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {poItems.map((poItem, index) => (
                  <tr key={index}>
                    <td>
                      <Combobox
                        value={poItem.itemId ? String(poItem.itemId) : null}
                        onChange={(key) =>
                          updateItem(index, "itemId", key ? Number(key) : 0)
                        }
                        options={items.map((item) => ({
                          value: String(item.id),
                          label: `${item.sku} - ${item.name}`,
                        }))}
                        placeholder="Pilih Item"
                        className="w-full"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={poItem.qty}
                        onChange={(e) =>
                          updateItem(index, "qty", Number(e.target.value))
                        }
                        className="form-input"
                        style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                        min={1}
                      />
                    </td>
                    <td>
                      <CurrencyInput
                        value={poItem.unitPrice}
                        onChange={(v) => updateItem(index, "unitPrice", v)}
                        className="form-input"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={poItem.discount}
                        onChange={(e) =>
                          updateItem(index, "discount", Number(e.target.value))
                        }
                        className="form-input"
                        style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                        min={0}
                      />
                    </td>
                    <td className="text-right">
                      Rp{" "}
                      {(
                        poItem.qty * poItem.unitPrice -
                        poItem.discount
                      ).toLocaleString("id-ID")}
                    </td>
                    <td>
                      {poItems.length > 1 && (
                        <Button
                          type="button"
                          onPress={() => removeItem(index)}
                          variant="danger-soft"
                          size="sm"
                        >
                          ×
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right">
                    <strong>Total Keseluruhan</strong>
                  </td>
                  <td className="text-right">
                    <strong>Rp {grandTotal.toLocaleString("id-ID")}</strong>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : order?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
