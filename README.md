# Shelf Help

An AI sales copilot for field salespeople in kirana stores. Given a retailer's request like
*"I have ₹900. Suggest a mix of drinks"*, it returns one JSON response: a valid order
(`recommendation`), a question (`clarification`), or an explanation (`cannot_fulfil`).

The LLM only reads the request. Everything that must be correct (stock, prices, budget,
preferences) is decided and validated in code. See [DECISIONS.md](DECISIONS.md).

## Requirements

- Node.js **22.12 or newer** (the `openai` SDK and `vitest` need it)
- An OpenAI API key

## Setup

```bash
npm install
cp .env.example .env      # then put your key in .env: OPENAI_API_KEY=sk-...
```

Instead of `.env`, you can also set `OPENAI_API_KEY` as an environment variable.
`OPENAI_MODEL` is optional and defaults to `gpt-5.5`.

## Run (the one command)

```bash
npx tsx run.ts requests.json > responses.json
```

Input, a JSON list of requests:

```json
[{ "id": "r1", "text": "₹500. Only water." }]
```

Output, one response per request:

```json
[{ "id": "r1", "response": { "status": "recommendation", "items": [{ "sku": "WATER", "quantity": 5 }], "total": 500, "message": "..." } }]
```

- Only the JSON goes to stdout. Logs go to stderr, one JSON line per event, so you can
  see why any request failed.
- If the model or API fails after 3 attempts, that request gets a valid `cannot_fulfil`
  and the rest of the batch continues.
- On Windows PowerShell 5.1, `>` writes UTF-16. Use Git Bash, or
  `npx tsx run.ts requests.json | Out-File -Encoding utf8 responses.json`.

## Try it interactively

```bash
npm run ask
```

Type a customer request and press Enter to see the JSON response. Type `exit` to quit.
Logs, including what the model extracted from each request, go to `ask.log`.

## Tests

```bash
npm test          # unit tests for every rule, solver, decisions, retries (no API calls)
npm run eval      # 18 eval cases x 5 runs each against the real model, prints pass rates
npm run eval:catalogue   # real model against a swapped-in catalogue (COLA, JUICE, SODA)
```

`npm test` also runs the system against a swapped-in catalogue (`tests/dynamic-catalogue.test.ts`),
so a hardcoded product name or SKU anywhere in `src/` fails the tests.

`npm run eval` writes the pipeline logs to `eval.log` and exits non-zero if any run fails.
It takes about 1.5 minutes.

## How it works

```
customer text
   -> src/llm.ts       LLM extracts constraints (budget, only/exclude, required quantities)
   -> src/decide.ts    code picks the status and builds the message from templates
   -> src/solver.ts    code tries every possible order and picks the best valid one
   -> src/validate.ts  code checks the final response against every rule
   -> JSON response
```

| File | Purpose |
|---|---|
| `run.ts` | the one command: reads the file, handles each request, prints JSON |
| `src/catalogue.ts` | products, prices, stock (the only source of truth) |
| `src/schema.ts` | zod schemas for requests, the extraction and responses |
| `src/llm.ts` | the only LLM call: prompt, structured output, bounded retries |
| `src/decide.ts` | status decision and message templates |
| `src/solver.ts` | brute-force search for the best valid order |
| `src/validate.ts` | one function per business rule |
| `src/assistant.ts` | the pipeline for one request, with a safe fallback |
| `evals/` | eval cases (property checks) and the 5x runner |
| `tests/` | unit tests |

## Changing the catalogue

Edit only `src/catalogue.ts`: add the SKU to `SKUS` and the product to `CATALOGUE`.
The prompt, solver, validator and messages all read from it. `npm test` fails if the two
lists don't match. Unit tests and evals that expect today's products will need updating.

## Adding a business rule

1. Add a `checkX` function in `src/validate.ts` and call it from `checkOrderRules`.
   The solver uses the same rules, so it will never propose an order that breaks it.
2. If the rule depends on something the customer says, add a field to `ExtractionSchema`
   in `src/schema.ts` and one line in the prompt in `src/llm.ts`.
3. Add a unit test in `tests/validate.test.ts` and an eval case in `evals/cases.ts`.
4. Run `npm test` and `npm run eval`.
