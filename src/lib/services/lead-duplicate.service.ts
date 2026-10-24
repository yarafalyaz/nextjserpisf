/**
 * F-2026-10-24-141-S (§2/§3/§7/§11, PUTUSAN LEAD Q-DUP-1..6): peringatan
 * duplikat lead Model C — peringatkan + alasan wajib tercatat, tanpa izin
 * baru, tanpa unique DB, tanpa kolom status baru.
 *
 * Keputusan Backend (tertulis, per spec §8/§10 DUP-B1):
 * - Phone: REUSE `normalizeWhatsappPhone` (whatsapp.ts) — SATU-SATUNYA
 *   normalisasi phone repo (§0.8); jangan karang aturan kedua yang bisa
 *   selisih dari wa.me. Nomor <11 digit / non-62 gagal normalisasi =
 *   TIDAK cocok, bukan error (BR-DUP-04, AC-DUP-12).
 * - Query kandidat tidak bisa exact-match di SQL: phone/email tersimpan
 *   mentah (format bebas). Loader ambil lead aktif ter-scope kontak
 *   (phone/email non-null non-kosong), normalisasi di memori, banding
 *   persis. Set dibatasi status kandidat §3 + urut createdAt.
 * - Jejak override (BR-DUP-06): LeadActivity type `duplicate_override`
 *   pada LEAD BARU (bukan existing — BR-DUP-10), subject verbatim §7,
 *   description = alasan + ID kandidat terlewati. Tanpa migrasi/schema.
 * - Masking (§4): kandidat milik sales lain -> phone 2 digit akhir,
 *   email domain saja; manage_leads/super_admin/pemilik = penuh.
 *   Masking di server (kontrak ini), bukan hanya UI.
 * - Anti-TOCTOU (§1.6): re-query kandidat DI DALAM transaksi tulis +
 *   terima sisa risiko konkuren terdokumentasi — tanpa baris kunci,
 *   FOR UPDATE convertLead tidak berlaku untuk create. Klaim atomik
 *   penuh = DILARANG (AC-DUP-8: maksimal satu peringatan-terlewati
 *   tanpa jejak; gate di sini menjamin override selalu berjejak).
 */
import { prisma, type TxClient } from "@/lib/db/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils/whatsapp";

export const DUPLICATE_OVERRIDE_ACTIVITY_TYPE = "duplicate_override";
export const DUPLICATE_OVERRIDE_SUBJECT = "Tetap buat lead baru (duplikat)";
export const MIN_DUPLICATE_OVERRIDE_REASON_LENGTH = 10;

/** Kata tampil §7 — verbatim, Frontend menempel apa adanya. */
export const DUPLICATE_WARNING_TITLE = "Kemungkinan lead duplikat";
export const DUPLICATE_WARNING_BODY =
  "Kontak ini cocok dengan lead yang sudah ada. Periksa dulu — membuat ganda membagi tindak lanjut antar sales.";
export const DUPLICATE_CONVERTED_LABEL = "Sudah dikonversi menjadi pelanggan";
export const DUPLICATE_LOST_LABEL =
  "Lead lama berstatus lost — bukan duplikat aktif";

/** Status pemicu utama (§3 BR-DUP-05): aktif + won berlabel; lost terpisah. */
export const DUPLICATE_PRIMARY_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
] as const;

export function normalizeLeadEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function normalizeLeadPhoneKey(
  phone: string | null | undefined,
): string | null {
  return normalizeWhatsappPhone(phone);
}

export interface LeadDuplicateKeys {
  phoneKey: string | null;
  emailKey: string | null;
}

export function leadContactKeys(input: {
  phone?: string | null;
  email?: string | null;
}): LeadDuplicateKeys {
  return {
    phoneKey: normalizeLeadPhoneKey(input.phone),
    emailKey: normalizeLeadEmail(input.email),
  };
}

export type DuplicateMatchKind = "phone" | "email" | "both";

export function duplicateMatchKind(
  candidate: { phone?: string | null; email?: string | null },
  keys: LeadDuplicateKeys,
): DuplicateMatchKind | null {
  const phoneMatch =
    keys.phoneKey != null &&
    normalizeLeadPhoneKey(candidate.phone) === keys.phoneKey;
  const emailMatch =
    keys.emailKey != null &&
    normalizeLeadEmail(candidate.email) === keys.emailKey;
  if (phoneMatch && emailMatch) return "both";
  if (phoneMatch) return "phone";
  if (emailMatch) return "email";
  return null;
}

export const DUPLICATE_MATCH_LABEL: Record<DuplicateMatchKind, string> = {
  phone: "Nomor telepon sama",
  email: "Email sama",
  both: "Telepon dan email sama",
};

/** Masking §4: phone -> 2 digit akhir; email -> domain saja. */
export function maskPhoneForStranger(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `••${digits.slice(-2)}` : null;
}

export function maskEmailForStranger(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at >= 0 ? `•••@${email.slice(at + 1)}` : "•••";
}

export interface LeadDuplicateCandidate {
  id: number;
  leadNumber: string | null;
  slug: string | null;
  name: string;
  company: string | null;
  status: string;
  /** Label konversi ditentukan customerId, bukan status teks (§8 edge). */
  isConverted: boolean;
  isLost: boolean;
  assignedTo: number | null;
  assignedToName: string | null;
  createdAt: Date;
  matchKind: DuplicateMatchKind;
  matchLabel: string;
  /** Kontak penuh hanya untuk pemilik/manage_leads/super_admin. */
  phone: string | null;
  email: string | null;
  canOpen: boolean;
}

