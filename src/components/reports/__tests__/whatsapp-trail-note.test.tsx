// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { WhatsappTrailNote } from "../whatsapp-trail-note";
import { buildWhatsappTrail } from "@/lib/reports/whatsapp-trail";

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

const AT = new Date("2026-10-21T03:00:00.000Z");

describe("WhatsappTrailNote", () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
  });

  it("tidak tampil bila belum ada jejak", () => {
    const rendered = render(
      <WhatsappTrailNote trail={{ lastOpened: null, endDateShifts: [] }} />,
    );
    root = rendered.root;
    expect(rendered.container.textContent).toBe("");
  });

  it("label jujur: tautan dibuka oleh nama + waktu, tanpa klaim terkirim", () => {
    const trail = buildWhatsappTrail([
      {
        action: "whatsapp_link_opened",
        userName: "Sari",
        createdAt: AT,
        oldValues: null,
        newValues: null,
        metadata: null,
      },
      {
        action: "whatsapp_link_opened",
        userName: "Rudi",
        createdAt: new Date("2026-10-20T03:00:00.000Z"),
        oldValues: null,
        newValues: null,
        metadata: null,
      },
    ]);
    const rendered = render(<WhatsappTrailNote trail={trail} />);
    root = rendered.root;
    // Hanya klik terakhir yang tampil.
    expect(rendered.container.textContent).toContain(
      "Tautan WhatsApp dibuka oleh Sari",
    );
    expect(rendered.container.textContent).not.toContain("Rudi");
    expect(rendered.container.textContent).not.toContain("terkirim");
    expect(rendered.container.textContent).not.toContain("dihubungi");
  });

  it("histori geser endDate WO tampil dengan label alasan tertutup", () => {
    const trail = buildWhatsappTrail([
      {
        action: "work_order_end_date_changed",
        userName: "Sari",
        createdAt: AT,
        oldValues: { endDate: "2026-10-25T00:00:00.000Z" },
        newValues: { endDate: "2026-10-28T00:00:00.000Z" },
        metadata: JSON.stringify({ reasonCode: "part_delay" }),
      },
    ]);
    const rendered = render(<WhatsappTrailNote trail={trail} />);
    root = rendered.root;
    expect(rendered.container.textContent).toContain("Estimasi selesai digeser");
    expect(rendered.container.textContent).toContain("Menunggu suku cadang");
    expect(rendered.container.textContent).toContain("oleh Sari");
  });
});
