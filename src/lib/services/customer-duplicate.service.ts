/**
 * F-2026-10-25-003-S (BR-CD-01..10, AC-CD-B1..B7): peringatan duplikat
 * pelanggan tahap 1 — PERINGATAN advisory, BUKAN blokir keras. Simpan
 * tetap berhasil; respons memuat kandidat terstruktur. Pengecualian:
 * gerbang NPWP persis Q-CD-1 (PUTUSAN Lead PR #901) di bawah — NPWP
 * ternormalisasi sama terisi dua sisi = BLOKIR sebelum simpan; kunci
 * lain tetap advisory persis seperti sebelumnya.
 *
 * Keputusan fisik Backend (Q-CD-3, wilayah Backend):
 * - Telepon: REUSE `normalizeWhatsappPhone` (whatsapp.ts) — satu-satunya
 *   normalisasi telepon repo; jangan karang aturan kedua. Nomor yang
 *   gagal normalisasi (<11 digit / non-62) TIDAK cocok, bukan error.
 * - NPWP (taxId): buang semua non-digit; hasil kosong (null, "", "0"
 *   tanpa digit bermakna? lihat normalizeCustomerTaxId) = bukan kunci.
 *   Catatan EC-3 spec: NPWP kosong vs "0"/strip saja -> kosong. "0"
 *   tunggal dinormalisasi menjadi "" (ditolak) karena bukan NPWP sah
 *   dan akan menggrupkan semua pelanggan berekor "0".
 * - Nama: trim + lipat spasi ganda + lowercase (BR-CD-02c, EC-5).
 * - Email: trim + lowercase, pola normalizeLeadEmail (lead-duplicate).
 *
 * Kandidat lahir (BR-CD-03) bila salah satu:
 *   telepon ternormalisasi sama DAN terisi, ATAU
 *   NPWP ternormalisasi sama DAN terisi, ATAU
 *   nama ternormalisasi sama DAN (email sama terisi ATAU telepon sama).
 * Nama sama sendirian BUKAN kandidat (BR-CD-03, AC-CD-B3).
 *
 * Cakupan (BR-CD-06): hanya isActive=true AND deletedAt IS NULL, tidak
 * termasuk pelanggan yang sedang diedit (excludeCustomerId).
 * Urutan (BR-CD-07): jenis kunci npwp > phone > name_secondary, lalu
 * nama, lalu id.
 *
 * Query tidak bisa exact-match di SQL (kolom mentah format bebas):
 * loader ambil pelanggan aktif ber-kontak (phone/taxId/email/name
 * non-null), normalisasi di memori, banding persis. Tanpa batas scan
 * tak terbatas: dibatasi take MAX_CANDIDATE_SCAN.
 */
import { prisma, type TxClient } from "@/lib/db/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils/whatsapp";

export const CUSTOMER_DUPLICATE_WARNING_TITLE = "Kemungkinan pelanggan ganda";
export const CUSTOMER_DUPLICATE_WARNING_BODY =
  "Data ini cocok dengan pelanggan yang sudah ada. Periksa dulu — pelanggan ganda membagi penawaran, faktur, kendaraan, dan piutang ke dua master.";
export const CUSTOMER_REUSED_MESSAGE =
  "Pelanggan sudah ada — data lama dipakai kembali, tidak dibuat ganda.";

export const MAX_CANDIDATE_SCAN = 2000;

export type CustomerMatchKind = "npwp" | "phone" | "name_secondary";

export const CUSTOMER_MATCH_LABEL: Record<CustomerMatchKind, string> = {
  npwp: "NPWP sama",
  phone: "Nomor telepon sama",
  name_secondary: "Nama dan kontak sama",
};

const MATCH_RANK: Record<CustomerMatchKind, number> = {
  npwp: 0,
  phone: 1,
  name_secondary: 2,
};

export function normalizeCustomerPhoneKey(
  phone: string | null | undefined,
): string | null {
  return normalizeWhatsappPhone(phone);
}

/** NPWP: digit saja; kosong/"0"-saja/strip saja -> null (EC-3). */
export function normalizeCustomerTaxIdKey(
  taxId: string | null | undefined,
): string | null {
  if (!taxId) return null;
  const digits = taxId.replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return null;
  return digits;
}

