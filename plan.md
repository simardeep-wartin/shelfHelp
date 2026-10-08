# Shelf Help — Build Plan

Phase-wise build plan. Each checkbox is **one small commit**. History is not squashed.

## Key decisions

- **TypeScript only, no Python.** One command: `npx tsx run.ts requests.json > responses.json`. Hidden tests run the same command.
- **The model extracts, the code decides.** The LLM only turns customer text into a typed constraints object. Code picks the status, builds the order, writes the message and validates the result. The LLM never outputs items, prices or totals.
- **Solver objective.** First satisfy the minimums, then maximize the total within the budget. Break ties by using more distinct SKUs, then by spreading quantities most evenly.
- **Never emit an invalid response.** Any failure (API, malformed output, validator violation) is logged to stderr and becomes a schema-valid `cannot_fulfil`. One bad request never stops the batch.

## Architecture

```
run.ts                 CLI: read file → handleRequest each → JSON array to stdout; logs to stderr
src/catalogue.ts       CATALOGUE constant (single source of truth for sku/name/price/stock)
src/schema.ts          zod: Request, Extraction, Response
src/log.ts             JSON-line logger to stderr
src/llm.ts             extract(text) → Extraction; structured output; bounded retries + timeout
src/decide.ts          respond(extraction) → Response (pure: status rules + messages)
src/solver.ts          solve(constraints) → best items or null (brute-force enumeration)
src/validate.ts        validateResponse(resp, extraction) → violations[] (independent re-check)
src/assistant.ts       handleRequest(text): extract → respond → validate → safe fallback
evals/cases.ts         eval cases as property checks
evals/run-evals.ts     each case × 5, pass rate per case
tests/*.test.ts        vitest unit tests, no LLM calls
```

