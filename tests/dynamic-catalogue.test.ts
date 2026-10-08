// Swaps in a completely different catalogue (COLA, JUICE, SODA) and checks that the
// prompt, schema, solver, decisions and validator all follow it. No API calls.
import { describe, it, expect, vi } from "vitest";
import { buildSystemPrompt } from "../src/llm";
import { ExtractionSchema } from "../src/schema";
import { respond } from "../src/decide";
import { validateResponse } from "../src/validate";

// Every src/ file that imports ../src/catalogue gets the other catalogue instead
vi.mock("../src/catalogue", () => import("./fixtures/other-catalogue"));

// Build an extraction through the real schema (this also proves the schema accepts the new SKUs)
function makeExtraction(overrides: object = {}) {
  return ExtractionSchema.parse({
    budget: 1000,
    budgetUnclear: false,
    onlySkus: [],
    excludeSkus: [],
    required: [],
    unknownProducts: [],
    invitesOtherProducts: true,
    wantsOrder: true,
    ...overrides,
  });
}

describe("with a different catalogue", () => {
  it("the prompt lists the new products and none of the old ones", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("- COLA: Cola can");
    expect(prompt).toContain("- SODA: Club soda");
    expect(prompt).not.toContain("MANGO");
  });

  it("the schema accepts new SKUs and rejects old ones", () => {
    expect(() => makeExtraction({ onlySkus: ["COLA"] })).not.toThrow();
    expect(() => makeExtraction({ onlySkus: ["MANGO"] })).toThrow();
  });

  it("a ₹1000 mix is built from the new products, prices and stock", () => {
    const extraction = makeExtraction();
    const response = respond(extraction);
    // Best order: 3 cola (all stock, ₹750) + 2 soda (₹240) = ₹990
    expect(response).toMatchObject({
      status: "recommendation",
      items: [
        { sku: "COLA", quantity: 3 },
        { sku: "SODA", quantity: 2 },
      ],
      total: 990,
    });
    expect(response.message).toContain("Cola can");
    expect(validateResponse(response, extraction)).toEqual([]);
  });

  it("an out-of-stock new product gives cannot_fulfil with its new name", () => {
    const response = respond(makeExtraction({ onlySkus: ["JUICE"] }));
    expect(response.status).toBe("cannot_fulfil");
    expect(response.message).toContain("Orange juice is out of stock");
  });

  it("the validator rejects an old product", () => {
    const order = { status: "recommendation", items: [{ sku: "MANGO", quantity: 1 }], total: 300, message: "One mango" };
    expect(validateResponse(order, makeExtraction()).length).toBeGreaterThan(0);
  });
});
