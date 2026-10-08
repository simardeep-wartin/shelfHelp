import { describe, it, expect } from "vitest";
import { APIError } from "openai";
import { handleRequest } from "../src/assistant";
import { ResponseSchema } from "../src/schema";

describe("handleRequest", () => {
  it("returns a recommendation when the model extracts a clear request", async () => {
    const fakeModel = async () =>
      JSON.stringify({
        budget: 500,
        budgetUnclear: false,
        onlySkus: ["WATER"],
        excludeSkus: [],
        required: [],
        unknownProducts: [],
      });
    const response = await handleRequest("r1", "₹500. Only water.", fakeModel);
    expect(response).toMatchObject({ status: "recommendation", items: [{ sku: "WATER", quantity: 5 }], total: 500 });
  });

  it("returns a safe, valid cannot_fulfil when the model call fails", async () => {
    const failingModel = async (): Promise<string> => {
      throw new APIError(401, undefined, "invalid key", undefined);
    };
    const response = await handleRequest("r1", "₹500. Only water.", failingModel);
    expect(response.status).toBe("cannot_fulfil");
    expect(ResponseSchema.safeParse(response).success).toBe(true);
  });
});
