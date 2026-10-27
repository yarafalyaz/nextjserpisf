"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppDatePicker } from "@/components/ui/date-picker";
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload";
import { Plus, Trash2 } from "lucide-react";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Combobox } from "@/components/ui/combobox";
import { QuickAddSelect } from "@/components/ui/quick-add-select";
import { QUICK_ADD } from "@/lib/quick-add/registry";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { nextItemUid } from "@/lib/utils/item-uid"
import {
  LateCostL3Field,
  parseL3TagClient,
  upsertL3Tag,
  removeL3Tag,
} from "./late-cost-l3-field";

interface BillItem {
  itemId: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  /** Kunci baris untuk React; dibuang sebelum dikirim ke server. */
  uid: string;
}

interface VendorBillFormProps {
  vendors: { id: number; name: string }[];
  projects?: { id: number; name: string; documentNo: string | null }[];
  /** Purchase orders selectable to settle. Service POs are tagged "Jasa". */
  purchaseOrders?: {
    id: number;
    documentNo: string;
    vendorId: number;
    isService: boolean;
    grandTotal: number;
  }[];
  /** Jenis pemotongan PPh (PPh 23, PPh 4(2), …) beserta tarifnya. */
  withholdingTypes?: { id: number; name: string; rate: number }[];
  bill?: {
    id: number;
    vendorId: number;
    purchaseOrderId?: number | null;
    projectId?: number | null;
    withholdingTypeId?: number | null;
    withholdingAmount?: number | null;
    date: string;
    dueDate?: string | null;
    notes?: string | null;
    vendorInvoiceNumber?: string | null;
    taxInvoiceNumber?: string | null;
    terms?: string | null;
    items?: Array<{
      itemId: number;
      qty: number;
      unitPrice: number;
      discountPercent?: number;
      taxPercent?: number;
    }>;
  };
  items: {
    id: number;
    sku: string;
    name: string;
    cost: number;
    unitOfMeasure: string;
  }[];
}

