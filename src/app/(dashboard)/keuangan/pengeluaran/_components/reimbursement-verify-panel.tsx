"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { showSuccess, showError } from "@/lib/utils/toast"
import { setReimbursementClaimAccounts } from "@/actions/reimbursement.actions"
import { approveExpense, rejectExpense, markExpensePaid } from "@/actions/finance.actions"

interface AccountOption {
  id: number
  code: string
  name: string
  type: string
}

interface ReimbursementVerifyPanelProps {
  expenseId: number
  status: string
  isReimbursementClaim: boolean
  accountId: number
  paidFromAccountId: number | null
  accounts: AccountOption[]
  /**
   * Notice blocker gerbang bayar/setujui dari server (page RSC), verbatim.
   * Non-null = Tandai Dibayar + Setujui Klaim dinonaktifkan; UI tidak
   * menilai sendiri kenapa gerbang tertutup.
   */
  paymentBlockerNotice?: string | null
}

/**
 * Panel verifikasi keuangan klaim reimbursement (F-2026-10-25-017-S).
 * Keuangan WAJIB menetapkan akun beban (dan sumber bayar opsional)
 * lewat setReimbursementClaimAccounts sebelum approve — pengaju tidak
 * pernah memilih akun GL (BR-RB-06). Approve/tolak/bayar memakai aksi
 * pengeluaran existing; error server (bukti/SoD) tampil verbatim.
 */
export function ReimbursementVerifyPanel({
  expenseId,
  status,
  isReimbursementClaim,
  accountId,
  paidFromAccountId,
  accounts,
  paymentBlockerNotice = null,
}: ReimbursementVerifyPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(String(accountId))
  const [paidFromId, setPaidFromId] = useState<string | null>(
    paidFromAccountId != null ? String(paidFromAccountId) : null,
  )

  if (!isReimbursementClaim) return null

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE")
  const assetAccounts = accounts.filter((a) => a.type === "ASSET")
  const isDraft = status === "draft"
  const canApprove = status === "draft" || status === "pending"
  const canMarkPaid = status === "approved"
  const gateBlocked = paymentBlockerNotice != null

  function handleSetAccounts() {
    if (!expenseAccountId) {
      showError("Akun beban wajib dipilih")
      return
    }
    startTransition(async () => {
      const formData = new FormData()
      formData.set("accountId", expenseAccountId)
      if (paidFromId) formData.set("paidFromAccountId", paidFromId)
      const result = await setReimbursementClaimAccounts(expenseId, formData)
      if (result && !result.success) {
        showError(result.error || "Gagal menetapkan akun klaim")
        return
      }
      showSuccess("Akun klaim berhasil ditetapkan")
      router.refresh()
    })
  }

  function handleApprove() {
    startTransition(async () => {
      // Tetapkan akun final dulu (klaim draft), baru approve — satu alur
      // verifikasi supaya J-RB1 memakai accountId final.
      if (isDraft) {
        if (!expenseAccountId) {
          showError("Akun beban wajib dipilih sebelum menyetujui klaim")
          return
        }
        const formData = new FormData()
        formData.set("accountId", expenseAccountId)
        if (paidFromId) formData.set("paidFromAccountId", paidFromId)
        const setResult = await setReimbursementClaimAccounts(expenseId, formData)
        if (setResult && !setResult.success) {
          showError(setResult.error || "Gagal menetapkan akun klaim")
          return
        }
      }
      const result = await approveExpense(expenseId)
      if (result && !result.success) {
        showError(result.error || "Gagal menyetujui klaim")
        return
      }
      showSuccess("Klaim disetujui")
      router.refresh()
    })
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectExpense(expenseId)
      if (result && !result.success) {
        showError(result.error || "Gagal menolak klaim")
        return
      }
      showSuccess("Klaim ditolak")
      router.refresh()
    })
  }

  function handleMarkPaid() {
    startTransition(async () => {
      const result = await markExpensePaid(expenseId)
      if (result && !result.success) {
        showError(result.error || "Gagal menandai klaim dibayar")
        return
      }
      showSuccess("Klaim ditandai dibayar")
      router.refresh()
    })
  }

  return (
    <section
      aria-label="Verifikasi klaim reimbursement"
      className="flex flex-col gap-4 p-4 bg-surface rounded-xl border border-default shadow-sm"
    >
      <h2 className="text-sm font-semibold text-foreground">Verifikasi Klaim Reimbursement</h2>

      {gateBlocked && (
        <p role="alert" className="text-sm text-warning">
          {paymentBlockerNotice}
        </p>
      )}

      {isDraft && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reimbursement-accountId">
              Akun Beban <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <FormSelect
              id="reimbursement-accountId"
              value={expenseAccountId}
              onValueChange={setExpenseAccountId}
              placeholder="-- Pilih akun beban --"
              options={expenseAccounts.map((acc) => ({
                value: String(acc.id),
                label: acc.code ? `${acc.code} - ${acc.name}` : acc.name,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reimbursement-paidFromAccountId">Dibayar Dari (Kas/Bank)</Label>
            <FormSelect
              id="reimbursement-paidFromAccountId"
              value={paidFromId}
              onValueChange={setPaidFromId}
              placeholder="-- Pilih sumber bayar --"
              options={assetAccounts.map((acc) => ({
                value: String(acc.id),
                label: acc.code ? `${acc.code} - ${acc.name}` : acc.name,
              }))}
            />
          </div>
          <div>
            <Button type="button" variant="primary" isDisabled={isPending} onPress={handleSetAccounts}>
              Tetapkan Akun
            </Button>
          </div>
        </div>
      )}

      {(canApprove || canMarkPaid) && (
        <div className="flex flex-wrap gap-2">
          {canMarkPaid && (
            <Button variant="success" size="sm" onPress={handleMarkPaid} isDisabled={isPending || gateBlocked}>
              <CheckCircle size={14} aria-hidden="true" />
              Tandai Dibayar
            </Button>
          )}
          {canApprove && (
            <Button variant="success" size="sm" onPress={handleApprove} isDisabled={isPending || gateBlocked}>
              <CheckCircle size={14} aria-hidden="true" />
              Setujui Klaim
            </Button>
          )}
          {canApprove && (
            <Button variant="danger" size="sm" onPress={handleReject} isDisabled={isPending}>
              <XCircle size={14} aria-hidden="true" />
              Tolak Klaim
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
