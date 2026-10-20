import { describe, it, expect } from "vitest";
import {
  normalizeWhatsappPhone,
  buildWhatsappMessage,
  buildWhatsappUrl,
} from "../whatsapp";

describe("normalizeWhatsappPhone", () => {
  it("mengubah awalan 08 menjadi 628", () => {
    expect(normalizeWhatsappPhone("0812-3456-7890")).toBe("6281234567890");
  });

  it("mempertahankan +62 dan 62", () => {
    expect(normalizeWhatsappPhone("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsappPhone("6281234567890")).toBe("6281234567890");
  });

  it("menolak nomor kosong/pendek/bukan Indonesia", () => {
    expect(normalizeWhatsappPhone(null)).toBeNull();
    expect(normalizeWhatsappPhone("")).toBeNull();
    expect(normalizeWhatsappPhone("0812")).toBeNull();
    expect(normalizeWhatsappPhone("123456789012")).toBeNull();
  });
});

describe("buildWhatsappMessage", () => {
  it("memuat status Indonesia, plat, dan estimasi selesai", () => {
    const message = buildWhatsappMessage({
      customerName: "Budi",
      documentLabel: "Perintah Kerja",
      documentNo: "WO-001",
      status: "in_progress",
      plateNumber: "B 1234 ABC",
      estimatedEndDate: new Date("2026-10-25T00:00:00+07:00"),
    });
    expect(message).toContain("Halo Budi,");
    expect(message).toContain("Perintah Kerja WO-001: Dalam Proses.");
    expect(message).toContain("Kendaraan: B 1234 ABC.");
    expect(message).toContain("Estimasi selesai: 25 Oktober 2026.");
  });

  it("tanpa plat/estimasi tidak memuat baris kosong", () => {
    const message = buildWhatsappMessage({
      customerName: "Sari",
      documentLabel: "Faktur",
      documentNo: "INV-002",
      status: "posted",
    });
    expect(message).toContain("Faktur INV-002: Diposting.");
    expect(message).not.toContain("Kendaraan:");
    expect(message).not.toContain("Estimasi");
  });
});

describe("buildWhatsappUrl", () => {
  it("encode teks ke parameter wa.me", () => {
    const url = buildWhatsappUrl("0812 3456 7890", "Halo Budi,\nStatus: Selesai.");
    expect(url).toBe(
      "https://wa.me/6281234567890?text=Halo%20Budi%2C%0AStatus%3A%20Selesai.",
    );
  });

  it("null bila nomor tidak valid", () => {
    expect(buildWhatsappUrl(null, "Halo")).toBeNull();
    expect(buildWhatsappUrl("0812", "Halo")).toBeNull();
  });
});