export interface LeadDuplicateWarning {
  title: typeof DUPLICATE_WARNING_TITLE;
  body: typeof DUPLICATE_WARNING_BODY;
  candidates: LeadDuplicateCandidate[];
  /** Kandidat lost: tampil terpisah, bukan pemicu utama (Q-DUP-4). */
  lostCandidates: LeadDuplicateCandidate[];
  requiresReason: true;
  minReasonLength: typeof MIN_DUPLICATE_OVERRIDE_REASON_LENGTH;
}

export interface DuplicateViewer {
  userId: number;
  canManageLeads: boolean;
}

interface CandidateLeadRow {
  id: number;
  leadNumber: string | null;
  slug: string | null;
  name: string;
  company: string | null;
  status: string;
  customerId: number | null;
  assignedTo: number | null;
  phone: string | null;
  email: string | null;
  createdAt: Date;
}

function toCandidate(
  row: CandidateLeadRow,
  matchKind: DuplicateMatchKind,
  viewer: DuplicateViewer,
  assigneeName: string | null,
): LeadDuplicateCandidate {
  const fullAccess =
    viewer.canManageLeads || row.assignedTo === viewer.userId;
  const isConverted = row.customerId != null;
  return {
    id: row.id,
    leadNumber: row.leadNumber,
    slug: row.slug,
    name: row.name,
    company: row.company,
    status: row.status,
    isConverted,
    isLost: row.status === "lost",
    assignedTo: row.assignedTo,
    assignedToName: assigneeName,
    createdAt: row.createdAt,
    matchKind,
    matchLabel: isConverted
      ? DUPLICATE_CONVERTED_LABEL
      : DUPLICATE_MATCH_LABEL[matchKind],
    phone: fullAccess ? row.phone : maskPhoneForStranger(row.phone),
    email: fullAccess ? row.email : maskEmailForStranger(row.email),
    canOpen: fullAccess,
  };
}

/**
 * Kandidat duplikat lead aktif (deletedAt null), dedup per ID.
 * `db` injectable supaya re-check transaksi (§1.6) memakai tx yang sama;
 * default prisma global. Lost dikembalikan terpisah (bukan pemicu).
 */
export async function findLeadDuplicateCandidates(
  input: {
    phone?: string | null;
    email?: string | null;
    excludeLeadId?: number;
  },
  viewer: DuplicateViewer,
  db: TxClient | typeof prisma = prisma,
): Promise<{ candidates: LeadDuplicateCandidate[]; lostCandidates: LeadDuplicateCandidate[] }> {
  const keys = leadContactKeys(input);
  if (keys.phoneKey == null && keys.emailKey == null) {
    return { candidates: [], lostCandidates: [] };
  }

  const rows = await db.lead.findMany({
    where: {
      deletedAt: null,
      status: { in: [...DUPLICATE_PRIMARY_STATUSES, "lost"] },
      ...(input.excludeLeadId != null ? { id: { not: input.excludeLeadId } } : {}),
      OR: [{ phone: { not: null } }, { email: { not: null } }],
    },
    select: {
      id: true,
      leadNumber: true,
      slug: true,
      name: true,
      company: true,
      status: true,
      customerId: true,
      assignedTo: true,
      phone: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const matched: { row: CandidateLeadRow; kind: DuplicateMatchKind }[] = [];
  for (const row of rows) {
    const kind = duplicateMatchKind(row, keys);
    if (kind) matched.push({ row, kind });
  }
  if (matched.length === 0) return { candidates: [], lostCandidates: [] };

  const assigneeIds = [
    ...new Set(
      matched
        .map((m) => m.row.assignedTo)
        .filter((v): v is number => v != null),
    ),
  ];
  const users = assigneeIds.length
    ? await db.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const candidates: LeadDuplicateCandidate[] = [];
  const lostCandidates: LeadDuplicateCandidate[] = [];
  for (const { row, kind } of matched) {
    const candidate = toCandidate(
      row,
      kind,
      viewer,
      row.assignedTo != null ? (nameById.get(row.assignedTo) ?? null) : null,
    );
    (row.status === "lost" ? lostCandidates : candidates).push(candidate);
  }
  return { candidates, lostCandidates };
}

export function buildDuplicateWarning(found: {
  candidates: LeadDuplicateCandidate[];
  lostCandidates: LeadDuplicateCandidate[];
}): LeadDuplicateWarning | null {
  if (found.candidates.length === 0) return null;
  return {
    title: DUPLICATE_WARNING_TITLE,
    body: DUPLICATE_WARNING_BODY,
    candidates: found.candidates,
    lostCandidates: found.lostCandidates,
    requiresReason: true,
    minReasonLength: MIN_DUPLICATE_OVERRIDE_REASON_LENGTH,
  };
}

/** Alasan override Model C (§7): wajib, min 10 karakter sesudah trim. */
export function validateDuplicateOverrideReason(
  reason: string | null | undefined,
): { ok: true; reason: string } | { ok: false; error: string } {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Alasan tetap membuat lead baru wajib diisi.",
    };
  }
  if (trimmed.length < MIN_DUPLICATE_OVERRIDE_REASON_LENGTH) {
    return {
      ok: false,
      error: `Alasan tetap membuat lead baru minimal ${MIN_DUPLICATE_OVERRIDE_REASON_LENGTH} karakter.`,
    };
  }
  return { ok: true, reason: trimmed };
}

export function buildDuplicateOverrideDescription(
  reason: string,
  candidateIds: number[],
): string {
  return `Alasan: ${reason} · Kandidat dilewati (ID lead): ${candidateIds.join(", ")}`;
}
