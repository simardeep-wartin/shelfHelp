// The one command:
//   npx tsx run.ts requests.json > responses.json
// Reads a JSON list of { id, text } requests and prints one { id, response } per request.
// Only the final JSON goes to stdout; all logs go to stderr.
import { readFileSync } from "node:fs";
import { RequestSchema, type OrderResponse } from "./src/schema";
import { handleRequest, fallbackResponse } from "./src/assistant";
import { log } from "./src/log";

async function main() {
  const filePath = process.argv[2];
  if (filePath === undefined) {
    console.error("Usage: npx tsx run.ts requests.json > responses.json");
    process.exit(1);
  }

  // Read the input file. It must be a JSON list.
  let entries: unknown[];
  try {
    let fileText = readFileSync(filePath, "utf8");
    if (fileText.charCodeAt(0) === 0xfeff) {
      fileText = fileText.slice(1); // drop the invisible BOM character that Windows editors sometimes add
    }
    const json = JSON.parse(fileText);
    if (!Array.isArray(json)) {
      throw new Error("expected a JSON list of requests");
    }
    entries = json;
  } catch (error) {
    log("bad_input_file", { filePath, error: String(error) });
    process.exit(1);
  }

  // Handle requests one at a time. One bad or failing request never stops the rest.
  const results: { id: unknown; response: OrderResponse }[] = [];
  for (const entry of entries) {
    const parsed = RequestSchema.safeParse(entry);
    if (!parsed.success) {
      // e.g. missing "text": still answer, so there is one response per request
      log("bad_request", { entry, error: parsed.error.message });
      results.push({ id: idOf(entry), response: fallbackResponse() });
      continue;
    }

    const request = parsed.data;
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

// Keep whatever id a malformed entry had, so its response still lines up with it
function idOf(entry: unknown): unknown {
  if (typeof entry === "object" && entry !== null && "id" in entry) {
    return entry.id;
  }
  return null;
}

main();
