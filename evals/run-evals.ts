// Eval runner: npm run eval
// Runs every eval case 5 times through the real pipeline (real LLM) and reports
// the pass rate, because one lucky run proves nothing about reliability.
// Pipeline logs (stderr) are saved to eval.log by the npm script.
import { EVAL_CASES } from "./cases";
import { handleRequest } from "../src/assistant";

const RUNS_PER_CASE = 5;

async function main() {
  let totalPassed = 0;
  let totalRuns = 0;

  for (let caseIndex = 0; caseIndex < EVAL_CASES.length; caseIndex++) {
    const evalCase = EVAL_CASES[caseIndex];
    console.log("\nCase " + (caseIndex + 1) + ": " + evalCase.name);
    console.log('  "' + evalCase.text + '"');

    // Start all 5 runs at the same time, then wait for all of them
    const runs: Promise<string[]>[] = [];
    for (let run = 1; run <= RUNS_PER_CASE; run++) {
      const requestId = "eval" + (caseIndex + 1) + "-run" + run;
      runs.push(handleRequest(requestId, evalCase.text).then(evalCase.check));
    }
    const failuresPerRun = await Promise.all(runs);

    let passed = 0;
    for (let run = 0; run < failuresPerRun.length; run++) {
      const failures = failuresPerRun[run];
      if (failures.length === 0) {
        passed = passed + 1;
        console.log("  run " + (run + 1) + ": PASS");
      } else {
        console.log("  run " + (run + 1) + ": FAIL - " + failures.join("; "));
      }
    }
    console.log("  Pass rate: " + Math.round((passed / RUNS_PER_CASE) * 100) + "% (" + passed + "/" + RUNS_PER_CASE + ")");

    totalPassed = totalPassed + passed;
    totalRuns = totalRuns + RUNS_PER_CASE;
  }

  console.log("\nOverall: " + totalPassed + "/" + totalRuns + " runs passed");

  // Non-zero exit code if anything failed, so the suite can gate changes
  if (totalPassed < totalRuns) {
    process.exit(1);
  }
}

main();
