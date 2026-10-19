import { describe, it, expect } from "vitest";
import { createLeadSchema, updateLeadSchema } from "@/lib/validations/crm.schemas";
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time";

describe("validations/crm dateOnly estimasi penutupan lead", () => {
  it("createLeadSchema menolak expectedCloseDate fiktif 2026-02-30", () => {
    expect(createLeadSchema.safeParse({ name: "Lead A", expectedCloseDate: "2026-02-30" }).success).toBe(false);
  });
  it("updateLeadSchema menolak expectedCloseDate fiktif 2026-04-31", () => {
    expect(updateLeadSchema.safeParse({ name: "Lead A", expectedCloseDate: "2026-04-31" }).success).toBe(false);
  });
  it("createLeadSchema menolak expectedCloseDate bebas", () => {
    expect(createLeadSchema.safeParse({ name: "Lead A", expectedCloseDate: "besok" }).success).toBe(false);
  });
  it("tanggal sah tetap string dateOnly; kosong opsional jadi undefined; konversi WIB tengah-malam UTC", () => {
    const r = createLeadSchema.safeParse({ name: "Lead A", expectedCloseDate: "2026-10-20" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expectedCloseDate).toBe("2026-10-20");
    const kosong = createLeadSchema.safeParse({ name: "Lead A", expectedCloseDate: "" });
    expect(kosong.success).toBe(true);
    if (kosong.success) expect(kosong.data.expectedCloseDate).toBeUndefined();
    expect(wibDateToUtcMidnight("2026-10-20").toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});
