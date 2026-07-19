import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive layout", () => {
  it("does not force the document wider than a narrow viewport", () => {
    const stylesheet = readFileSync("src/index.css", "utf8");

    expect(stylesheet).not.toMatch(/body\s*\{[^}]*min-width:/s);
  });
});
