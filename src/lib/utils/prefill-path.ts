import { notFound, redirect } from "next/navigation"

/**
 * Prefill "buat dari" lewat segmen path kunci/nilai, menggantikan query
 * `?xxxId=` lama:
 *
 *   /penjualan/pembayaran/tambah/faktur/009-inv-iro-10-2026
 *   /pembelian/tagihan/tambah/po/001-po-iro-10-2026
 *
 * Kontraknya sama di semua halaman tambah:
 * - Segmen adalah pasangan kunci/nilai; kunci tak dikenal, segmen ganjil,
 *   atau kunci ganda berarti URL salah → 404.
 * - Nilai segmen adalah slug kanonis dokumen sumber. Id numerik dan awalan
 *   slug yang unik tetap diterima tetapi memantul (redirect) ke URL slug
 *   utuh, jadi bentuk non-kanonis tidak beredar.
 * - Query lama `?xxxId=<id>` memantul ke bentuk path; query rusak dibuang
 *   ke form polos supaya URL lama berhenti beredar.
 */

interface PrefillDelegate {
  findFirst(args: {
    where: { OR: Array<{ slug: string } | { id: number }> }
    select: { id: true; slug: true }
  }): Promise<{ id: number; slug: string | null } | null>
  findMany(args: {
    where: { slug: { startsWith: string } }
    select: { slug: true }
    take: number
  }): Promise<Array<{ slug: string | null }>>
  findUnique(args: {
    where: { id: number }
    select: { slug: true }
  }): Promise<{ slug: string | null } | null>
}

/**
 * Urai segmen `[[...segments]]` menjadi pasangan kunci/nilai. Mengembalikan
 * objek kosong tanpa segmen; 404 untuk bentuk yang tidak dikenal.
 */
export function parsePrefillSegments(
  segments: string[] | undefined,
  allowedKeys: readonly string[],
): Record<string, string> {
  if (!segments?.length) return {}
  if (segments.length % 2 !== 0) notFound()
  const parsed: Record<string, string> = {}
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i]
    const value = segments[i + 1]
    if (!allowedKeys.includes(key) || !value || parsed[key] !== undefined) notFound()
    parsed[key] = value
  }
  return parsed
}

/**
 * Resolusi satu nilai segmen ke id dokumen sumber. Slug utuh dipakai apa
 * adanya; id numerik / awalan slug unik memantul ke `canonicalHref(slug)`;
 * yang tidak menunjuk dokumen mana pun adalah URL salah (404).
 */
export async function resolvePrefillId(
  delegate: PrefillDelegate,
  segment: string,
  canonicalHref: (slug: string) => string,
): Promise<number> {
  const found = await delegate.findFirst({
    where: {
      OR: [
        { slug: segment },
        ...(/^\d+$/.test(segment) ? [{ id: Number(segment) }] : []),
      ],
    },
    select: { id: true, slug: true },
  })
  if (!found) {
    const prefixMatches = await delegate.findMany({
      where: { slug: { startsWith: segment } },
      select: { slug: true },
      take: 2,
    })
    if (prefixMatches.length === 1 && prefixMatches[0].slug) {
      redirect(canonicalHref(prefixMatches[0].slug))
    }
    notFound()
  }
  if (found.slug && segment !== found.slug) {
    redirect(canonicalHref(found.slug))
  }
  return found.id
}

/**
 * Pantulkan query lama `?xxxId=<id>` ke bentuk path kanonis. Nilai rusak
 * atau dokumen yang sudah tidak ada dibuang ke `fallbackHref` (form polos).
 */
export async function redirectLegacyPrefillQuery(
  delegate: PrefillDelegate,
  rawValue: string,
  canonicalHref: (slug: string) => string,
  fallbackHref: string,
): Promise<never> {
  const legacyId = Number(rawValue)
  const legacy =
    Number.isInteger(legacyId) && legacyId > 0
      ? await delegate.findUnique({
          where: { id: legacyId },
          select: { slug: true },
        })
      : null
  redirect(legacy?.slug ? canonicalHref(legacy.slug) : fallbackHref)
}
