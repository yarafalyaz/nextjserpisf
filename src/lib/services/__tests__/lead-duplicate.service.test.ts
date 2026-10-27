import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    lead: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/prisma";
import {
  normalizeLeadEmail,
  normalizeLeadPhoneKey,
  leadContactKeys,
  duplicateMatchKind,
  maskPhoneForStranger,
  maskEmailForStranger,
  findLeadDuplicateCandidates,
  buildDuplicateWarning,
  validateDuplicateOverrideReason,
  buildDuplicateOverrideDescription,
  DUPLICATE_WARNING_TITLE,
  DUPLICATE_WARNING_BODY,
} from "@/lib/services/lead-duplicate.service";

const leadFindMany = vi.mocked(prisma.lead.findMany);
const userFindMany = vi.mocked(prisma.user.findMany);

const owner = { userId: 7, canManageLeads: false };
const stranger = { userId: 99, canManageLeads: false };
const manager = { userId: 1, canManageLeads: true };

function row(over: Record<string, unknown> = {}) {
  return {
    id: 11,
    leadNumber: "LEAD-0011",
    slug: "budi",
    name: "Budi",
    company: "PT Sinar",
    status: "new",
    customerId: null,
    assignedTo: 7,
    phone: "+6281234567890",
    email: "budi@mail.com",
    createdAt: new Date("2026-10-20T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindMany.mockResolvedValue([{ id: 7, name: "Sales A" }] as never);
});

describe("F-141-S normalisasi (BR-DUP-04, AC-DUP-1/2/12)", () => {
  it("phone 0812-3456-7890 == +6281234567890 (reuse normalizeWhatsappPhone)", () => {
    expect(normalizeLeadPhoneKey("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeLeadPhoneKey("0812-3456-7890")).toBe(
      normalizeLeadPhoneKey("+6281234567890"),
    );
  });

  it("email trim + lowercase penuh", () => {
    expect(normalizeLeadEmail("  Budi@Mail.com ")).toBe("budi@mail.com");
  });

  it("kosong/null tidak pernah jadi kunci cocok", () => {
    expect(leadContactKeys({ phone: "", email: null })).toEqual({
      phoneKey: null,
      emailKey: null,
    });
    expect(normalizeLeadPhoneKey("12345")).toBeNull();
  });

  it("matchKind: phone/email/both/null; company-saja tidak cocok", () => {
    const keys = { phoneKey: "6281234567890", emailKey: "budi@mail.com" };
    expect(duplicateMatchKind(row(), keys)).toBe("both");
    expect(duplicateMatchKind(row({ email: "lain@mail.com" }), keys)).toBe("phone");
    expect(duplicateMatchKind(row({ phone: "081200000000" }), keys)).toBe("email");
    expect(
      duplicateMatchKind(row({ phone: "081200000000", email: "lain@mail.com" }), keys),
    ).toBeNull();
  });
});

describe("F-141-S masking (§4, AC-DUP-6)", () => {
  it("mask phone 2 digit akhir, email domain saja", () => {
    expect(maskPhoneForStranger("+6281234567890")).toBe("••90");
    expect(maskEmailForStranger("budi@mail.com")).toBe("•••@mail.com");
    expect(maskPhoneForStranger(null)).toBeNull();
    expect(maskEmailForStranger(null)).toBeNull();
  });
});

describe("F-141-S kandidat (BR-DUP-03/05, AC-DUP-3/4/5/11)", () => {
  it("tanpa kunci kontak -> nol query, nol kandidat", async () => {
    const found = await findLeadDuplicateCandidates({ phone: null, email: "" }, owner);
    expect(found).toEqual({ candidates: [], lostCandidates: [] });
    expect(leadFindMany).not.toHaveBeenCalled();
  });

  it("query aktif saja + excludeLeadId + status kandidat+lost", async () => {
    leadFindMany.mockResolvedValue([row()] as never);
    const found0 = await findLeadDuplicateCandidates(
      { phone: "0812-3456-7890", excludeLeadId: 11 },
      owner,
    );
    expect(found0.candidates).toHaveLength(1);
    expect(leadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          id: { not: 11 },
        }),
      }),
    );
  });

  it("kandidat cocok: pemilik lihat kontak penuh + nama assignee", async () => {
    leadFindMany.mockResolvedValue([row()] as never);
    const found = await findLeadDuplicateCandidates(
      { phone: "0812-3456-7890", email: "BUDI@mail.com" },
      owner,
    );
    expect(found.candidates).toHaveLength(1);
    expect(found.candidates[0]).toMatchObject({
      id: 11,
      matchKind: "both",
      phone: "+6281234567890",
      email: "budi@mail.com",
      assignedToName: "Sales A",
      canOpen: true,
    });
  });

  it("sales lain: kontak termask, canOpen false; manage_leads penuh", async () => {
    leadFindMany.mockResolvedValue([row()] as never);
    const asStranger = await findLeadDuplicateCandidates(
      { phone: "0812-3456-7890" },
      stranger,
    );
    expect(asStranger.candidates[0].phone).toBe("••90");
    expect(asStranger.candidates[0].email).toBe("•••@mail.com");
    expect(asStranger.candidates[0].canOpen).toBe(false);

    leadFindMany.mockResolvedValue([row()] as never);
    const asManager = await findLeadDuplicateCandidates(
      { phone: "0812-3456-7890" },
      manager,
    );
    expect(asManager.candidates[0].phone).toBe("+6281234567890");
    expect(asManager.candidates[0].canOpen).toBe(true);
  });

  it("won + customerId -> label konversi; lost terpisah bukan kandidat utama", async () => {
    leadFindMany.mockResolvedValue([
      row({ id: 21, status: "won", customerId: 5 }),
      row({ id: 22, status: "lost" }),
    ] as never);
    const found = await findLeadDuplicateCandidates({ email: "budi@mail.com" }, owner);
    expect(found.candidates.map((c) => c.id)).toEqual([21]);
    expect(found.candidates[0].matchLabel).toBe("Sudah dikonversi menjadi pelanggan");
    expect(found.candidates[0].isConverted).toBe(true);
    expect(found.lostCandidates.map((c) => c.id)).toEqual([22]);
    expect(buildDuplicateWarning(found)?.candidates).toHaveLength(1);
  });

  it("customerId terisi walau bukan won -> tetap label konversi (§8 edge)", async () => {
    leadFindMany.mockResolvedValue([row({ status: "qualified", customerId: 9 })] as never);
    const found = await findLeadDuplicateCandidates({ email: "budi@mail.com" }, owner);
    expect(found.candidates[0].isConverted).toBe(true);
  });

  it("warning null bila kandidat utama kosong (hanya lost)", () => {
    expect(buildDuplicateWarning({ candidates: [], lostCandidates: [] })).toBeNull();
  });

  it("kata tampil §7 verbatim terkunci", () => {
    expect(DUPLICATE_WARNING_TITLE).toBe("Kemungkinan lead duplikat");
    expect(DUPLICATE_WARNING_BODY).toContain("membagi tindak lanjut antar sales");
  });
});

describe("F-141-S alasan override Model C (BR-DUP-06, AC-DUP-7)", () => {
  it("alasan kosong/pendek ditolak server", () => {
    expect(validateDuplicateOverrideReason("")).toMatchObject({ ok: false });
    expect(validateDuplicateOverrideReason("   ")).toMatchObject({ ok: false });
    expect(validateDuplicateOverrideReason("pendek")).toMatchObject({ ok: false });
    expect(validateDuplicateOverrideReason(null)).toMatchObject({ ok: false });
  });

  it("alasan sah -> trim; deskripsi jejak memuat alasan + ID kandidat", () => {
    expect(validateDuplicateOverrideReason("  Nomor sentral perusahaan  ")).toEqual({
      ok: true,
      reason: "Nomor sentral perusahaan",
    });
    expect(buildDuplicateOverrideDescription("Nomor sentral perusahaan", [11, 22])).toBe(
      "Alasan: Nomor sentral perusahaan · Kandidat dilewati (ID lead): 11, 22",
    );
  });
});
