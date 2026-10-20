// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { WhatsappButton } from "../whatsapp-button";

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

describe("WhatsappButton", () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
  });

  it("tampil tautan wa.me tab baru bila nomor valid", () => {
    const rendered = render(
      <WhatsappButton phone="0812-3456-7890" message="Halo Budi," />,
    );
    root = rendered.root;
    const link = rendered.container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(
      "https://wa.me/6281234567890?text=Halo%20Budi%2C",
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("aria-label")).toBe("Kirim WA ke pelanggan");
    expect(link?.textContent).toContain("Kirim WA");
  });

  it("tidak tampil bila nomor kosong/tidak valid", () => {
    const rendered = render(<WhatsappButton phone={null} message="Halo" />);
    root = rendered.root;
    expect(rendered.container.querySelector("a")).toBeNull();

    const rendered2 = render(<WhatsappButton phone="0812" message="Halo" />);
    act(() => rendered2.root.unmount());
    expect(rendered2.container.querySelector("a")).toBeNull();
  });
});
