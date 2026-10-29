"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { ReasonField } from "@/components/ui/reason-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { showError } from "@/lib/utils/toast";
import { useConfirmReasonAction } from "@/components/ui/confirm-reason-action";
import { writeOffEmployeeLoan } from "@/actions/hrm.actions";
import { formatCurrency } from "@/lib/utils/format";

/**
 * BR-LOAN-08 (F-2026-10-29-162-V): tombol dokumen write-off piutang pinjaman
 * tak tertagih. Status → `written_off`, sisa → 0, bukan objek PPh21.
 *
 * Pola ReversePaymentButton: dialog konfirmasi + alasan wajib (jejak audit)
 * + error service verbatim. Tanggal dokumen wajib — tanpa default hari ini
 * agar operator sadar memilih tanggal bukti, bukan tanggal klik.
 */
export function LoanWriteOffButton({
  loanId,
  remainingAmount,
  onSuccess,
}: {
  loanId: number;
  remainingAmount: number;
  onSuccess?: () => void;
}) {
  const [writeOffDate, setWriteOffDate] = useState("");
  const {
    isPending,
    isOpen,
    setIsOpen,
    reason,
    setReason,
    submit,
    handleOpenChange,
  } = useConfirmReasonAction({
    run: (trimmedReason: string) => {
      const formData = new FormData();
      formData.set("loanId", String(loanId));
      formData.set("writeOffDate", writeOffDate);
      formData.set("reason", trimmedReason);
      return writeOffEmployeeLoan(formData);
    },
    successMessage: "Pinjaman berhasil dihapusbukukan",
    errorFallback: "Gagal menghapusbukukan pinjaman",
    onSuccess,
  });

  function handleWriteOff() {
    if (!writeOffDate) {
      showError("Tanggal write-off wajib diisi");
      return;
    }
    if (!reason.trim()) {
      showError("Alasan write-off wajib diisi");
      return;
    }
    submit();
  }

  function handleOpenChangeWithReset(open: boolean) {
    if (!open) setWriteOffDate("");
    handleOpenChange(open);
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        variant="outline"
        size="sm"
        className="min-h-11 min-w-11 text-danger border-danger/40 hover:bg-danger/10"
        aria-label="Hapusbukukan pinjaman"
      >
        <HandCoins size={15} className="mr-1.5" aria-hidden="true" />
        Hapusbukukan
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={handleOpenChangeWithReset}
        title="Hapusbukukan sisa pinjaman ini?"
        body={`Sisa ${formatCurrency(remainingAmount)} dinolkan dan status menjadi Dihapusbukukan (final, bukan populasi aktif). Jurnal Dr beban write-off / Cr piutang karyawan. Bukan objek PPh21.`}
        confirmLabel="Hapusbukukan"
        cancelLabel="Kembali"
        variant="danger"
        isPending={isPending}
        onConfirm={handleWriteOff}
      >
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor={`writeoff-date-${loanId}`}>
            Tanggal Write-off <span aria-hidden="true" className="text-danger">*</span>
          </Label>
          <Input
            id={`writeoff-date-${loanId}`}
            type="date"
            value={writeOffDate}
            onChange={(e) => setWriteOffDate(e.target.value)}
            disabled={isPending}
            required
          />
        </div>
        <ReasonField
          id={`writeoff-reason-${loanId}`}
          value={reason}
          onChange={setReason}
          disabled={isPending}
          label="Alasan write-off"
          placeholder="Tulis alasan write-off (wajib diisi)"
        />
      </ConfirmDialog>
    </>
  );
}
