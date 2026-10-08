import { describe, it, expect } from "vitest";
import { APIError } from "openai";
import { extract, type CallModel } from "../src/llm";

const goodOutput = JSON.stringify({
  budget: 900,
  budgetUnclear: false,
  onlySkus: [],
  excludeSkus: [],
  required: [{ sku: "MANGO", minQty: 1 }],
  unknownProducts: [],
});

// A fake model that returns (or throws) the given replies in order, and counts calls
function fakeModel(replies: (string | Error)[]) {
  let callCount = 0;
  const call: CallModel = async () => {
    const reply = replies[callCount];
    callCount = callCount + 1;
    if (reply instanceof Error) {
      throw reply;
    }
    return reply;
  };
  return { call: call, calls: () => callCount };
}

describe("extract", () => {
  it("returns the extraction when the model answers correctly", async () => {
    const model = fakeModel([goodOutput]);
    const extraction = await extract("₹900 with mango", "r1", model.call, 0);
    expect(extraction.budget).toBe(900);
    expect(model.calls()).toBe(1);
  });

  it("retries after a server error and then succeeds", async () => {
    const model = fakeModel([new APIError(500, undefined, "server down", undefined), goodOutput]);
    const extraction = await extract("₹900 with mango", "r1", model.call, 0);
    expect(extraction.budget).toBe(900);
    expect(model.calls()).toBe(2);
  });

  it("retries after malformed JSON and then succeeds", async () => {
    const model = fakeModel(["Sure! Here is the JSON: {budget: 900", goodOutput]);
    const extraction = await extract("₹900 with mango", "r1", model.call, 0);
    expect(extraction.budget).toBe(900);
    expect(model.calls()).toBe(2);
  });

  it("retries when the JSON has the wrong shape (unknown SKU)", async () => {
    const badShape = goodOutput.replace("MANGO", "PEPSI");
    const model = fakeModel([badShape, goodOutput]);
    await extract("₹900 with mango", "r1", model.call, 0);
    expect(model.calls()).toBe(2);
  });

  it("gives up after 3 attempts", async () => {
    const model = fakeModel(["bad", "bad", "bad", goodOutput]);
    await expect(extract("₹900 with mango", "r1", model.call, 0)).rejects.toThrow("extraction failed");
    expect(model.calls()).toBe(3);
  });

  it("does not retry a bad API key", async () => {
    const model = fakeModel([new APIError(401, undefined, "invalid key", undefined), goodOutput]);
    await expect(extract("₹900 with mango", "r1", model.call, 0)).rejects.toThrow("status 401");
    expect(model.calls()).toBe(1);
  });
});
