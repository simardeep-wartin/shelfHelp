# Decisions

## 1. The model-vs-code line

**The model understands the request. Code decides the answer.**

| The model decides (`src/llm.ts`) | Code decides |
|---|---|
| The budget, and whether it is unclear (a range, contradictory) | Whether to ask for clarification (`decide.ts`) |
| Required products with min/max quantity; "only" and excluded products | Which order to recommend (`solver.ts`) |
| Named products we don't sell | Existence, stock and prices, always from `catalogue.ts` |
| Whether other products are invited; whether an order is wanted at all | Budget, preferences, status, message (templates), final validation (`validate.ts`) |

**Why:** the rules must hold every time, but an LLM is right only most of the time. So the
model never produces items, prices, totals or messages. It fills in a small typed form
(`ExtractionSchema`), and the code does the rest:
- SKUs are a zod enum, so the model can't name a product we don't sell.
- There is no field for price, stock or discount, so "make mango ₹1" has nowhere to go.
- The solver only builds orders that pass every rule, and the validator re-checks the result.
- Anything that fails becomes a safe, valid `cannot_fulfil`.

A new rule is a code change plus an eval, not prompt tuning.

Other decisions:
- **Brute-force solver.** It tries every quantity combination (385 here) and picks the
  highest total, then the most products, then the most even split. Obviously correct.
- **Named products only** unless others are invited ("a mix", "fill the rest").
- **Unknown products.** Named alongside products we sell, we supply ours and say what we
  don't stock. Named alone, the request is `cannot_fulfil`.
- **Approximate budgets** ("around ₹600") are used as the limit; ranges and contradictions get a clarification.
- **Retries.** 3 attempts with backoff for network errors, 429, 5xx and bad output. None for a bad key.
- **Medium reasoning.** At "low", the model sometimes dropped a stated quantity.

## 2. One thing my AI tool got wrong

My AI tool (Claude Code) designed the extraction with only a **minimum** quantity per product
(`minQty`). Every unit test passed, because the tests were written against the same design.
I caught it by running 20 tricky requests through the real pipeline: "₹900. Just 2 cases of
lime." returned **4** cases, 5 times out of 5. "Just 2" could only be stored as "at least 2",
and the solver then filled the budget. I wrote the eval first and watched it fail 0/5. Then I
added `maxQty` and a `checkRequiredMaximums` rule, and it passed 5/5. The lesson: unit tests
prove the code matches the design. Real requests show whether the design is right.

## 3. What still breaks

- **A wrong extraction can't be caught.** The validator checks the order against what the
  model extracted, not the original text. A misread request gives a valid but wrong answer.
- **No proportions.** "Mostly lime, a little water" is split however the solver decides.
- **Out-of-stock required product fails the request** even without "no substitutes".
- **Thin messages.** A refused discount is silently ignored, and messages are English-only.
- **Outages look like `cannot_fulfil`.** The schema has no error status.
- **Scale.** Requests run one at a time (a few seconds each), and the search grows with
  (stock + 1) multiplied across products: fine for 4 products, not for a real catalogue.
