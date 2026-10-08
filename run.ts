// The one command:
//   npx tsx run.ts requests.json > responses.json
// Reads a JSON list of { id, text } requests and prints one { id, response } per request.
// Only the final JSON goes to stdout; all logs go to stderr.
import { readFileSync } from "node:fs";
import { RequestFileSchema, type OrderResponse } from "./src/schema";
import { handleRequest, fallbackResponse } from "./src/assistant";
import { log } from "./src/log";

async function main() {
  const filePath = process.argv[2];
  if (filePath === undefined) {
    console.error("Usage: npx tsx run.ts requests.json > responses.json");
    process.exit(1);
  }

  // Read and check the input file
  let requests;
  try {
    const fileText = readFileSync(filePath, "utf8").replace(/^﻿/, ""); // drop a BOM that Windows editors sometimes add
    requests = RequestFileSchema.parse(JSON.parse(fileText));
  } catch (error) {
    log("bad_input_file", { filePath, error: String(error) });
    process.exit(1);
  }

  // Handle requests one at a time. One failing request never stops the rest.
  const results: { id: string; response: OrderResponse }[] = [];
  for (const request of requests) {
    let response: OrderResponse;
    try {
      response = await handleRequest(request.id, request.text);
    } catch (error) {
      log("unexpected_error", { requestId: request.id, error: String(error) });
      response = fallbackResponse();
    }
    results.push({ id: request.id, response: response });
  }

  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}

main();
