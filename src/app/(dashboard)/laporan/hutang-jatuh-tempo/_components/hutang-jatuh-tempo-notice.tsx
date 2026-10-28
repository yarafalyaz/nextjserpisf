import Link from "next/link"

/**
 * Keterangan pembeda D2 (spec 140-S): halaman Hutang Jatuh Tempo HANYA memuat
 * tagihan yang punya tanggal jatuh tempo. Tagihan tanpa jatuh tempo masuk
 * Total Hutang — tautan silang ke sana supaya pembaca tidak salah tafsir
 * selisih kedua angka sebagai kehilangan data.
 */
export function HutangJatuhTempoNotice() {
  return (
    <p
      data-testid="hutang-jatuh-tempo-scope-notice"
      className="print:hidden rounded-lg border border-default bg-surface px-4 py-2.5 text-sm text-muted-foreground"
    >
      Halaman ini tidak termasuk tagihan tanpa tanggal jatuh tempo — lihat{" "}
      <Link
        href="/laporan/total-hutang"
        className="text-primary hover:underline"
        aria-label="Lihat Total Hutang termasuk tagihan tanpa jatuh tempo"
      >
        Total Hutang
      </Link>{" "}
      untuk seluruh kewajiban.
    </p>
  )
}
