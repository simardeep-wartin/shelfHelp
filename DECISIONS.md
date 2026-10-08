# Decisions

## 1. The model-vs-code line

**The model understands the request. Code decides the answer.**

| The model decides (`src/llm.ts`) | Code decides |
|---|---|
| What the budget is, and whether it is unclear | Whether to ask for clarification (`decide.ts`) |
| Which products are required, with min/max quantity | Which order to recommend (`solver.ts`) |
| Which products are "only" or excluded | Whether a product exists, is in stock, and fits stock |
| Which named products we don't sell | Prices and totals, always from `catalogue.ts` |
| Whether the customer invites products they didn't name | Whether the order is within budget and respects every preference |
| | The status and the message (templates, so nothing is invented) |
| | Whether the final response is valid (`validate.ts`) |

**Why this line:** the business rules must hold every time, but an LLM is right only most of
the time. So the model never produces items, prices, totals or messages. It fills in a small
typed form (`ExtractionSchema`), and deterministic code does the rest.

That gives several layers of protection:
- SKUs are a zod enum, so the model can't name a product we don't sell.
- There is no field for price, stock or discount, so "make mango ₹1" has nowhere to go.
- The solver only builds orders that pass every rule.
- The validator re-checks the final response.
- Anything that fails becomes a safe, valid `cannot_fulfil`.

The rules are also unit-testable without the model, and a new rule is a code change plus an
eval, not prompt tuning.

Other decisions:
- **Brute-force solver.** It tries every quantity combination (385 for this catalogue) and
  picks the best: highest total within budget, then more different products, then the most
  even quantities. It is obviously correct and needs no clever algorithm.
- **Named products only.** "Mango and lime" means only mango and lime, unless the customer
  invites more ("a mix", "fill the rest"). The model reports that one fact; code enforces it.
- **Retries.** 3 attempts with backoff for network errors, 429, 5xx and malformed output.
  No retry for a bad key or bad request. Every attempt is logged to stderr.
- **Reasoning effort is medium.** At "low", the model occasionally dropped a stated
  quantity. Medium fixed it, at the cost of slower runs.

## 2. One thing my AI tool got wrong

My AI tool (Claude Code) designed the extraction schema with only a **minimum** quantity per
product (`minQty`). Every unit test passed, because the tests were written against that same
design.

I caught it by running 20 tricky requests through the real pipeline. "₹900. Just 2 cases of
lime." returned **4** cases. I re-ran it 5 times and got 4 cases every time. The cause: "just 2"
could only be stored as "at least 2", and the solver then filled the budget.

I wrote the eval first and watched it fail 0/5. Then I added `maxQty` to the extraction and a
`checkRequiredMaximums` rule to the validator, and it passed 5/5. The lesson: unit tests only
prove the code matches the design. Real requests are what show the design is wrong.

## 3. What still breaks

- **Wrong extraction can't be caught.** The validator checks the order against what the
  model extracted, not against the original text. If the model misreads the request, the
  answer is valid but wrong. This happened in about 1 in 5 runs before reasoning was raised.
- **Proportions aren't supported.** "Mostly lime, a little water" has no field, so it gets
  the default mix.
- **Partial requests fail entirely.** "Water and Pepsi" is `cannot_fulfil` instead of water
  plus a note. A required product that is out of stock fails the request even without
  "no substitutes".
- **Strict about vague budgets.** "Around ₹600" asks for clarification instead of using ₹600.
- **Messages are thin.** A refused discount is silently ignored, and messages are always in
  English, even for Hindi requests.
- **API failures look like `cannot_fulfil`.** The schema has no error status, so an outage
  is reported as "couldn't process this request".
- **Scale.** Requests run one at a time, a few seconds each at medium reasoning. The
  brute-force search grows with (stock + 1) multiplied across products, which is fine for
  4 products but not for a real catalogue.
