import { describe, it, expect } from "vitest";
import { validateResponse } from "../src/validate";
import type { Extraction } from "../src/schema";

// A plain ₹900 request with no preferences. Tests override only what they need.
function makeExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    budget: 900,
    budgetUnclear: false,
    onlySkus: [],
    excludeSkus: [],
    required: [],
    unknownProducts: [],
    invitesOtherProducts: true,
    ...overrides,
  };
}

// ₹500 order: 1 mango (300) + 1 lime (200)
const validOrder = {
  status: "recommendation",
  items: [
    { sku: "MANGO", quantity: 1 },
    { sku: "LIME", quantity: 1 },
  ],
  total: 500,
  message: "One mango and one lime.",
};

describe("validateResponse", () => {
  it("accepts a valid order", () => {
    expect(validateResponse(validOrder, makeExtraction())).toEqual([]);
  });

  it("accepts a clarification", () => {
    const response = { status: "clarification", items: [], total: 0, message: "What is your budget?" };
    expect(validateResponse(response, makeExtraction({ budget: null }))).toEqual([]);
  });

  it("rejects malformed output", () => {
    expect(validateResponse("not json at all", makeExtraction()).length).toBeGreaterThan(0);
  });

  it("rejects an order when the budget is missing", () => {
    expect(validateResponse(validOrder, makeExtraction({ budget: null })).length).toBeGreaterThan(0);
  });

  it("rejects an order when the budget is unclear", () => {
    expect(validateResponse(validOrder, makeExtraction({ budgetUnclear: true })).length).toBeGreaterThan(0);
  });

  it("rejects a duplicate SKU", () => {
    const response = {
      ...validOrder,
      items: [
        { sku: "LIME", quantity: 1 },
        { sku: "LIME", quantity: 1 },
      ],
      total: 400,
    };
    expect(validateResponse(response, makeExtraction()).length).toBeGreaterThan(0);
  });

  it("rejects an out-of-stock product", () => {
    const response = { ...validOrder, items: [{ sku: "BERRY", quantity: 1 }], total: 400 };
    expect(validateResponse(response, makeExtraction())).toEqual(["BERRY is out of stock"]);
  });

  it("rejects a quantity above stock", () => {
    // mango stock is 4
    const response = { ...validOrder, items: [{ sku: "MANGO", quantity: 5 }], total: 1500 };
    const violations = validateResponse(response, makeExtraction({ budget: 2000 }));
    expect(violations).toEqual(["MANGO quantity 5 exceeds stock 4"]);
  });

  it("rejects a wrong total (invented price or discount)", () => {
    const response = { ...validOrder, total: 2 };
    expect(validateResponse(response, makeExtraction())).toEqual(["total is 2 but catalogue prices add up to 500"]);
  });

  it("rejects an order over budget", () => {
    expect(validateResponse(validOrder, makeExtraction({ budget: 400 }))).toEqual([
      "total 500 is over the budget of 400",
    ]);
  });

  it("rejects a product outside the 'only' list", () => {
    const violations = validateResponse(validOrder, makeExtraction({ onlySkus: ["MANGO"] }));
    expect(violations).toEqual(["LIME is not in the customer's 'only' list"]);
  });

  it("rejects an excluded product", () => {
    const violations = validateResponse(validOrder, makeExtraction({ excludeSkus: ["LIME"] }));
    expect(violations).toEqual(["LIME was excluded by the customer"]);
  });

  it("rejects an order missing a required minimum", () => {
    const violations = validateResponse(validOrder, makeExtraction({ required: [{ sku: "MANGO", minQty: 2, maxQty: null }] }));
    expect(violations).toEqual(["MANGO needs at least 2 but got 1"]);
  });

  it("rejects an order missing a required product entirely", () => {
    const violations = validateResponse(validOrder, makeExtraction({ required: [{ sku: "WATER", minQty: 1, maxQty: null }] }));
    expect(violations).toEqual(["WATER needs at least 1 but got 0"]);
  });

  it("rejects an order above a required maximum (exact quantity)", () => {
    const order = { ...validOrder, items: [{ sku: "LIME", quantity: 4 }], total: 800 };
    const violations = validateResponse(order, makeExtraction({ required: [{ sku: "LIME", minQty: 2, maxQty: 2 }] }));
    expect(violations).toEqual(["LIME allows at most 2 but got 4"]);
  });

  it("rejects a product the customer did not name when no others were invited", () => {
    const extraction = makeExtraction({ required: [{ sku: "MANGO", minQty: 1, maxQty: null }], invitesOtherProducts: false });
    expect(validateResponse(validOrder, extraction)).toEqual(["LIME was not asked for (customer named only MANGO)"]);
  });

  it("allows other products when the customer invited them", () => {
    const extraction = makeExtraction({ required: [{ sku: "MANGO", minQty: 1, maxQty: null }], invitesOtherProducts: true });
    expect(validateResponse(validOrder, extraction)).toEqual([]);
  });
});