**Extraction schema (the LLM's output):**

| Field | Type |
|---|---|
| `budget` | `number \| null` |
| `budgetUnclear` | `boolean` |
| `onlySkus` | `SKU[]` |
| `excludeSkus` | `SKU[]` |
| `required` | `{ sku, minQty }[]` |
| `unknownProducts` | `string[]` |

`SKU` is a zod enum of the catalogue SKUs, so the model can't name a product we don't sell. Prices, stock and discounts stated by the customer have no field, so the code never sees them.

**Decision order (`decide.ts`):**
1. Budget missing or unclear → `clarification`.
2. Unknown product requested → `cannot_fulfil`.
3. A required or "only" SKU is out of stock, or its minimum exceeds stock → `cannot_fulfil`.
4. The solver finds no feasible order → `cannot_fulfil`.
5. Otherwise → `recommendation`, with the message built from a code template.

**Solver:** it enumerates every quantity combination within stock (5×7×11×1 = 385), filters them by the constraints, and picks the best by the objective. Brute force is used because it is obviously correct.

---

## Phase 0 — Scaffold
- [ ] `chore: init TS project`: `package.json` (tsx, zod, openai, vitest, dotenv), `tsconfig.json`, `.gitignore`, `.env.example`

**Verify:** `npx tsc --noEmit` and `npx vitest run` pass.

## Phase 1 — Domain and schemas
- [ ] `feat: add catalogue`: `src/catalogue.ts`
- [ ] `feat: add zod schemas for request, extraction, response`: `src/schema.ts`. Clarification and cannot_fulfil must have `items=[]` and `total=0`.
- [ ] `test: schema accepts/rejects`: malformed shapes, non-integer quantities, wrong status

**Verify:** vitest is green.

## Phase 2 — Validator (rule harness)
- [ ] `feat: response validator`: `src/validate.ts` checks:
  - the schema
  - every SKU exists and is in stock
  - each quantity is an integer > 0 and ≤ stock
  - total equals Σ price × qty, and total ≤ budget
  - only, exclude and minimums are respected
  - no duplicate SKUs
- [ ] `test: validator catches each rule violation`: one test per rule

**Verify:** vitest is green.

## Phase 3 — Solver
- [ ] `feat: brute-force order solver`: `src/solver.ts`
- [ ] `test: solver`, covering:
  - a ₹900 mix
  - only mango
  - no water
  - minimums
  - a budget too small (returns null)
  - stock caps at ₹5000
  - every result passes the validator

**Verify:** vitest is green.

## Phase 4 — Decision logic
- [ ] `feat: decide status and build messages`: `src/decide.ts`
- [ ] `test: decide`: hand-written Extractions for the 4 required scenarios, an unknown product, and a budget too small

**Verify:** vitest is green. The whole rule pipeline is proven without any LLM.

## Phase 5 — LLM extraction
- [ ] `feat: logger to stderr`: `src/log.ts`
- [ ] `feat: LLM constraint extraction`: `src/llm.ts`, with:
  - a system prompt that treats customer text as untrusted data to extract from
  - structured output parsed with zod
  - an injectable client for tests
- [ ] `feat: bounded retries and timeout`:
  - max 3 attempts with exponential backoff
  - retry on network errors, 5xx, 429 and parse failures
  - no retry on 400 or 401
  - log every attempt
- [ ] `test: retry behavior with fake client`: succeeds on the 2nd try, gives up after 3, handles malformed JSON

**Verify:** vitest is green, and a manual call with a real key works.

## Phase 6 — Assistant and CLI
- [ ] `feat: handleRequest pipeline with safe fallback`: `src/assistant.ts`
- [ ] `feat: run.ts CLI`: validates the input shape, processes requests one by one, and writes `[{ id, response }]` to stdout only
- [ ] `chore: sample requests.json`: the 4 eval requests, "₹900 mix" and "₹500. Only water."

**Verify:**
- `npx tsx run.ts requests.json > responses.json` gives valid JSON with one entry per id.
- With a bad API key, the output is still valid JSON (fallback responses), and errors are logged to stderr.

## Phase 7 — Evals
- [ ] `feat: eval runner (5× per case, pass rate)`: `evals/run-evals.ts`, run with `npm run eval`
- [ ] `test: 4 required eval cases`: `evals/cases.ts`, checking properties only:
  - status
  - required SKUs present, with quantity ≥ minimum
  - stock and budget respected
  - no 100-case order

**Verify:** `npm run eval` shows Pass/Fail for each run and the pass rate for each case.

## Phase 8 — Two developer evals from real bugs
- [ ] `fix: <bug 1>`, then `test(eval): regression for <bug 1>`
- [ ] `fix: <bug 2>`, then `test(eval): regression for <bug 2>`

These must come from real failures, not invented ones. For each bug, log the symptom, repro, cause and fix in `notes/bugs.md` as it happens. This feeds the video's failure segment and `DECISIONS.md`.

Areas to probe:
- Hinglish budgets ("900 rupees", "9 sau")
- Budget ranges ("₹500–800")
- "No substitutes" versus an out-of-stock product the customer merely prefers
- SKU mapping mistakes

**Verify:** `npm run eval` is green on all 6 cases.

## Phase 9 — Docs
- [ ] `docs: README`: Node 18+, `npm install`, `.env`, the one command, `npm test`, `npm run eval`
- [ ] `docs: DECISIONS.md`:
  - where the model's job ends and the code's begins
  - one mistake the AI tool made and how it was caught
  - what still breaks (brute-force scaling, unknown-product policy)

## Phase 10 — Clean-machine check
- [ ] Fresh clone → `npm install` → add API key → run the one command → `npm test` → `npm run eval`. Fix and commit anything that breaks.

---

## Live-change readiness (video, 25%)

A new rule should touch at most these four places:
1. An Extraction field, plus a line in the prompt.
2. A solver filter or a `decide.ts` branch.
3. A validator check.
4. One eval case.

Keep rule checks as small, separately named functions so the edit is obvious on camera.

## Final verification
- `npx vitest run`: deterministic tests green, no network calls.
- `npx tsx run.ts requests.json > responses.json`: stdout is pure JSON, with one valid response per id.
- `npm run eval`: each case runs 5×, with a 100% target on all 6.
- The clean-clone run from Phase 10 passes.
