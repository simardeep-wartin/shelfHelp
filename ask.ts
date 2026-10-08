// Interactive tester: npm run ask
// Type a customer request and see the JSON response. Type "exit" (or Ctrl+C) to quit.
// Uses the same pipeline as run.ts. Logs (what the model extracted, errors) go to ask.log.
import { createInterface } from "node:readline";
import { handleRequest } from "./src/assistant";

async function main() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  terminal.setPrompt("\nCustomer request> ");

  console.log('Shelf Help tester. Type a customer request, or "exit" to quit. Logs: ask.log');
  terminal.prompt();

  // Each line typed is one customer request. The loop ends on "exit", Ctrl+C or end of input.
  let requestNumber = 0;
  for await (const line of terminal) {
    const text = line.trim();
    if (text === "exit") {
      break;
    }
    if (text !== "") {
      requestNumber = requestNumber + 1;
      const response = await handleRequest("ask" + requestNumber, text);
      console.log(JSON.stringify(response, null, 2));
    }
    terminal.prompt();
  }

  terminal.close();
}

main();