export function normalizeCustomerNameKey(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  const normalized = name.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized ? normalized : null;
}

export function normalizeCustomerEmailKey(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized ? normalized : null;
}

export interface CustomerDuplicateKeys {
  nameKey: string | null;
  phoneKey: string | null;
  taxIdKey: string | null;
  emailKey: string | null;
}

export function customerDuplicateKeys(input: {
  name?: string | null;
  phone?: string | null;
  taxId?: string | null;
  email?: string | null;
}): CustomerDuplicateKeys {
  return {
    nameKey: normalizeCustomerNameKey(input.name),
    phoneKey: normalizeCustomerPhoneKey(input.phone),
    taxIdKey: normalizeCustomerTaxIdKey(input.taxId),
    emailKey: normalizeCustomerEmailKey(input.email),
  };
}

/**
 * Jenis kecocokan kandidat terhadap kunci input, atau null.
 * Prioritas pelaporan per baris: npwp > phone > name_secondary
 * (BR-CD-07); satu baris dilaporkan sekali dengan jenis terkuatnya.
 */
export function customerDuplicateMatchKind(
  candidate: {
    name?: string | null;
    phone?: string | null;
    taxId?: string | null;
    email?: string | null;
  },
  keys: CustomerDuplicateKeys,
): CustomerMatchKind | null {
  const taxIdMatch =
    keys.taxIdKey != null &&
    normalizeCustomerTaxIdKey(candidate.taxId) === keys.taxIdKey;
  if (taxIdMatch) return "npwp";

  const phoneMatch =
    keys.phoneKey != null &&
    normalizeCustomerPhoneKey(candidate.phone) === keys.phoneKey;
  if (phoneMatch) return "phone";

  const nameMatch =
    keys.nameKey != null &&
    normalizeCustomerNameKey(candidate.name) === keys.nameKey;
  if (nameMatch) {
    const emailMatch =
      keys.emailKey != null &&
      normalizeCustomerEmailKey(candidate.email) === keys.emailKey;
    if (emailMatch) return "name_secondary";
  }
  return null;
}

export interface CustomerDuplicateCandidate {
  id: number;
  slug: string | null;
  name: string;
  code: string | null;
  /** Telepon tampil apa adanya (master pelanggan terlihat pemegang view_customers; tanpa masking — spec §4). */
  phone: string | null;
  email: string | null;
  taxId: string | null;
  matchKind: CustomerMatchKind;
  matchLabel: string;
}

export interface CustomerDuplicateWarning {
  title: typeof CUSTOMER_DUPLICATE_WARNING_TITLE;
  body: typeof CUSTOMER_DUPLICATE_WARNING_BODY;
  candidates: CustomerDuplicateCandidate[];
}

interface CustomerRow {
  id: number;
  slug: string | null;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
}

const CANDIDATE_SELECT = {
  id: true,
  slug: true,
  name: true,
  code: true,
  phone: true,
  email: true,
  taxId: true,
} as const;

function compareCandidates(
  a: CustomerDuplicateCandidate,
  b: CustomerDuplicateCandidate,
): number {
  const rank = MATCH_RANK[a.matchKind] - MATCH_RANK[b.matchKind];
  if (rank !== 0) return rank;
  const byName = a.name.localeCompare(b.name, "id");
  if (byName !== 0) return byName;
  return a.id - b.id;
}

/**
 * Kandidat duplikat untuk satu input pelanggan (buat/ubah).
 * Hanya pelanggan aktif non-deleted (BR-CD-06). `db` injectable untuk
 * tes; default prisma global. Peringatan advisory — pemanggil tetap
 * menyimpan (BR-CD-04).
 */
