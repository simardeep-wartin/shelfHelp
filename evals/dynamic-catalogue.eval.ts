// Real-model eval with a completely different catalogue (COLA, JUICE, SODA).
// Proves the model is told the current products and maps the customer's words onto them.
// Run with: npm run eval:catalogue   (uses the API; not part of npm test)
import { describe, it, expect, vi } from "vitest";
import { handleRequest } from "../src/assistant";
import { runChecks, status, includes, exactly, onlyFrom, type EvalCase } from "./cases";

// Every src/ file that imports ../src/catalogue gets the other catalogue instead
vi.mock("../src/catalogue", () => import("../tests/fixtures/other-catalogue"));

const RUNS_PER_CASE = 5;

const CASES: EvalCase[] = [
  {
    name: "only a new product",
    text: "₹750. Only cola.",
    checks: [status("recommendation"), exactly("COLA", 3), onlyFrom("COLA")],
  },
  {
    name: "two new products, one each",
    text: "₹1000. Club soda and cola, one each.",
    checks: [status("recommendation"), exactly("COLA", 1), exactly("SODA", 1), onlyFrom("COLA", "SODA")],
  },
  {
    name: "new product that is out of stock",
    text: "₹800. Only orange juice, no substitutes.",
    checks: [status("cannot_fulfil")],
  },
  {
    name: "old product is no longer sold",
    text: "₹600. Only mango drink.",
    checks: [status("cannot_fulfil")],
  },
  {
    name: "a mix uses only new products",
    text: "I have ₹1000. Suggest a mix.",
    checks: [status("recommendation"), includes("COLA"), includes("SODA"), onlyFrom("COLA", "SODA")],
  },
];

describe("real model with a different catalogue", () => {
  for (let caseIndex = 0; caseIndex < CASES.length; caseIndex++) {
    const evalCase = CASES[caseIndex];

    it(evalCase.name, async () => {
      // Start all 5 runs at the same time, then wait for all of them
      const runs: Promise<string[]>[] = [];
      for (let run = 1; run <= RUNS_PER_CASE; run++) {
        const requestId = "catalogue" + (caseIndex + 1) + "-run" + run;
        runs.push(handleRequest(requestId, evalCase.text).then((response) => runChecks(evalCase, response)));
      }
      const failuresPerRun = await Promise.all(runs);

      let passed = 0;
      for (let run = 0; run < failuresPerRun.length; run++) {
        const failures = failuresPerRun[run];
        if (failures.length === 0) {
          passed = passed + 1;
        } else {
          console.log("  run " + (run + 1) + ": FAIL - " + failures.join("; "));
        }
      }
      console.log(evalCase.name + ': "' + evalCase.text + '" -> pass rate ' + (passed / RUNS_PER_CASE) * 100 + "% (" + passed + "/" + RUNS_PER_CASE + ")");

      // Every run must pass
      expect(passed).toBe(RUNS_PER_CASE);
    });
  }
});
