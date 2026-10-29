"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppDatePicker } from "@/components/ui/date-picker";
import { recordEmployeeLoanCashRepayment } from "@/actions/hrm.actions";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { QuickAddSelect } from "@/components/ui/quick-add-select";
import { QUICK_ADD } from "@/lib/quick-add/registry";
import { CurrencyInput } from "@/components/ui/currency-input";
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";

/**
 * BR-LOAN-07 (F-2026-10-29-162-V): form dokumen setoran tunai pinjaman.
 *
 * Murni pemanggil aksi `recordEmployeeLoanCashRepayment` — nominal, jurnal,
 * dan status lunas/aktif dihitung server. Kelebihan di atas sisa ditolak
 * berisik oleh server (default dikembalikan, bukan dipotong diam-diam);
 * pesan error server ditampilkan verbatim.
 */
export function LoanCashRepaymentForm({
  loanId,
  remainingAmount,
  accounts,
  redirectTo,
}: {
  loanId: number;
  remainingAmount: number;
  accounts: { id: number; code: string; name: string }[];
  /** Tujuan sesudah simpan berhasil. Default kembali ke daftar pinjaman. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);
  const [accountOptions, setAccountOptions] = useState(accounts);

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget);
        formData.set("loanId", String(loanId));
        const result = await recordEmployeeLoanCashRepayment(formData);
        if (!result.success) {
          showError(result.error || "Gagal menyimpan setoran");
          return;
        }
        showSuccess("Setoran tunai berhasil dicatat");
        router.push(redirectTo ?? "/sdm/pinjaman");
        router.refresh();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan setoran");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label="Formulir setoran tunai pinjaman">
      <FormCard>
        <FormSection title="Setoran Tunai">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <p className="text-sm text-muted-foreground">
              Sisa pinjaman saat ini:{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatCurrency(remainingAmount)}
              </span>
              . Setoran melebihi sisa ditolak — kelebihan dikembalikan ke karyawan.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repaymentAmount">
              Nominal Setoran (Rp) <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <CurrencyInput
              id="repaymentAmount"
              name="amount"
              placeholder="0"
              required
              prefix="Rp"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repaymentCashAccount">
              Akun Kas/Bank Penerima <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <QuickAddSelect
              id="repaymentCashAccount"
              name="cashAccountId"
              required
              value={cashAccountId}
              onChange={(key) => setCashAccountId(key)}
              placeholder="Cari akun kas/bank..."
              options={accountOptions.map((acc) => ({
                value: String(acc.id),
                label: acc.code ? `${acc.code} - ${acc.name}` : acc.name,
              }))}
              title={QUICK_ADD.account.title}
              fields={QUICK_ADD.account.fields}
              action={QUICK_ADD.account.action}
              onCreated={(created) => {
                setAccountOptions((prev) => [
                  ...prev,
                  { id: created.id, code: "", name: created.label },
                ]);
                setCashAccountId(String(created.id));
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal Setoran *" name="repaymentDate" onChange={() => {}} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repaymentNotes">
              Bukti Setoran <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="repaymentNotes"
              name="notes"
              rows={3}
              required
              placeholder="Nomor bukti/kwitansi setoran (wajib diisi)"
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : "Catat Setoran"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
