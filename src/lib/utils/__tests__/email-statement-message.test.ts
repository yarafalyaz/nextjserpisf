import { describe, it, expect } from "vitest";
import {
  normalizeCustomerEmail,
  buildStatementEmailSubject,
  buildStatementEmailMessage,
  buildStatementEmailUrl,
} from "../email-statement-message";

describe("normalizeCustomerEmail (BR-SE-03 bentuk dasar)", () => {
  it("menerima alamat valid + trim spasi pinggir", () => {
    expect(normalizeCustomerEmail("  uji@example.com  ")).toBe("uji@example.com");
    expect(normalizeCustomerEmail("Budi.S@Mail.Co.ID")).toBe("Budi.S@Mail.Co.ID");
  });

  it("menolak kosong/tanpa @/domain tanpa titik/spasi di tengah", () => {
    expect(normalizeCustomerEmail(null)).toBeNull();
    expect(normalizeCustomerEmail(undefined)).toBeNull();
    expect(normalizeCustomerEmail("")).toBeNull();
    expect(normalizeCustomerEmail("   ")).toBeNull();
    expect(normalizeCustomerEmail("bukan-email")).toBeNull();
    expect(normalizeCustomerEmail("uji@example")).toBeNull();
    expect(normalizeCustomerEmail("uji @example.com")).toBeNull();
    expect(normalizeCustomerEmail("uji@exa mple.com")).toBeNull();
    expect(normalizeCustomerEmail("a@b@c.com")).toBeNull();
  });
});

describe("buildStatementEmailSubject (Q-SE-4 verbatim)", () => {
  it("Statement Piutang — <Label Periode>", () => {
    expect(buildStatementEmailSubject({ periodLabel: "Periode 1 Jan 2026 – 15 Okt 2026" })).toBe(
      "Statement Piutang — Periode 1 Jan 2026 – 15 Okt 2026",
    );
  });
});

describe("buildStatementEmailMessage (F-2026-10-25-043-B1, Q-SE-4 verbatim 3 varian)", () => {
  const base = { customerName: "CV Uji", periodLabel: "Periode 1 Jan 2026 – 15 Okt 2026" };

  it("saldo positif -> verbatim varian > 0", () => {
    const msg = buildStatementEmailMessage({ ...base, closingBalance: 350_000 });
    expect(msg).toBe(
      "Halo CV Uji,\n\nBerikut statement piutang Anda untuk Periode 1 Jan 2026 – 15 Okt 2026. " +
        "Saldo akhir periode: Rp 350.000. Statement lengkap dapat kami sediakan/dicetak bila diperlukan.\n\nTerima kasih.",
    );
    expect(msg).not.toMatch(/tagihan|menunggak|denda|segera lunasi|terkirim|dibaca/i);
  });

  it("saldo nol -> verbatim varian = 0", () => {
    const msg = buildStatementEmailMessage({ ...base, closingBalance: 0 });
    expect(msg).toBe(
      "Halo CV Uji,\n\nBerikut statement piutang Anda untuk Periode 1 Jan 2026 – 15 Okt 2026. " +
        "Saldo akhir periode: Rp 0 — tidak ada sisa piutang pada akhir periode ini. " +
        "Statement lengkap dapat kami sediakan/dicetak bila diperlukan.\n\nTerima kasih.",
    );
    expect(msg).not.toMatch(/tagihan|menunggak|denda|segera lunasi|terkirim|dibaca/i);
  });

  it("saldo negatif -> nilai absolut sebagai kelebihan bayar/kredit, bukan saldo mentah", () => {
    const msg = buildStatementEmailMessage({ ...base, closingBalance: -250_000 });
    expect(msg).toBe(
      "Halo CV Uji,\n\nBerikut statement piutang Anda untuk Periode 1 Jan 2026 – 15 Okt 2026. " +
        "Saldo akhir periode menunjukkan kelebihan bayar sebesar Rp 250.000 yang tercatat sebagai kredit Anda. " +
        "Statement lengkap dapat kami sediakan/dicetak bila diperlukan.\n\nTerima kasih.",
    );
    expect(msg).not.toContain("-Rp");
    expect(msg).not.toContain("(250.000)");
    expect(msg).not.toMatch(/tagihan|menunggak|denda|segera lunasi|terkirim|dibaca/i);
  });
});

describe("buildStatementEmailUrl (EC-SE-6 encode aman)", () => {
  const input = {
    customerName: "CV Uji & Rekan",
    periodLabel: "Periode 1 Jan 2026 – 15 Okt 2026",
    closingBalance: 350_000,
  };

  it("mailto penuh: to + subjek + isi ter-encode", () => {
    const url = buildStatementEmailUrl("uji@example.com", input);
    expect(url).toBe(
      "mailto:uji@example.com?subject=" +
        encodeURIComponent("Statement Piutang — Periode 1 Jan 2026 – 15 Okt 2026") +
        "&body=" +
        encodeURIComponent(buildStatementEmailMessage(input)),
    );
    // Karakter & di nama tidak memecah query string.
    expect(url).not.toContain("CV Uji & Rekan");
    expect(url).toContain(encodeURIComponent("CV Uji & Rekan"));
  });

  it("null bila alamat tidak valid/kosong", () => {
    expect(buildStatementEmailUrl(null, input)).toBeNull();
    expect(buildStatementEmailUrl("", input)).toBeNull();
    expect(buildStatementEmailUrl("bukan-email", input)).toBeNull();
  });
});
