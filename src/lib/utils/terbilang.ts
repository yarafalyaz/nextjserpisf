/**
 * Terbilang — angka menjadi kata dalam Bahasa Indonesia.
 *
 * Dipakai pada dokumen transaksi (faktur, PO, surat jalan) karena baris
 * "Terbilang" adalah kelaziman dokumen dagang Indonesia dan menjadi pengaman
 * terhadap salah baca nominal.
 *
 * Pure by design (tanpa Prisma/browser) sehingga aturan pengecualian bahasa
 * (sebelas, seratus, seribu) bisa diuji langsung.
 */

const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
]

/** Kata untuk 0–999. */
function under1000(value: number): string {
  if (value < 12) return SATUAN[value]
  if (value < 20) return `${SATUAN[value - 10]} belas`
  if (value < 100) {
    const rest = value % 10
    return `${SATUAN[Math.floor(value / 10)]} puluh${rest ? ` ${SATUAN[rest]}` : ""}`
  }
  const rest = value % 100
  const hundreds = value < 200 ? "seratus" : `${SATUAN[Math.floor(value / 100)]} ratus`
  return `${hundreds}${rest ? ` ${under1000(rest)}` : ""}`
}

const SCALES: { divisor: number; satu: string; banyak: string }[] = [
  { divisor: 1_000_000_000_000, satu: "satu triliun", banyak: "triliun" },
  { divisor: 1_000_000_000, satu: "satu miliar", banyak: "miliar" },
  { divisor: 1_000_000, satu: "satu juta", banyak: "juta" },
  { divisor: 1_000, satu: "seribu", banyak: "ribu" },
]

/** Kata untuk bilangan bulat ≥ 0. */
export function terbilangInteger(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) return "nol"

  for (const scale of SCALES) {
    if (n >= scale.divisor) {
      const head = Math.floor(n / scale.divisor)
      const rest = n % scale.divisor
      // "seribu"/"satu juta"/"satu miliar"/"satu triliun" memakai bentuk khusus
      // hanya bila pengalinya tepat 1.
      const headWords = head === 1 ? scale.satu : `${terbilangInteger(head)} ${scale.banyak}`
      return rest ? `${headWords} ${terbilangInteger(rest)}` : headWords
    }
  }

  return under1000(n)
}

export interface TerbilangOptions {
  /** Akhiran mata uang, mis. "rupiah" (default). Kosongkan untuk angka saja. */
  suffix?: string | null
  /** Sertakan sen bila ada pecahan (default true). */
  withCents?: boolean
}

/**
 * "Terbilang" untuk nominal uang, mis. 1_250_000 → "satu juta dua ratus lima
 * puluh ribu rupiah". Nilai negatif diberi awalan "minus"; pecahan dibulatkan
 * ke sen terdekat.
 */
export function terbilang(value: number, options: TerbilangOptions = {}): string {
  const { suffix = "rupiah", withCents = true } = options
  const negative = value < 0
  const absolute = Math.abs(value)
  const whole = Math.floor(absolute)
  const cents = Math.round((absolute - whole) * 100)

  const parts: string[] = []
  if (negative && (whole > 0 || cents > 0)) parts.push("minus")
  parts.push(terbilangInteger(whole))

  if (suffix) {
    parts.push(
      withCents && cents > 0
        ? `${suffix} ${terbilangInteger(cents)} sen`
        : suffix,
    )
  } else if (withCents && cents > 0) {
    parts.push(`${terbilangInteger(cents)} sen`)
  }

  return parts.join(" ")
}

/** Bentuk siap tampil pada dokumen: huruf awal kapital, mis. "Terbilang: Satu juta rupiah". */
export function terbilangLabel(value: number, suffix = "rupiah"): string {
  const words = terbilang(value, { suffix })
  return words.charAt(0).toUpperCase() + words.slice(1)
}