export async function findCustomerDuplicateCandidates(
  input: {
    name?: string | null;
    phone?: string | null;
    taxId?: string | null;
    email?: string | null;
    excludeCustomerId?: number;
  },
  db: TxClient | typeof prisma = prisma,
): Promise<CustomerDuplicateCandidate[]> {
  const keys = customerDuplicateKeys(input);
  if (
    keys.taxIdKey == null &&
    keys.phoneKey == null &&
    !(keys.nameKey != null && keys.emailKey != null)
  ) {
    return [];
  }

  const rows = (await db.customer.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(input.excludeCustomerId != null
        ? { id: { not: input.excludeCustomerId } }
        : {}),
      OR: [
        { phone: { not: null } },
        { taxId: { not: null } },
        { email: { not: null } },
      ],
    },
    select: CANDIDATE_SELECT,
    orderBy: { id: "asc" },
    take: MAX_CANDIDATE_SCAN,
  })) as CustomerRow[];

  const candidates: CustomerDuplicateCandidate[] = [];
  for (const row of rows) {
    const kind = customerDuplicateMatchKind(row, keys);
    if (!kind) continue;
    candidates.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      code: row.code,
      phone: row.phone,
      email: row.email,
      taxId: row.taxId,
      matchKind: kind,
      matchLabel: CUSTOMER_MATCH_LABEL[kind],
    });
  }
  candidates.sort(compareCandidates);
  return candidates;
}

// ==================== Q-CD-1: gerbang BLOKIR NPWP persis ====================

export interface CustomerNpwpConflict {
  id: number;
  slug: string | null;
  name: string;
  code: string | null;
}

/**
 * PUTUSAN Lead Q-CD-1 (PR #901): NPWP ternormalisasi PERSIS terisi di dua
 * sisi = pelanggan lain sudah memegang NPWP itu -> BLOKIR sebelum
 * create/update customer. NPWP ternormalisasi kosong (kosong/"0"/strip
 * saja, EC-3 003-S) BUKAN konflik. `excludeCustomerId` = pelanggan yang
 * sedang diedit (self-match dikecualikan). Scope sama kandidat advisory:
 * hanya pelanggan aktif non-deleted.
 *
 * Normalisasi pajak dua lapis di repo ini: simpan menyimpan digit-saja
 * (`normalizeNpwp`, tax/), kunci kandidat memakai
 * `normalizeCustomerTaxIdKey` (digit saja + nol-saja -> bukan kunci).
 * Pencocokan memakai kunci ternormalisasi itu di kedua sisi: baris
 * kandidat bila kunci digitnya persis sama. Dua NPWP sama hanya beda
 * format (titik/strip/spasi) SELALU tertangkap karena kedua sisi jatuh
 * ke digit yang sama; master tua pra-normalisasi ikut tertangkap lewat
 * normalisasi di memori sesudah scan.
 */
export async function findCustomerNpwpConflict(
  input: {
    taxId?: string | null;
    excludeCustomerId?: number;
  },
  db: TxClient | typeof prisma = prisma,
): Promise<CustomerNpwpConflict | null> {
  const taxIdKey = normalizeCustomerTaxIdKey(input.taxId);
  if (taxIdKey == null) return null;

  const rows = (await db.customer.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(input.excludeCustomerId != null
        ? { id: { not: input.excludeCustomerId } }
        : {}),
      taxId: { not: null },
    },
    select: { id: true, slug: true, name: true, code: true, taxId: true },
    orderBy: { id: "asc" },
    take: MAX_CANDIDATE_SCAN,
  })) as Array<CustomerRow & { taxId: string | null }>;

  for (const row of rows) {
    if (normalizeCustomerTaxIdKey(row.taxId) !== taxIdKey) continue;
    // Baris hasil scan diurut id naik: pemegang pertama deterministik.
    return { id: row.id, slug: row.slug, name: row.name, code: row.code };
  }
  return null;
}

export const CUSTOMER_NPWP_BLOCKED_TITLE = "NPWP sudah dipakai pelanggan lain";

export function buildCustomerNpwpBlockedMessage(
  conflict: CustomerNpwpConflict,
): string {
  const codePart = conflict.code ? ` (${conflict.code})` : "";
  return `NPWP yang sama sudah tercatat atas nama ${conflict.name}${codePart}. Pakai pelanggan yang sudah ada itu, atau perbaiki NPWP bila salah ketik.`;
}

