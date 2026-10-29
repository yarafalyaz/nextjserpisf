"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  approvePkwtEvent,
  attachPkwtEventToPayroll,
  createPkwtEvent,
  runPkwtAccrual,
} from "@/actions/hrm.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/shadcn/label"

/**
 * F-2026-10-24-132-V: konsumen UI kompensasi akhir kontrak PKWT.
 * Murni presentasi atas read-model getPkwtCompensationReport (loader server):
 * nominal/status/label ditampilkan apa adanya dari builder, UI tidak
 * menghitung ulang masa kerja, nominal, status, atau saldo.
 * Error server tampil verbatim lewat toast.
 */

export interface PkwtReportRowView {
  eventId: number
  employeeId: number
  employeeName: string
  segmentStart: Date
  segmentEnd: Date
  serviceMonths: number
  amount: number
  status: string
  isLegacy: boolean
  accruedToDate: number
  paidAmount: number
  outstandingAmount: number
}

export interface PkwtUnpaidRowView {
  employeeId: number
  name: string
  segmentEnd: Date
  frozenAmount: number
  paidAmount: number
  outstandingAmount: number
  label: string
}

export interface PkwtAnomalyView {
  code: string
  label: string
  detail: string
}

export interface PkwtReportView {
  rows: PkwtReportRowView[]
  glPayableBalance: number
  /** True bila saldo GL tidak se-cakupan rows (saldo satu perusahaan, loader Backend). */
  glIsCompanyWide?: boolean
  /** True bila saldo GL boleh diperbandingkan dengan total scope (scope all). */
  glComparableToScope?: boolean
  expectedPayableTotal: number
  accrualSubledgerTotal: number
  paidSlipTotal: number
  unpaidList: PkwtUnpaidRowView[]
  pendingApprovalSlips: PkwtUnpaidRowView[]
  anomalies: PkwtAnomalyView[]
}

export interface PkwtEmployeeOption {
  id: number
  name: string
  employeeNumber: string | null
}

export interface PkwtDraftSlipOption {
  id: number
  documentNo: string
  employeeId: number | null
  employeeName: string | null
  period: string
}

