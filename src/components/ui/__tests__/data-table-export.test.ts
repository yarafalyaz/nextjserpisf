/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { exportTableToCsv } from "@/components/ui/data-table-export";

describe("exportTableToCsv", () => {
  it("generates CSV and sanitizes formula characters", async () => {
    let capturedBlob: Blob | null = null;
    let clicked = false;

    // Mock DOM
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") {
        el.click = () => {
          clicked = true;
        };
      }
      return el;
    });

    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return "blob:mock-url";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const mockData = [
      { id: 1, name: "Barang A", code: "=cmd|' /C calc'!A0", price: 15000 },
      { id: 2, name: "Barang B", code: "+12345", price: 20000 },
    ];

    exportTableToCsv({
      filename: "test-export.csv",
      columns: [
        { id: "name", header: "Nama Barang" },
        { id: "code", header: "Kode Formula" },
        { id: "price", header: "Harga" },
      ],
      data: mockData,
    });

    expect(clicked).toBe(true);
    expect(capturedBlob).not.toBeNull();

    // Verify blob content via FileReader in jsdom
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(capturedBlob!);
    });

    // Header row
    expect(text).toContain('"Nama Barang","Kode Formula","Harga"');
    // Sanitized formula row: '=cmd' should be prefixed with tab '\t=cmd'
    expect(text).toContain('"\t=cmd|\' /C calc\'!A0"');
    // '+12345' should be prefixed with tab '\t+12345'
    expect(text).toContain('"\t+12345"');
  });
});