export function buildCustomerDuplicateWarning(
  candidates: CustomerDuplicateCandidate[],
): CustomerDuplicateWarning | null {
  if (candidates.length === 0) return null;
  return {
    title: CUSTOMER_DUPLICATE_WARNING_TITLE,
    body: CUSTOMER_DUPLICATE_WARNING_BODY,
    candidates,
  };
}

// ==================== Daftar kandidat (grup >= 2) ====================

export interface CustomerDuplicateGroup {
  matchKind: CustomerMatchKind;
  matchLabel: string;
  /** Nilai kunci ternormalisasi bersama grup (untuk judul grup UI). */
  key: string;
  members: CustomerDuplicateCandidate[];
}

/**
 * Grup kandidat dari daftar baris pelanggan aktif (murni, tanpa DB):
 * kelompokkan per kunci cocok; grup tampil hanya bila >= 2 anggota
 * (BR-CD-07, AC-CD-B6). Satu pelanggan boleh muncul di >1 grup (EC-4):
 * grup npwp dan grup telepon dibangun dari pasangan kunci yang sama,
 * bukan dari jenis terkuat per baris — jadi pengelompokan dilakukan
 * per jenis kunci secara terpisah, tidak seperti matchKind per baris.
 */
export function buildCustomerDuplicateGroups(
  rows: CustomerRow[],
): CustomerDuplicateGroup[] {
  const byKind: Record<CustomerMatchKind, Map<string, CustomerRow[]>> = {
    npwp: new Map(),
    phone: new Map(),
    name_secondary: new Map(),
  };
  const push = (
    kind: CustomerMatchKind,
    key: string | null,
    row: CustomerRow,
  ) => {
    if (!key) return;
    const map = byKind[kind];
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  };
  for (const row of rows) {
    push("npwp", normalizeCustomerTaxIdKey(row.taxId), row);
    push("phone", normalizeCustomerPhoneKey(row.phone), row);
    // name_secondary: nama + (email) — telepon sudah grup sendiri;
    // kunci grup = nama|email bila email terisi (BR-CD-03 cabang nama).
    const nameKey = normalizeCustomerNameKey(row.name);
    const emailKey = normalizeCustomerEmailKey(row.email);
    if (nameKey && emailKey) push("name_secondary", `${nameKey}|${emailKey}`, row);
  }

  const groups: CustomerDuplicateGroup[] = [];
  (Object.keys(byKind) as CustomerMatchKind[]).forEach((kind) => {
    byKind[kind].forEach((members, key) => {
      if (members.length < 2) return;
      const sorted = [...members].sort((a, b) => {
        const byName = a.name.localeCompare(b.name, "id");
        return byName !== 0 ? byName : a.id - b.id;
      });
      groups.push({
        matchKind: kind,
        matchLabel: CUSTOMER_MATCH_LABEL[kind],
        key: kind === "name_secondary" ? key.split("|")[0] : key,
        members: sorted.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          code: row.code,
          phone: row.phone,
          email: row.email,
          taxId: row.taxId,
          matchKind: kind,
          matchLabel: CUSTOMER_MATCH_LABEL[kind],
        })),
      });
    });
  });
  groups.sort((a, b) => {
    const rank = MATCH_RANK[a.matchKind] - MATCH_RANK[b.matchKind];
    if (rank !== 0) return rank;
    const byName = a.members[0].name.localeCompare(b.members[0].name, "id");
    if (byName !== 0) return byName;
    return a.members[0].id - b.members[0].id;
  });
  return groups;
}

/** Loader daftar kandidat: semua pelanggan aktif non-deleted ber-kontak. */
export async function loadCustomerDuplicateGroups(
  db: TxClient | typeof prisma = prisma,
): Promise<CustomerDuplicateGroup[]> {
  const rows = (await db.customer.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [
        { phone: { not: null } },
        { taxId: { not: null } },
        { email: { not: null } },
      ],
    },
    select: CANDIDATE_SELECT,
    orderBy: { id: "asc" },
    take: MAX_CANDIDATE_SCAN,
  })) as CustomerRow[];
  return buildCustomerDuplicateGroups(rows);
}
