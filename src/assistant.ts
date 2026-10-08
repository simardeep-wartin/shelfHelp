// The full pipeline for one customer request:
//   1. LLM extracts constraints from the text      (llm.ts)
//   2. Code decides the response                   (decide.ts)
//   3. Code validates the response against rules   (validate.ts)
// If anything fails, we return a safe cannot_fulfil instead of a bad answer.
import { extract, type CallModel } from "./llm";
import { respond } from "./decide";
import { validateResponse } from "./validate";
import { log } from "./log";
import type { Extraction, OrderResponse } from "./schema";

export async function handleRequest(requestId: string, text: string, callModel?: CallModel): Promise<OrderResponse> {
  // 1. Understand the request (the only step that uses the LLM)
  let extraction: Extraction;
  try {
    extraction = await extract(text, requestId, callModel);
  } catch (error) {
    log("request_failed", { requestId, stage: "extract", error: String(error) });
    return fallbackResponse();
  }

  // 2. Decide the answer in code
  const response = respond(extraction);

  // 3. Double-check the answer against every rule before sending it
  const violations = validateResponse(response, extraction);
  if (violations.length > 0) {
    log("request_failed", { requestId, stage: "validate", response, violations });
    return fallbackResponse();
  }

  log("request_ok", { requestId, status: response.status, total: response.total });
  return response;
}

// Used whenever we can't produce a trustworthy answer. Always a valid response.
export function fallbackResponse(): OrderResponse {
  return {
    status: "cannot_fulfil",
    items: [],
    total: 0,
    message: "Sorry, we couldn't process this request right now. Please try again.",
  };
}