export function VendorBillForm({ vendors, projects = [], items, purchaseOrders = [], withholdingTypes = [], bill }: VendorBillFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vendorOptions, setVendorOptions] = useState(vendors);
  const [date, setDate] = useState(
    bill?.date || toLocalDateOnly(new Date()),
  );
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? "");
  const [vendorId, setVendorId] = useState<string | null>(
    bill?.vendorId ? String(bill.vendorId) : null,
  );
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(
    bill?.purchaseOrderId ? String(bill.purchaseOrderId) : null,
  );
  // Jasa maklon per proyek (coating/bending): tagihan ikut HPP proyek.
  const [projectId, setProjectId] = useState<string | null>(
    bill?.projectId ? String(bill.projectId) : null,
  );
  const [withholdingTypeId, setWithholdingTypeId] = useState<string | null>(
    bill?.withholdingTypeId ? String(bill.withholdingTypeId) : null,
  );
  const [withholdingAmount, setWithholdingAmount] = useState<number>(
    bill?.withholdingAmount ?? 0,
  );
  // L3 (F-133-V): penanda hidup di baris pertama notes; field terstruktur di
  // bawah hanya menulis/menghapus baris itu, server pemilik vonis akhir.
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const initialL3 = parseL3TagClient(bill?.notes);
  const [l3Enabled, setL3Enabled] = useState(Boolean(initialL3));
  const [l3WorkOrderNo, setL3WorkOrderNo] = useState(initialL3?.workOrderNo ?? "");
  const [l3Reason, setL3Reason] = useState(initialL3?.reason ?? "");
  // POs offered for settlement: only the selected vendor's POs (keeps the bill
  // and PO vendor consistent) — service POs are included and tagged "Jasa".
  const vendorPurchaseOrders = vendorId
    ? purchaseOrders.filter((po) => String(po.vendorId) === vendorId)
    : purchaseOrders;
  const [billItems, setBillItems] = useState<BillItem[]>(
    bill?.items && bill.items.length > 0
      ? bill.items.map((it) => ({
          itemId: it.itemId ? String(it.itemId) : "",
          qty: it.qty,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0,
          taxPercent: it.taxPercent ?? 0,
          uid: nextItemUid(),
        }))
      : [
          {
            itemId: "",
            qty: 1,
            unitPrice: 0,
            discountPercent: 0,
            taxPercent: 0,
            uid: nextItemUid(),
          },
        ],
  );

  function addItem() {
    setBillItems([
      ...billItems,
      { itemId: "", qty: 1, unitPrice: 0, discountPercent: 0, taxPercent: 0, uid: nextItemUid() },
    ]);
  }

  function removeItem(index: number) {
    setBillItems(billItems.filter((_, i) => i !== index));
  }

  function updateItem(
    index: number,
    field: keyof BillItem,
    value: string | number,
  ) {
    const updated = [...billItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "itemId" && value) {
      const item = items.find((i) => i.id === Number(value));
      if (item) updated[index].unitPrice = Number(item.cost);
    }
    setBillItems(updated);
  }

  function calcLineTotal(item: BillItem) {
    const base = item.qty * item.unitPrice;
    const discount = base * (item.discountPercent / 100);
    const afterDiscount = base - discount;
    const tax = afterDiscount * (item.taxPercent / 100);
    return afterDiscount + tax;
  }

  const subtotal = billItems.reduce(
    (sum, item) => sum + item.qty * item.unitPrice,
    0,
  );
  const totalDiscount = billItems.reduce(
    (sum, item) =>
      sum + (item.qty * item.unitPrice * item.discountPercent) / 100,
    0,
  );
  const totalTax = billItems.reduce((sum, item) => {
    const afterDisc =
      item.qty * item.unitPrice * (1 - item.discountPercent / 100);
    return sum + afterDisc * (item.taxPercent / 100);
  }, 0);
  const grandTotal = subtotal - totalDiscount + totalTax;
  // Base for PPh withholding is the pre-tax amount (DPP).
  const dpp = subtotal - totalDiscount;
  const netPayable = grandTotal - withholdingAmount;

  function applyWithholdingRate(key: string | null) {
    setWithholdingTypeId(key);
    const selected = withholdingTypes.find((t) => String(t.id) === key);
    setWithholdingAmount(
      selected ? Math.round(dpp * (selected.rate / 100) * 100) / 100 : 0,
    );
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget);
        // Lampiran diunggah sebagai baris sementara (referenceId=0) oleh
        // FormAttachmentUpload; ID-nya dibawa lewat hidden input "attachmentIds"
        // di dalam form yang sama — tanpa ini berkasnya yatim permanen.
        const attachmentIdsValue = formData.get("attachmentIds");
        if (attachmentIdsValue) formData.set("attachmentIds", attachmentIdsValue as string);
        formData.set("subtotal", String(subtotal));
        formData.set("tax", String(totalTax));
        formData.set("grandTotal", String(grandTotal));
        formData.set("withholdingAmount", String(withholdingAmount || 0));
        formData.set("items", JSON.stringify(billItems.map(({ uid: _uid, ...rest }) => rest)));
        const { createVendorBill, updateVendorBill } =
          await import("@/actions/purchase.actions");
        const result = bill?.id
          ? await updateVendorBill(bill.id, formData)
          : await createVendorBill(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          bill?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan",
        );
        router.push("/pembelian/tagihan");
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={bill?.id ? "Formulir ubah tagihan pemasok" : "Formulir tambah tagihan pemasok"}
      aria-busy={isPending}
    >
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendorId">Pemasok <span className="text-destructive" aria-hidden="true">*</span></Label>
            <QuickAddSelect
              id="vendorId"
              name="vendorId"
              required
              options={vendorOptions.map((v) => ({
                value: String(v.id),
                label: v.name,
              }))}
              value={vendorId}
              onChange={(value) => {
                setVendorId(value);
                // A PO belongs to exactly one vendor — clear a stale selection
                // when the vendor changes so we cannot book AP to the wrong one.
                if (
                  value &&
                  purchaseOrderId &&
                  !purchaseOrders.some(
                    (po) =>
                      String(po.id) === purchaseOrderId &&
                      String(po.vendorId) === value,
                  )
                ) {
                  setPurchaseOrderId(null);
                }
              }}
              placeholder="Cari pemasok..."
              title={QUICK_ADD.vendor.title}
              fields={QUICK_ADD.vendor.fields}
              action={QUICK_ADD.vendor.action}
              onCreated={(created) => {
                setVendorOptions((prev) => [...prev, { id: created.id, name: created.label }]);
                const value = String(created.id);
                setVendorId(value);
                setPurchaseOrderId(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchaseOrderId">PO Terkait</Label>
            <Combobox
              id="purchaseOrderId"
              options={vendorPurchaseOrders.map((po) => ({
                value: String(po.id),
                label: `${po.documentNo}${po.isService ? " · Jasa" : ""} — ${po.grandTotal.toLocaleString("id-ID")}`,
              }))}
              value={purchaseOrderId}
              onChange={setPurchaseOrderId}
              placeholder="Pilih PO (opsional)..."
            />
            <input type="hidden" name="purchaseOrderId" value={purchaseOrderId ?? ""} />
            <p className="text-xs text-muted-foreground">
              Kaitkan tagihan ke PO agar pencocokan tiga arah berjalan. PO jasa ditandai &quot;Jasa&quot;
              dan bebannya masuk ke akun beban (bukan persediaan).
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="projectId">Project (opsional — isi bila untuk proyek)</Label>
            <Combobox
              id="projectId"
              options={projects.map((p) => ({ value: String(p.id), label: `${p.documentNo ? `${p.documentNo} - ` : ""}${p.name}` }))}
              value={projectId}
              onChange={setProjectId}
              placeholder="Kosongkan bila bukan biaya proyek..."
            />
            <input type="hidden" name="projectId" value={projectId ?? ""} />
            <p className="text-xs text-muted-foreground">
              Jasa maklon (coating/bending) untuk proyek ikut hitung HPP proyek.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal *"
              name="date"
              value={date}
              onChange={setDate}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Jatuh Tempo"
              name="dueDate"
              value={dueDate}
              onChange={setDueDate}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendorInvoiceNumber">No. Faktur Pemasok</Label>
            <Input
              id="vendorInvoiceNumber"
              name="vendorInvoiceNumber"
              placeholder="No. faktur dari pemasok"
              defaultValue={bill?.vendorInvoiceNumber ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxInvoiceNumber">Nomor Faktur Pajak (e-Faktur)</Label>
            <Input
              id="taxInvoiceNumber"
              name="taxInvoiceNumber"
              placeholder="Nomor faktur pajak masukan dari pemasok"
              maxLength={50}
              defaultValue={bill?.taxInvoiceNumber ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="terms">Syarat Pembayaran</Label>
            <Input
              id="terms"
              name="terms"
              placeholder="mis. Net 30"
              defaultValue={bill?.terms ?? ""}
            />
          </div>
        </FormSection>

        <FormSection title="Detail" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Catatan..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Baris penanda L3 dikelola lewat isian di bawah; jangan ketik atau ubah frasa penanda dengan tangan.
            </p>
          </div>
          <LateCostL3Field
            idPrefix="notes"
            enabled={l3Enabled}
            onEnabledChange={(enabled) => {
              setL3Enabled(enabled);
              setNotes((prev) =>
                enabled
                  ? upsertL3Tag(prev, l3WorkOrderNo, l3Reason)
                  : removeL3Tag(prev),
              );
            }}
            workOrderNo={l3WorkOrderNo}
            onWorkOrderNoChange={(value) => {
              setL3WorkOrderNo(value);
              setNotes((prev) => upsertL3Tag(prev, value, l3Reason));
            }}
            reason={l3Reason}
            onReasonChange={(value) => {
              setL3Reason(value);
              setNotes((prev) => upsertL3Tag(prev, l3WorkOrderNo, value));
            }}
          />
        </FormSection>

        <FormSection title="Item" columns={1}>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="text-base font-semibold text-foreground">Item</h3>
              <Button
                type="button"
                onPress={addItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all"
              >
                <Plus size={14} /> Tambah Item
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-default">
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ minWidth: "200px" }}
                    >
                      Item
                    </th>
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ width: "80px" }}
                    >
                      Jml
                    </th>
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ width: "120px" }}
                    >
                      Harga
                    </th>
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ width: "80px" }}
                    >
                      Diskon %
                    </th>
                    <th
                      className="text-left py-2 px-2 font-medium text-secondary"
                      style={{ width: "80px" }}
                    >
                      Pajak %
                    </th>
                    <th
                      className="text-right py-2 px-2 font-medium text-secondary"
                      style={{ width: "120px" }}
                    >
                      Total
                    </th>
                    <th style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {billItems.map((item, idx) => (
                    <tr key={item.uid} className="border-b border-default/50">
                      <td className="py-2 px-2">
                        <Combobox
                          options={items.map((i) => ({
                            value: String(i.id),
                            label: `${i.sku} - ${i.name}`,
                          }))}
                          value={item.itemId || null}
                          onChange={(key) =>
                            updateItem(idx, "itemId", key ? String(key) : "")
                          }
                          placeholder="Cari item..."
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          aria-label={`Jumlah baris ${idx + 1}`}
                          value={String(item.qty)}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "qty",
                              Number.isFinite(Number(e.target.value))
                                ? Number(e.target.value)
                                : 0,
                            )
                          }
                          min={1}
                          className="w-full"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <CurrencyInput
                          value={item.unitPrice}
                          onChange={(v) => updateItem(idx, "unitPrice", v)}
                          min={0}
                          className="w-full"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          aria-label={`Diskon persen baris ${idx + 1}`}
                          value={String(item.discountPercent)}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "discountPercent",
                              Number.isFinite(Number(e.target.value))
                                ? Number(e.target.value)
                                : 0,
                            )
                          }
                          min={0}
                          max={100}
                          step={0.01}
                          className="w-full"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          aria-label={`Pajak persen baris ${idx + 1}`}
                          value={String(item.taxPercent)}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "taxPercent",
                              Number.isFinite(Number(e.target.value))
                                ? Number(e.target.value)
                                : 0,
                            )
                          }
                          min={0}
                          max={100}
                          step={0.01}
                          className="w-full"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-medium">
                        {calcLineTotal(item).toLocaleString("id-ID")}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {billItems.length > 1 && (
                          <Button
                            type="button"
                            onPress={() => removeItem(idx)}
                            aria-label={`Hapus baris ${idx + 1}`}
                            className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-default">
                    <td
                      colSpan={5}
                      className="text-right py-2 px-2 text-sm text-secondary"
                    >
                      Subtotal
                    </td>
                    <td className="text-right py-2 px-2 font-medium">
                      {subtotal.toLocaleString("id-ID")}
                    </td>
                    <td></td>
                  </tr>
                  {totalDiscount > 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-right py-1 px-2 text-sm text-secondary"
                      >
                        Diskon
                      </td>
                      <td className="text-right py-1 px-2 text-danger">
                        -{totalDiscount.toLocaleString("id-ID")}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  {totalTax > 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-right py-1 px-2 text-sm text-secondary"
                      >
                        Pajak
                      </td>
                      <td className="text-right py-1 px-2">
                        {totalTax.toLocaleString("id-ID")}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  <tr>
                    <td
                      colSpan={5}
                      className="text-right py-2 px-2 text-sm font-semibold"
                    >
                      Total Keseluruhan
                    </td>
                    <td className="text-right py-2 px-2 font-bold text-primary">
                      {grandTotal.toLocaleString("id-ID")}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </FormSection>

        <FormSection title="Pemotongan PPh (Opsional)" columns={2}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="withholdingTypeId">Jenis PPh</Label>
            <Combobox
              id="withholdingTypeId"
              value={withholdingTypeId}
              onChange={(key) => applyWithholdingRate(key)}
              placeholder="Tanpa pemotongan"
              options={withholdingTypes.map((t) => ({
                value: String(t.id),
                label: `${t.name} (${t.rate}%)`,
              }))}
            />
            <input type="hidden" name="withholdingTypeId" value={withholdingTypeId ?? ""} />
            <span className="text-xs text-muted-foreground">
              Dasar pemotongan: DPP {dpp.toLocaleString("id-ID")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="withholdingAmount">Nilai PPh Dipotong</Label>
            <CurrencyInput
              id="withholdingAmount"
              value={withholdingAmount}
              onChange={(value) => setWithholdingAmount(value)}
            />
            <span className="text-xs text-muted-foreground">
              Dibayarkan ke pemasok: {netPayable.toLocaleString("id-ID")} (total − PPh)
            </span>
          </div>
        </FormSection>

        <FormSection title="Lainnya" columns={1}>
          <FormAttachmentUpload referenceType="vendor_bill" />
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : bill?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
