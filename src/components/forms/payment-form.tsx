"use client";
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation";
import { useTransition, type BaseSyntheticEvent } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { salesPaymentSchema, type SalesPaymentInput } from "@/lib/validators";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

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
    notes?: string;
  };
  paymentMethods?: { code: string; name: string }[];
}

export function PaymentForm({
  invoices,
  accounts,
  defaultInvoiceId,
  payment,
  paymentMethods = [],
}: PaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
        payment?.paymentDate ?? new Date().toISOString().split("T")[0],
      paymentMethod: payment?.paymentMethod ?? "",
      notes: payment?.notes ?? "",
    },
  });

  const selectedInvoiceId = watch("salesInvoiceId");
  const selectedInvoice = invoices.find(
    (i) => i.id === Number(selectedInvoiceId),
  );
  const remaining = selectedInvoice
    ? Number(selectedInvoice.grandTotal) - Number(selectedInvoice.paidAmount)
    : 0;

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
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Controller
              name="salesInvoiceId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="salesInvoiceId">Faktur *</Label>
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
                  <Label htmlFor="paymentMethod">Metode Bayar *</Label>
                  <Combobox
                    id="paymentMethod"
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? "")}
                    placeholder="Pilih / ketik metode..."
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
            <Label htmlFor="amount">Jumlah Bayar (Rp) *</Label>
            <Controller
              name="amount"
              control={control}
              render={({ field }) => (
                <CurrencyInput
                  id="amount"
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
                  <Combobox
                    id="accountId"
                    options={accounts.map((acc) => ({
                      value: String(acc.id),
                      label: `${acc.code} - ${acc.name}`,
                    }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) =>
                      field.onChange(key ? Number(key) : undefined)
                    }
                    placeholder="Cari akun..."
                  />
                </>
              )}
            />
          </div>
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
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
