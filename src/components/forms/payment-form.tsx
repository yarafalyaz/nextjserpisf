"use client";
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation";
import { useState, useTransition, type BaseSyntheticEvent } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { salesPaymentSchema, type SalesPaymentInput } from "@/lib/validations/form.schemas"
import {
  createSalesPayment,
  updateSalesPayment,
} from "@/actions/sales.actions";
import { AppDatePicker } from "@/components/ui/date-picker";
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
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

interface PaymentFormProps {
  invoices: {
    id: number;
    documentNo: string;
    grandTotal: string;
    paidAmount: string;
    customer: { name: string };
  }[];
  accounts: { id: number; code: string; name: string }[];
  defaultInvoiceId?: number;
  payment?: {
    id: number;
    salesInvoiceId?: number;
    amount?: number;
    paymentDate?: string;
    paymentMethod?: string;
    referenceNo?: string;
    notes?: string;
    withholdingTypeId?: number;
    withholdingAmount?: number;
    withholdingCertificateNo?: string;
    withholdingDate?: string;
  };
  paymentMethods?: { code: string; name: string }[];
  /** Jenis PPh potong-putut untuk sisi penjualan (Pengaturan → Pajak Potong). */
  withholdingTypes?: { id: number; code: string; name: string; rate: number | null }[];
}

