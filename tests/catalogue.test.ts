import { describe, it, expect } from "vitest";
import { SKUS, CATALOGUE } from "../src/catalogue";
import { buildSystemPrompt } from "../src/llm";

// These guard against editing the catalogue in one place but not the other
describe("catalogue", () => {
  it("SKUS lists exactly the SKUs in CATALOGUE", () => {
    const catalogueSkus: string[] = [];
    for (const product of CATALOGUE) {
      catalogueSkus.push(product.sku);
    }
    expect([...SKUS].sort()).toEqual(catalogueSkus.sort());
  });

  it("the model prompt lists every product", () => {
    const prompt = buildSystemPrompt();
    for (const product of CATALOGUE) {
      expect(prompt).toContain("- " + product.sku + ": " + product.name);
    }
  });
});
