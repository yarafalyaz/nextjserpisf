import { DetailField } from "@/components/ui/detail-card"
import { formatCurrencyExact } from "@/lib/utils/format"
import type { OvertimeBaseSnapshot } from "@/lib/reports/overtime-base-snapshot-data"

/**
 * Rincian snapshot dasar upah lembur yang dibekukan saat persetujuan.
 *
 * Server membedakan dua keadaan yang sama-sama datang sebagai snapshot null:
 * pemanggil berizin yang barisnya belum punya snapshot (tampil status
 * eksplisit) dan pemanggil tanpa izin (rincian tidak dirender sama sekali).
 * Komponen ini hanya me-render angka yang dikirim loader apa adanya.
 */
export function OvertimeBaseSnapshotFields({
  canViewPayroll,
  snapshot,
}: Readonly<{
  canViewPayroll: boolean
  snapshot: OvertimeBaseSnapshot | null
}>) {
  if (!canViewPayroll) return null

  if (!snapshot) {
    return (
      <DetailField
        label="Dasar Upah Lembur"
        value="Rincian dasar upah lembur belum tercatat untuk baris ini."
      />
    )
  }

  return (
    <>
      <DetailField label="Gaji Pokok" value={formatCurrencyExact(snapshot.baseSalary)} />
      {snapshot.components.map((component) => (
        <DetailField
          key={component.name}
          label={component.name}
          value={formatCurrencyExact(component.amount)}
        />
      ))}
      {(snapshot.variableComponents ?? []).map((component) => (
        <DetailField
          key={component.name}
          label={`${component.name} (tidak tetap)`}
          value={formatCurrencyExact(component.amount)}
        />
      ))}
      {snapshot.floor75Applied ? (
        <DetailField
          label="Lantai 75% Upah Total (PP 36/2021)"
          value="Berlaku — pokok + tunjangan tetap di bawah 75% upah total"
        />
      ) : null}
      <DetailField label="Dasar Upah Lembur" value={formatCurrencyExact(snapshot.baseTotal)} />
    </>
  )
}
