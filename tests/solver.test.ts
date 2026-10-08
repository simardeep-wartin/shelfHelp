import { describe, it, expect } from "vitest";
import { solve, orderTotal } from "../src/solver";
import { checkOrderRules } from "../src/validate";
import type { Extraction, Item } from "../src/schema";

function makeExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    budget: 900,
    budgetUnclear: false,
    onlySkus: [],
    excludeSkus: [],
    required: [],
    unknownProducts: [],
    ...overrides,
  };
}

function quantityOf(items: Item[], sku: string): number {
  for (const item of items) {
    if (item.sku === sku) return item.quantity;
  }
  return 0;
}

describe("solve", () => {
  it("₹900 mix: spends the full budget across three products", () => {
    const items = solve(makeExtraction());
    expect(items).not.toBeNull();
    expect(orderTotal(items!)).toBe(900);
    expect(items!.length).toBe(3);
  });

  it("only mango: returns only mango", () => {
    const items = solve(makeExtraction({ onlySkus: ["MANGO"] }));
    expect(items).toEqual([{ sku: "MANGO", quantity: 3 }]);
  });

  it("no water: never includes water", () => {
    const items = solve(makeExtraction({ excludeSkus: ["WATER"] }));
    expect(items).not.toBeNull();
    expect(quantityOf(items!, "WATER")).toBe(0);
    expect(orderTotal(items!)).toBe(900);
  });

  it("minimums: at least one mango and one lime", () => {
    const items = solve(
      makeExtraction({
        required: [
          { sku: "MANGO", minQty: 1 },
          { sku: "LIME", minQty: 1 },
        ],
      }),
    );
    expect(items).not.toBeNull();
    expect(quantityOf(items!, "MANGO")).toBeGreaterThanOrEqual(1);
    expect(quantityOf(items!, "LIME")).toBeGreaterThanOrEqual(1);
  });

  it("budget too small for anything: returns null", () => {
    expect(solve(makeExtraction({ budget: 50 }))).toBeNull();
  });

  it("only an out-of-stock product: returns null", () => {
    expect(solve(makeExtraction({ onlySkus: ["BERRY"] }))).toBeNull();
  });

  it("minimum above stock (100 mango): returns null", () => {
    expect(solve(makeExtraction({ required: [{ sku: "MANGO", minQty: 100 }] }))).toBeNull();
  });

  it("huge budget: never exceeds stock", () => {
    const items = solve(makeExtraction({ budget: 5000 }));
    expect(items).toEqual([
      { sku: "MANGO", quantity: 4 },
      { sku: "LIME", quantity: 6 },
      { sku: "WATER", quantity: 10 },
    ]);
  });

  it("every order it returns passes all rules, for many budgets", () => {
    for (let budget = 0; budget <= 4000; budget = budget + 50) {
      const extraction = makeExtraction({ budget: budget, excludeSkus: ["LIME"] });
      const items = solve(extraction);
      if (items !== null) {
        expect(checkOrderRules(items, orderTotal(items), extraction)).toEqual([]);
      }
    }
  });
});
