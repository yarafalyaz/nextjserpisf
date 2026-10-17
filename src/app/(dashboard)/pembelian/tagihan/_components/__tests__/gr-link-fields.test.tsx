// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { GoodsReceiptLinkFields } from "../gr-link-fields";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return { root, container };
}

function unmount(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

/**
 * Jalur "Buat Tagihan dari Penerimaan" harus mengirim `goodsReceiptId` ke server
 * action. Form tagihan dipakai bersama (buat/ubah/dari PO) dan tidak boleh
 * diubah untuk jalur ini, jadi bidangnya disisipkan ke dalam form yang dirender
 * komponen ini — dan HARUS berada di dalam elemen <form>, karena
 * `new FormData(form)` (yang dipakai form tagihan saat submit) hanya membaca
 * elemen yang terpasang di dalam form tersebut.
 */
describe("GoodsReceiptLinkFields", () => {
  it("menyisipkan goodsReceiptId ke dalam form, bukan di luarnya", () => {
    const { root, container } = mount();

    act(() => {
      root.render(
        <GoodsReceiptLinkFields goodsReceiptId={77}>
          <form>
            <input name="vendorId" defaultValue="3" />
          </form>
        </GoodsReceiptLinkFields>,
      );
    });

    const form = container.querySelector("form")!;
    const injected = form.querySelector("input[name='goodsReceiptId']") as HTMLInputElement | null;
    expect(injected).not.toBeNull();
    expect(injected!.value).toBe("77");
    expect(injected!.type).toBe("hidden");
    // Terkirim lewat FormData — inilah kontrak yang dipakai server action.
    expect(new FormData(form).get("goodsReceiptId")).toBe("77");

    unmount(root, container);
  });

  it("membuang bidangnya saat komponen dilepas (tidak tertinggal di DOM)", () => {
    const { root, container } = mount();

    act(() => {
      root.render(
        <GoodsReceiptLinkFields goodsReceiptId={12}>
          <form>
            <input name="vendorId" defaultValue="3" />
          </form>
        </GoodsReceiptLinkFields>,
      );
    });
    expect(container.querySelector("input[name='goodsReceiptId']")).not.toBeNull();

    unmount(root, container);
    expect(document.querySelector("input[name='goodsReceiptId']")).toBeNull();
  });
});
