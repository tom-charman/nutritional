import { describe, expect, it } from "vitest";
import { round2, toCsv } from "@/lib/export/csv";

describe("toCsv", () => {
  it("serializes a header row and data rows with CRLF", () => {
    const csv = toCsv(["a", "b"], [
      [1, 2],
      [3, 4],
    ]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("renders null/undefined as empty fields", () => {
    expect(toCsv(["a", "b", "c"], [[1, null, undefined]])).toBe("a,b,c\r\n1,,");
  });

  it("quotes fields containing commas, quotes or newlines and escapes quotes", () => {
    const csv = toCsv(["name"], [
      ["plain"],
      ["with, comma"],
      ['has "quote"'],
      ["has\nnewline"],
    ]);
    expect(csv).toBe(
      'name\r\nplain\r\n"with, comma"\r\n"has ""quote"""\r\n"has\nnewline"',
    );
  });

  it("header with only no rows is just the header", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });
});

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(2345.6789)).toBe(2345.68);
  });

  it("preserves null (chart gaps stay empty)", () => {
    expect(round2(null)).toBeNull();
  });
});
