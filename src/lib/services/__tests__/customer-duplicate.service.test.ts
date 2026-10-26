import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/prisma";
import {
  normalizeCustomerPhoneKey,
  normalizeCustomerTaxIdKey,
  normalizeCustomerNameKey,
  normalizeCustomerEmailKey,
  customerDuplicateKeys,
  customerDuplicateMatchKind,
  findCustomerDuplicateCandidates,
  findCustomerNpwpConflict,
  buildCustomerDuplicateWarning,
  buildCustomerNpwpBlockedMessage,
  buildCustomerDuplicateGroups,
  CUSTOMER_DUPLICATE_WARNING_TITLE,
  CUSTOMER_NPWP_BLOCKED_TITLE,
} from "@/lib/services/customer-duplicate.service";

const customerFindMany = vi.mocked(prisma.customer.findMany);

function row(over: Record<string, unknown> = {}) {
  return {
    id: 11,
    slug: "pt-sinar",
    name: "PT Sinar",
    code: "CUST-0011",
    phone: "0812-3456-7890",
    email: "sinar@mail.com",
    taxId: "01.234.567.8-901.000",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F-003-S normalisasi kunci (BR-CD-02)", () => {
  it("telepon +62 812-… == 0812… (reuse normalizeWhatsappPhone)", () => {
    expect(normalizeCustomerPhoneKey("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizeCustomerPhoneKey("+62 812-3456-7890")).toBe(
      normalizeCustomerPhoneKey("0812-3456-7890"),
    );
  });

  it("NPWP titik/strip == digit polos; beda digit != ", () => {
    expect(normalizeCustomerTaxIdKey("01.234.567.8-901.000")).toBe("012345678901000");
    expect(normalizeCustomerTaxIdKey("012345678901000")).toBe("012345678901000");
    expect(normalizeCustomerTaxIdKey("99.999.999.9-999.999")).not.toBe(
      normalizeCustomerTaxIdKey("01.234.567.8-901.000"),
    );
  });

  it("NPWP kosong/strip/0-saja -> null (EC-3)", () => {
    expect(normalizeCustomerTaxIdKey("")).toBeNull();
    expect(normalizeCustomerTaxIdKey(null)).toBeNull();
    expect(normalizeCustomerTaxIdKey("---")).toBeNull();
    expect(normalizeCustomerTaxIdKey("0")).toBeNull();
  });

  it("nama: spasi ganda + kapital campuran ternormalisasi sama (EC-5)", () => {
    expect(normalizeCustomerNameKey("  PT   SINAR  Jaya ")).toBe("pt sinar jaya");
    expect(normalizeCustomerNameKey("pt sinar jaya")).toBe("pt sinar jaya");
  });

  it("email trim + lowercase", () => {
    expect(normalizeCustomerEmailKey("  Sinar@Mail.com ")).toBe("sinar@mail.com");
  });
});

describe("F-003-S matchKind (BR-CD-03)", () => {
  it("telepon sama -> phone, walau nama beda", () => {
    const keys = customerDuplicateKeys({ name: "Lain", phone: "+6281234567890" });
    expect(customerDuplicateMatchKind(row({ name: "Beda" }), keys)).toBe("phone");
  });

  it("NPWP sama -> npwp (prioritas di atas telepon)", () => {
    const keys = customerDuplicateKeys({
      phone: "+6281234567890",
      taxId: "012345678901000",
    });
    expect(customerDuplicateMatchKind(row(), keys)).toBe("npwp");
  });

  it("nama sama TANPA kunci kedua -> null (AC-CD-B3, EC-1)", () => {
    const keys = customerDuplicateKeys({ name: "pt sinar" });
    expect(
      customerDuplicateMatchKind(
        row({ phone: "0899-0000-1111", email: "lain@mail.com", taxId: "999" }),
        keys,
      ),
    ).toBeNull();
  });

  it("nama sama + email sama -> name_secondary", () => {
    const keys = customerDuplicateKeys({
      name: "PT SINAR",
      email: "SINAR@mail.com",
      phone: "0857-1111-2222",
      taxId: "555",
    });
    expect(
      customerDuplicateMatchKind(
        row({ phone: "0899-0000-1111", taxId: "999" }),
        keys,
      ),
    ).toBe("name_secondary");
  });
});

describe("F-003-S findCustomerDuplicateCandidates", () => {
  it("AC-CD-B1: telepon format beda ketemu; kandidat berisi existing", async () => {
    customerFindMany.mockResolvedValue([row()] as never);
    const found = await findCustomerDuplicateCandidates({
      name: "Pelanggan Baru",
      phone: "+62 812-3456-7890",
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 11, matchKind: "phone", matchLabel: "Nomor telepon sama" });
  });

  it("AC-CD-B2: NPWP beda digit -> nol kandidat", async () => {
    customerFindMany.mockResolvedValue([row()] as never);
    const found = await findCustomerDuplicateCandidates({
      name: "Pelanggan Baru",
      taxId: "99.999.999.9-999.999",
    });
    expect(found).toHaveLength(0);
  });

  it("AC-CD-B5: excludeCustomerId diteruskan ke where (diri tidak kandidat)", async () => {
    customerFindMany.mockResolvedValue([] as never);
    await findCustomerDuplicateCandidates(
      { phone: "0812-3456-7890", excludeCustomerId: 11 },
    );
    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 11 }, isActive: true, deletedAt: null }),
      }),
    );
  });

  it("AC-CD-B6: where hanya aktif non-deleted", async () => {
    customerFindMany.mockResolvedValue([] as never);
    await findCustomerDuplicateCandidates({ phone: "0812-3456-7890" });
    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, deletedAt: null }),
      }),
    );
  });

  it("tanpa kunci apa pun -> nol, tanpa query", async () => {
    const found = await findCustomerDuplicateCandidates({ name: "Saja" });
    expect(found).toHaveLength(0);
    expect(customerFindMany).not.toHaveBeenCalled();
  });

  it("urutan: npwp sebelum phone (BR-CD-07)", async () => {
    customerFindMany.mockResolvedValue([
      row({ id: 20, name: "Zeta", taxId: "888", email: "z@mail.com" }),
      row({ id: 21, name: "Alfa", phone: "0857-9999-0000", email: "a@mail.com" }),
    ] as never);
    const found = await findCustomerDuplicateCandidates({
      phone: "0812-3456-7890",
      taxId: "01.234.567.8-901.000",
    });
    expect(found.map((c) => c.id)).toEqual([21, 20]);
    expect(found.map((c) => c.matchKind)).toEqual(["npwp", "phone"]);
  });
});