export function PaymentForm({
  invoices,
  accounts,
  defaultInvoiceId,
  payment,
  paymentMethods = [],
  withholdingTypes = [],
}: PaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [accountOptions, setAccountOptions] = useState(accounts);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<SalesPaymentInput>({
    resolver: zodResolver(salesPaymentSchema),
    defaultValues: {
      salesInvoiceId: payment?.salesInvoiceId ?? defaultInvoiceId ?? undefined,
      amount:
        payment?.amount ??
        (defaultInvoiceId
          ? Number(
              invoices.find((i) => i.id === defaultInvoiceId)?.grandTotal ?? 0,
            ) -
            Number(
              invoices.find((i) => i.id === defaultInvoiceId)?.paidAmount ?? 0,
            )
          : 0),
      paymentDate:
        payment?.paymentDate ?? toLocalDateOnly(new Date()),
      paymentMethod: payment?.paymentMethod ?? "",
      referenceNo: payment?.referenceNo ?? "",
      notes: payment?.notes ?? "",
      withholdingTypeId: payment?.withholdingTypeId,
      withholdingAmount: payment?.withholdingAmount ?? 0,
      withholdingCertificateNo: payment?.withholdingCertificateNo ?? "",
      withholdingDate: payment?.withholdingDate ?? "",
    },
  });

  const selectedInvoiceId = watch("salesInvoiceId");
  const selectedInvoice = invoices.find(
    (i) => i.id === Number(selectedInvoiceId),
  );
  const remaining = selectedInvoice
    ? Number(selectedInvoice.grandTotal) - Number(selectedInvoice.paidAmount)
    : 0;

  // Pelunasan piutang = kas diterima + PPh yang dipotong pelanggan. Ditampilkan
  // terang-terangan supaya operator tidak mengira faktur masih bersisa.
  const withholdingAmount = Number(watch("withholdingAmount") ?? 0);
  const cashAmount = Number(watch("amount") ?? 0);
  const settledAmount = cashAmount + withholdingAmount;

  function onSubmit(data: SalesPaymentInput, event?: BaseSyntheticEvent) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null)
            formData.append(key, String(value));
        });
        const nativeFormData = new FormData(event?.target);
        const attachmentIdsValue = nativeFormData.get("attachmentIds");
        if (attachmentIdsValue)
          formData.append("attachmentIds", attachmentIdsValue as string);
        const result = payment?.id
          ? await updateSalesPayment(payment.id, formData)
          : await createSalesPayment(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          payment?.id
            ? "Data berhasil diperbarui"
            : "Data berhasil ditambahkan",
        );
        router.push("/penjualan/pembayaran");
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
      onSubmit={handleSubmit(onSubmit)}
      aria-busy={isPending}
      aria-label={payment?.id ? "Formulir ubah pembayaran" : "Formulir tambah pembayaran"}
    >
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Controller
              name="salesInvoiceId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="salesInvoiceId">Faktur <span className="text-destructive" aria-hidden="true">*</span></Label>
                  <Combobox
                    id="salesInvoiceId"
                    options={invoices.map((inv) => ({
                      value: String(inv.id),
                      label: `${inv.documentNo} - ${inv.customer.name}`,
                    }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) =>
                      field.onChange(key ? Number(key) : undefined)
                    }
                    placeholder="Cari faktur..."
                    required
                  />
                </>
              )}
            />
            {errors.salesInvoiceId && (
              <span className="text-xs text-danger mt-1">
                {errors.salesInvoiceId.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Sisa Tagihan</Label>
            <div
              className="form-input"
              style={{
                background: "var(--bg-tertiary)",
                fontWeight: 600,
                color:
                  remaining > 0
                    ? "var(--color-danger)"
                    : "var(--color-success)",
              }}
            >
              {selectedInvoice
                ? `Rp ${remaining.toLocaleString("id-ID")}`
                : "-"}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Bayar"
              name="paymentDate"
              value={watch("paymentDate")}
              onChange={(val) => setValue("paymentDate", val)}
              required
            />
            {errors.paymentDate && (
              <span className="text-xs text-danger mt-1">
                {errors.paymentDate.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="paymentMethod"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="paymentMethod">Metode Bayar <span className="text-destructive" aria-hidden="true">*</span></Label>
                  <Combobox
                    id="paymentMethod"
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? "")}
                    placeholder="Pilih / ketik metode..."
                    required
                    options={(paymentMethods.length > 0
                      ? paymentMethods
                      : [
                          { code: "transfer", name: "Transfer Bank" },
                          { code: "cash", name: "Tunai" },
                        ]
                    ).map((m) => ({ value: m.code, label: m.name }))}
                  />
                </>
              )}
            />
            {errors.paymentMethod && (
              <span className="text-xs text-danger mt-1">
                {errors.paymentMethod.message}
              </span>
            )}
          </div>
        </FormSection>
        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah Bayar (Rp) <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Controller
              name="amount"
              control={control}
              render={({ field }) => (
                <CurrencyInput
                  id="amount"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="0"
                  prefix="Rp"
                />
              )}
            />
            {errors.amount && (
              <span className="text-xs text-danger mt-1">
                {errors.amount.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="accountId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="accountId">Akun Kas/Bank</Label>
                  <QuickAddSelect
                    id="accountId"
                    options={accountOptions.map((acc) => ({
                      value: String(acc.id),
                      label: acc.code ? `${acc.code} - ${acc.name}` : acc.name,
                    }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) =>
                      field.onChange(key ? Number(key) : undefined)
                    }
                    placeholder="Cari akun..."
                    title={QUICK_ADD.account.title}
                    fields={QUICK_ADD.account.fields}
                    action={QUICK_ADD.account.action}
                    onCreated={(created) => {
                      setAccountOptions((prev) => [
                        ...prev,
                        { id: created.id, code: "", name: created.label },
                      ]);
                      field.onChange(created.id);
                    }}
                  />
                </>
              )}
            />
          </div>
        </FormSection>
        <FormSection title="PPh Dipotong Pelanggan (opsional)">
          <div className="flex flex-col gap-1.5">
            <Controller
              name="withholdingTypeId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="withholdingTypeId">Jenis PPh</Label>
                  <Combobox
                    id="withholdingTypeId"
                    value={field.value ? String(field.value) : null}
                    onChange={(v) => field.onChange(v ? Number(v) : undefined)}
                    placeholder="Tidak dipotong"
                    options={withholdingTypes.map((type) => ({
                      value: String(type.id),
                      label:
                        type.rate !== null && type.rate > 0
                          ? `${type.code} - ${type.name} (${type.rate}%)`
                          : `${type.code} - ${type.name}`,
                    }))}
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="withholdingAmount">Nilai Potongan (Rp)</Label>
            <Controller
              name="withholdingAmount"
              control={control}
              render={({ field }) => (
                <CurrencyInput
                  id="withholdingAmount"
                  value={field.value ?? 0}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="0"
                  prefix="Rp"
                />
              )}
            />
            {errors.withholdingAmount && (
              <span className="text-xs text-danger mt-1">
                {errors.withholdingAmount.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="withholdingCertificateNo">No. Bukti Potong</Label>
            <input
              id="withholdingCertificateNo"
              {...register("withholdingCertificateNo")}
              className="form-input"
              placeholder="Nomor bukti potong dari pelanggan..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Bukti Potong"
              name="withholdingDate"
              value={watch("withholdingDate") ?? ""}
              onChange={(val) => setValue("withholdingDate", val)}
            />
          </div>
          {withholdingAmount > 0 && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Kas diterima Rp {cashAmount.toLocaleString("id-ID")} + potongan PPh Rp{" "}
              {withholdingAmount.toLocaleString("id-ID")} = pelunasan piutang Rp{" "}
              {settledAmount.toLocaleString("id-ID")}. Jurnalnya: kas + PPh dibayar dimuka
              / piutang usaha.
            </p>
          )}
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="referenceNo">No. Referensi</Label>
            <input
              id="referenceNo"
              {...register("referenceNo")}
              className="form-input"
              placeholder="No. referensi / bukti transfer..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              rows={2}
              placeholder="Catatan pembayaran..."
            />
          </div>
          <FormAttachmentUpload referenceType="sales_payment" />
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Memproses..." : "Terima Pembayaran"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
