import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Model ${name} tidak ditemukan di schema`);
  return match[1];
}

describe("holiday unique constraints", () => {
  it("Holiday.date unik secara global", () => {
    expect(modelBlock("Holiday")).toMatch(/@@unique\(\[date\]/);
  });

  it("DepartmentHoliday unik per departemen + tanggal", () => {
    expect(modelBlock("DepartmentHoliday")).toMatch(
      /@@unique\(\[departmentId, date\]/,
    );
  });
});
