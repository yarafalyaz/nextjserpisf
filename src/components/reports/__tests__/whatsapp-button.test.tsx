// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}));

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { WhatsappButton } from "../whatsapp-button";
import { recordWhatsappLinkOpened } from "@/actions/whatsapp-log.actions";

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

const IDENTITY = {
  modelType: "WorkOrder",
  modelId: 42,
  surface: "detail",
} as const;

describe("WhatsappButton", () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
    vi.mocked(recordWhatsappLinkOpened).mockClear();
  });

  it("tampil tautan wa.me tab baru bila nomor valid", () => {
    const rendered = render(
      <WhatsappButton
        phone="0812-3456-7890"
        message="Halo Budi,"
        {...IDENTITY}
      />,
    );
    root = rendered.root;
    const link = rendered.container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(
      "https://wa.me/6281234567890?text=Halo%20Budi%2C",
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("aria-label")).toBe("Kirim WA");
    expect(link?.textContent).toContain("Kirim WA");
  });

  it("klik mencatat jejak fire-and-forget tanpa mencegah navigasi", () => {
    const rendered = render(
      <WhatsappButton phone="0812-3456-7890" message="Halo" {...IDENTITY} />,
    );
    root = rendered.root;
    const link = rendered.container.querySelector("a");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      link?.dispatchEvent(event);
    });
    expect(recordWhatsappLinkOpened).toHaveBeenCalledTimes(1);
    expect(recordWhatsappLinkOpened).toHaveBeenCalledWith({
      modelType: "WorkOrder",
      modelId: 42,
      surface: "detail",
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("tidak tampil bila nomor kosong/tidak valid", () => {
    const rendered = render(
      <WhatsappButton phone={null} message="Halo" {...IDENTITY} />,
    );
    root = rendered.root;
    expect(rendered.container.querySelector("a")).toBeNull();

    const rendered2 = render(
      <WhatsappButton phone="0812" message="Halo" {...IDENTITY} />,
    );
    act(() => rendered2.root.unmount());
    expect(rendered2.container.querySelector("a")).toBeNull();
  });
});