describe("F-003-S buildCustomerDuplicateWarning (AC-CD-B4 advisory)", () => {
  it("kandidat kosong -> null; ada -> judul verbatim spec", () => {
    expect(buildCustomerDuplicateWarning([])).toBeNull();
    const w = buildCustomerDuplicateWarning([
      {
        id: 11, slug: "pt-sinar", name: "PT Sinar", code: "CUST-0011",
        phone: "0812", email: null, taxId: null,
        matchKind: "phone", matchLabel: "Nomor telepon sama",
      },
    ]);
    expect(w?.title).toBe(CUSTOMER_DUPLICATE_WARNING_TITLE);
    expect(w?.candidates).toHaveLength(1);
  });
});

describe("Q-CD-1 findCustomerNpwpConflict (gerbang BLOKIR NPWP persis)", () => {
  it("NPWP digit-polos tersimpan vs input ber-format -> konflik pemegang", async () => {
    customerFindMany.mockResolvedValue([
      row({ taxId: "012345678901000" }),
    ] as never);
    const conflict = await findCustomerNpwpConflict({
      taxId: "01.234.567.8-901.000",
    });
    expect(conflict).toEqual({
      id: 11,
      slug: "pt-sinar",
      name: "PT Sinar",
      code: "CUST-0011",
    });
    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          deletedAt: null,
          taxId: { not: null },
        }),
      }),
    );
  });

  it("NPWP kosong/\"0\"/strip saja -> bukan konflik, tanpa query (EC-3)", async () => {
    for (const taxId of ["", "0", "---", null, undefined]) {
      expect(await findCustomerNpwpConflict({ taxId })).toBeNull();
    }
    expect(customerFindMany).not.toHaveBeenCalled();
  });

  it("NPWP beda digit -> bukan konflik", async () => {
    customerFindMany.mockResolvedValue([row()] as never);
    expect(
      await findCustomerNpwpConflict({ taxId: "99.999.999.9-999.999" }),
    ).toBeNull();
  });

  it("excludeCustomerId diteruskan ke where (self-match dikecualikan)", async () => {
    customerFindMany.mockResolvedValue([] as never);
    await findCustomerNpwpConflict({
      taxId: "01.234.567.8-901.000",
      excludeCustomerId: 11,
    });
    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 11 } }),
      }),
    );
  });

  it("scan terurut id naik: pemegang pertama deterministik", async () => {
    customerFindMany.mockResolvedValue([
      row({ id: 30, name: "Belakang" }),
      row({ id: 20, name: "Depan" }),
    ] as never);
    const conflict = await findCustomerNpwpConflict({
      taxId: "012345678901000",
    });
    // Urutan query id asc adalah kontrak; mock dua baris persis sesuai
    // urutan query -> pemegang pertama dari barisan itu yang dilaporkan.
    expect(conflict?.id).toBe(30);
    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: "asc" } }),
    );
  });

  it("pesan blokir menyebut nama + kode pemegang (verbatim)", () => {
    expect(
      buildCustomerNpwpBlockedMessage({
        id: 11,
        slug: "pt-sinar",
        name: "PT Sinar",
        code: "CUST-0011",
      }),
    ).toBe(
      "NPWP yang sama sudah tercatat atas nama PT Sinar (CUST-0011). Pakai pelanggan yang sudah ada itu, atau perbaiki NPWP bila salah ketik.",
    );
    expect(CUSTOMER_NPWP_BLOCKED_TITLE).toBe(
      "NPWP sudah dipakai pelanggan lain",
    );
  });
});

