import { describe, it, expect } from "vitest";
import { ResponseSchema, ExtractionSchema, RequestFileSchema } from "../src/schema";

describe("ResponseSchema", () => {
  it("accepts a valid recommendation", () => {
    const response = {
      status: "recommendation",
      items: [{ sku: "MANGO", quantity: 2 }],
      total: 600,
      message: "Two cases of mango drink fit your ₹600 budget.",
    };
    expect(ResponseSchema.safeParse(response).success).toBe(true);
  });

  it("accepts a valid clarification", () => {
    const response = { status: "clarification", items: [], total: 0, message: "What is your budget?" };
    expect(ResponseSchema.safeParse(response).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const response = { status: "maybe", items: [], total: 0, message: "Hmm" };
    expect(ResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects a fractional quantity", () => {
    const response = {
      status: "recommendation",
      items: [{ sku: "MANGO", quantity: 1.5 }],
      total: 450,
      message: "Some mango",
    };
    expect(ResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects a SKU that is not in the catalogue", () => {
    const response = {
      status: "recommendation",
      items: [{ sku: "PEPSI", quantity: 1 }],
      total: 100,
      message: "One Pepsi",
    };
    expect(ResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects a clarification that has items", () => {
    const response = {
      status: "clarification",
      items: [{ sku: "MANGO", quantity: 1 }],
      total: 0,
      message: "What is your budget?",
    };
    expect(ResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects a cannot_fulfil with a non-zero total", () => {
    const response = { status: "cannot_fulfil", items: [], total: 400, message: "Berry is out of stock" };
    expect(ResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects a recommendation with no items", () => {
    const response = { status: "recommendation", items: [], total: 0, message: "Nothing" };
    expect(ResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects a response with no message", () => {
    const response = { status: "clarification", items: [], total: 0 };
    expect(ResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe("ExtractionSchema", () => {
  it("accepts a valid extraction", () => {
    const extraction = {
      budget: 900,
      budgetUnclear: false,
      onlySkus: [],
      excludeSkus: ["WATER"],
      required: [{ sku: "MANGO", minQty: 1, maxQty: null }],
      unknownProducts: [],
    };
    expect(ExtractionSchema.safeParse(extraction).success).toBe(true);
  });

  it("rejects a SKU that is not in the catalogue", () => {
    const extraction = {
      budget: 900,
      budgetUnclear: false,
      onlySkus: ["PEPSI"],
      excludeSkus: [],
      required: [],
      unknownProducts: [],
    };
    expect(ExtractionSchema.safeParse(extraction).success).toBe(false);
  });
});

describe("RequestFileSchema", () => {
  it("accepts a list of requests", () => {
    const requests = [{ id: "r1", text: "₹500. Only water." }];
    expect(RequestFileSchema.safeParse(requests).success).toBe(true);
  });

  it("rejects a request without text", () => {
    const requests = [{ id: "r1" }];
    expect(RequestFileSchema.safeParse(requests).success).toBe(false);
  });
});