/** Tabel daftar sisa-biaya bersama label unik (belum-dibayar vs slip-disetujui) */
function PkwtSlipRowsTable({ caption, suffix, rows }: { caption: string; suffix: "paid" | "pending"; rows: PkwtUnpaidRowView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm" aria-label={caption}>
        <thead>
          <tr className="border-b border-default text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Karyawan</th>
            <th scope="col" className="px-3 py-2 font-medium">Akhir Segmen</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Nominal Terbekukan</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Terbayar</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Sisa</th>
            <th scope="col" className="px-3 py-2 font-medium">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.employeeId}-${row.segmentEnd.toISOString()}-${suffix}`} className="border-b border-default last:border-0">
              <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-2">{formatDate(row.segmentEnd)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(row.frozenAmount)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(row.paidAmount)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(row.outstandingAmount)}</td>
              <td className="px-3 py-2">{row.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ActionResult {
  success: boolean
  error?: string
}

export function PkwtCompensationPanel({
  report,
  employees,
  draftSlips,
  canCreate,
  canApprove,
  canRunAccrual,
  canAttach,
}: {
  report: PkwtReportView
  employees: PkwtEmployeeOption[]
  draftSlips: PkwtDraftSlipOption[]
  canCreate: boolean
  canApprove: boolean
  canRunAccrual: boolean
  canAttach: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<ActionResult>, ok: string) {
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.success) {
          showError(result.error || "Gagal menjalankan aksi kompensasi PKWT")
          return
        }
        showSuccess(ok)
        router.refresh()
      } catch {
        showError("Gagal menjalankan aksi kompensasi PKWT")
      }
    })
  }

  const approvedRows = report.rows.filter((r) => r.status === "approved")

  return (
    <section
      aria-labelledby="pkwt-heading"
      className="rounded-xl border border-default bg-surface shadow-sm overflow-hidden"
    >
      <div className="border-b border-default p-4 px-5">
        <h2 id="pkwt-heading" className="text-base font-semibold text-foreground">
          Kompensasi Akhir Kontrak PKWT
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Peristiwa per segmen kontrak terbekukan dari server. Nominal, masa kerja,
          dan status ditampilkan apa adanya — pembayaran hanya lewat slip gaji dari
          peristiwa yang sudah disetujui.
        </p>
      </div>

      <div className="flex flex-col gap-6 p-4 px-5">
        {canCreate && (
          <form
            aria-label="Formulir peristiwa kompensasi PKWT"
            aria-busy={isPending}
            onSubmit={(e) => {
              e.preventDefault()
              run(
                () => createPkwtEvent(new FormData(e.currentTarget)),
                "Peristiwa kompensasi PKWT dibuat",
              )
            }}
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-employee">
                Karyawan PKWT <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <select
                id="pkwt-employee"
                name="employeeId"
                required
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              >
                <option value="">Pilih karyawan...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                    {emp.employeeNumber ? ` (${emp.employeeNumber})` : ""}
                  </option>
                ))}
              </select>
              {employees.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Tidak ada karyawan berstatus PKWT aktif.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-segment-start">
                Mulai Segmen <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <input
                id="pkwt-segment-start"
                name="segmentStart"
                type="date"
                required
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-segment-end">
                Akhir Segmen <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <input
                id="pkwt-segment-end"
                name="segmentEnd"
                type="date"
                required
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-agreement-amount">Nominal Kesepakatan (usaha mikro/kecil)</Label>
              <CurrencyInput
                id="pkwt-agreement-amount"
                name="agreementAmount"
                prefix="Rp"
                placeholder="Kosongkan untuk rumus umum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-agreement-ref">Referensi Dokumen Kesepakatan</Label>
              <input
                id="pkwt-agreement-ref"
                name="agreementDocumentRef"
                type="text"
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
                placeholder="Wajib bila nominal kesepakatan diisi"
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label htmlFor="pkwt-is-legacy" className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                <input id="pkwt-is-legacy" name="isLegacy" type="checkbox" value="1" className="size-4" />
                Peristiwa lama (legacy, sekaligus)
              </label>
              <Button type="submit" variant="primary" isDisabled={isPending || employees.length === 0}>
                {isPending ? "Menyimpan..." : "Buat Peristiwa"}
              </Button>
            </div>
          </form>
        )}

        {canRunAccrual && (
          <form
            aria-label="Formulir akrual kompensasi PKWT"
            aria-busy={isPending}
            onSubmit={(e) => {
              e.preventDefault()
              const period = String(new FormData(e.currentTarget).get("period") ?? "")
              run(() => runPkwtAccrual(period), "Akrual kompensasi PKWT dijalankan")
            }}
            className="flex flex-wrap items-end gap-3 border-t border-default pt-5"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-accrual-period">
                Periode Akrual <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <input
                id="pkwt-accrual-period"
                name="period"
                type="month"
                required
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              />
            </div>
            <Button type="submit" variant="secondary" isDisabled={isPending}>
              {isPending ? "Menjalankan..." : "Jalankan Akrual Bulan Ini"}
            </Button>
          </form>
        )}

        <div aria-label="Daftar peristiwa kompensasi PKWT">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Peristiwa Kompensasi</h3>
          {report.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada peristiwa kompensasi PKWT.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm" aria-label="Daftar peristiwa kompensasi PKWT">
                <thead>
                  <tr className="border-b border-default text-left text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-medium">Karyawan</th>
                    <th scope="col" className="px-3 py-2 font-medium">Segmen</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Masa Kerja (bulan)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Nominal Peristiwa</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Terakrual</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Terbayar via Slip</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Sisa Utang</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    {canApprove && <th scope="col" className="px-3 py-2 font-medium">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.eventId} className="border-b border-default last:border-0">
                      <td className="px-3 py-2 font-medium text-foreground">
                        {row.employeeName}
                        {row.isLegacy && (
                          <span className="ml-2 rounded-full border border-default px-2 py-0.5 text-xs text-muted-foreground">
                            Legacy
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {formatDate(row.segmentStart)} – {formatDate(row.segmentEnd)}
                      </td>
                      <td className="px-3 py-2 text-right">{row.serviceMonths}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.amount)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.accruedToDate)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.paidAmount)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.outstandingAmount)}</td>
                      <td className="px-3 py-2">
                        <StatusChip status={row.status} />
                      </td>
                      {canApprove && (
                        <td className="px-3 py-2">
                          {row.status === "draft" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              isDisabled={isPending}
                              onClick={() =>
                                run(() => approvePkwtEvent(row.eventId), "Peristiwa kompensasi PKWT disetujui")
                              }
                            >
                              Setujui
                            </Button>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {canAttach && (
          <form
            aria-label="Formulir tarik kompensasi PKWT ke slip"
            aria-busy={isPending}
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const payrollId = Number(fd.get("payrollId"))
              const submit = new FormData()
              submit.set("eventId", String(fd.get("eventId") ?? ""))
              run(
                () => attachPkwtEventToPayroll(payrollId, submit),
                "Kompensasi PKWT ditarik ke slip gaji",
              )
            }}
            className="grid grid-cols-1 gap-4 border-t border-default pt-5 md:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-attach-event">
                Peristiwa Disetujui <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <select
                id="pkwt-attach-event"
                name="eventId"
                required
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              >
                <option value="">Pilih peristiwa...</option>
                {approvedRows.map((row) => (
                  <option key={row.eventId} value={row.eventId}>
                    {row.employeeName} — {formatDate(row.segmentStart)} – {formatDate(row.segmentEnd)} — {formatCurrency(row.amount)}
                  </option>
                ))}
              </select>
              {approvedRows.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada peristiwa berstatus disetujui untuk ditarik ke slip.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkwt-attach-payroll">
                Slip Draf Tujuan <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <select
                id="pkwt-attach-payroll"
                name="payrollId"
                required
                className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
              >
                <option value="">Pilih slip draf...</option>
                {draftSlips.map((slip) => (
                  <option key={slip.id} value={slip.id}>
                    {slip.documentNo} — {slip.employeeName ?? "-"} — {slip.period}
                  </option>
                ))}
              </select>
              {draftSlips.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada slip gaji berstatus draf.
                </p>
              )}
            </div>
            <div className="flex items-end justify-end">
              <Button
                type="submit"
                variant="primary"
                isDisabled={isPending || approvedRows.length === 0 || draftSlips.length === 0}
              >
                {isPending ? "Menarik..." : "Tarik ke Slip"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-3">
              Nominal slip wajib sama dengan nominal peristiwa penuh — pembayaran parsial ditolak server.
            </p>
          </form>
        )}

        <div aria-label="Rekonsiliasi kompensasi PKWT" className="border-t border-default pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Rekonsiliasi Kompensasi PKWT</h3>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-default bg-surface-secondary/40 p-3">
              <dt className="text-xs text-muted-foreground">
                Saldo GL Utang Kompensasi (210207)
                {report.glIsCompanyWide && " — saldo perusahaan"}
              </dt>
              <dd className="text-base font-semibold text-foreground">{formatCurrency(report.glPayableBalance)}</dd>
              {report.glIsCompanyWide && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Saldo GL mencakup seluruh perusahaan; baris dan total lain di panel ini hanya karyawan dalam cakupan Anda, jadi saldo GL tidak diperbandingkan dengan total panel.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-default bg-surface-secondary/40 p-3">
              <dt className="text-xs text-muted-foreground">Utang Seharusnya (peristiwa terbekukan − slip terbayar)</dt>
              <dd className="text-base font-semibold text-foreground">{formatCurrency(report.expectedPayableTotal)}</dd>
            </div>
            <div className="rounded-lg border border-default bg-surface-secondary/40 p-3">
              <dt className="text-xs text-muted-foreground">Total Subledger Akrual</dt>
              <dd className="text-base font-semibold text-foreground">{formatCurrency(report.accrualSubledgerTotal)}</dd>
            </div>
            <div className="rounded-lg border border-default bg-surface-secondary/40 p-3">
              <dt className="text-xs text-muted-foreground">Total Terbayar via Slip</dt>
              <dd className="text-base font-semibold text-foreground">{formatCurrency(report.paidSlipTotal)}</dd>
            </div>
          </dl>

          {report.anomalies.length > 0 && (
            <ul aria-label="Temuan rekonsiliasi kompensasi PKWT" className="mt-4 flex flex-col gap-2">
              {report.anomalies.map((a) => (
                <li key={a.code} role="alert" className="rounded-lg border border-default bg-surface-secondary/40 p-3 text-sm">
                  <span className="font-medium text-foreground">{a.label}: </span>
                  <span className="text-muted-foreground">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div aria-label="Kompensasi PKWT belum dibayar" className="border-t border-default pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Kompensasi PKWT belum dibayar</h3>
          {report.unpaidList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada kompensasi PKWT belum dibayar.
            </p>
          ) : (
<PkwtSlipRowsTable caption="Daftar kompensasi PKWT belum dibayar" suffix="paid" rows={report.unpaidList} />
          )}
        </div>

        <div aria-label="Slip disetujui mengandung kompensasi PKWT" className="border-t border-default pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Slip Disetujui Mengandung Kompensasi PKWT (Menunggu Pembayaran)
          </h3>
          {report.pendingApprovalSlips.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada slip disetujui yang mengandung baris kompensasi PKWT.
            </p>
          ) : (
<PkwtSlipRowsTable caption="Daftar slip disetujui mengandung kompensasi PKWT" suffix="pending" rows={report.pendingApprovalSlips} />
          )}
        </div>
      </div>
    </section>
  )
}
