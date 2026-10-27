import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseFormData } from "../parse-form";
// Jalur di luar parseFormData: schema dari file *.schemas.ts harus sudah
// memuat locale lewat import modul schema itu sendiri.
import { customerSchema } from "../schemas";

describe("locale Zod Bahasa Indonesia", () => {
  it("schema tanpa pesan kustom menghasilkan pesan Indonesia lewat parseFormData", () => {
    const fd = new FormData();
    fd.append("email", "bukan-email");
    fd.append("teks", "abcdef");
    const result = parseFormData(
      z.object({ email: z.string().email(), teks: z.string().max(2) }),
      fd,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("alamat email tidak valid");
      expect(result.error).toContain("Terlalu besar");
      expect(result.error).not.toMatch(/Invalid input|Too big|Invalid email/);
    }
  });

  it("schema tanpa pesan kustom menghasilkan pesan Indonesia saat diparse langsung", () => {
    const result = z.number().safeParse("bukan-angka");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Input tidak valid");
      expect(result.error.issues[0].message).not.toMatch(/Invalid input/);
    }
  });

  it("field tanpa pesan kustom di schema produksi ikut berbahasa Indonesia", () => {
    // customerSchema.phone hanya .max(30) tanpa pesan kustom.
    const result = customerSchema.safeParse({
      name: "Uji",
      phone: "0".repeat(31),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const phoneIssue = result.error.issues.find((i) => i.path.join(".") === "phone");
      expect(phoneIssue?.message).toContain("Terlalu besar");
      expect(phoneIssue?.message).not.toMatch(/Too big/);
    }
  });
});