describe("F-003-S buildCustomerDuplicateGroups (BR-CD-07, AC-CD-B6)", () => {
  it("grup hanya >= 2 anggota; tunggal tidak tampil", () => {
    const groups = buildCustomerDuplicateGroups([
      row(),
      row({ id: 12, slug: "pt-sinar-2", name: "PT Sinar Dua", phone: "+6281234567890", taxId: "777", email: "dua@mail.com" }),
      row({ id: 13, slug: "unik", name: "Unik", phone: "0857-0000-9999", taxId: "666", email: "unik@mail.com" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].matchKind).toBe("phone");
    expect(groups[0].members.map((m) => m.id)).toEqual([11, 12]);
  });

  it("EC-4: satu pelanggan di dua grup (telepon dengan A, NPWP dengan B)", () => {
    const groups = buildCustomerDuplicateGroups([
      row({ id: 1, name: "Satu", taxId: "111", email: "satu@mail.com" }),
      row({ id: 2, name: "Dua", phone: "+6281234567890", taxId: "222", email: "dua@mail.com" }),
      row({ id: 3, name: "Tiga", phone: "0857-0000-9999", taxId: "111", email: "tiga@mail.com" }),
    ]);
    const kinds = groups.map((g) => g.matchKind).sort();
    expect(kinds).toEqual(["npwp", "phone"]);
    const inGroups = groups.flatMap((g) => g.members.map((m) => m.id));
    expect(inGroups.filter((id) => id === 1)).toHaveLength(2);
  });

  it("nama sama sendirian tanpa kunci kedua -> nol grup", () => {
    const groups = buildCustomerDuplicateGroups([
      row({ id: 1, name: "PT Sama", phone: "0812-1111-1111", taxId: "111", email: "a@mail.com" }),
      row({ id: 2, name: "pt sama", phone: "0812-2222-2222", taxId: "222", email: "b@mail.com" }),
    ]);
    expect(groups).toHaveLength(0);
  });
});
