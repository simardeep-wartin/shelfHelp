// The rule harness.
// Checks a response against every business rule, in code, without trusting
// whoever produced it. Returns a list of violations; an empty list means valid.
import { findProduct } from "./catalogue";
import { ResponseSchema, type Extraction, type Item } from "./schema";

export function validateResponse(rawResponse: unknown, extraction: Extraction): string[] {
  // 1. Shape: correct fields, known status, catalogue SKUs, whole-number quantities
  const parsed = ResponseSchema.safeParse(rawResponse);
  if (!parsed.success) {
    const violations: string[] = [];
    for (const issue of parsed.error.issues) {
      violations.push("invalid shape at '" + issue.path.join(".") + "': " + issue.message);
    }
    return violations;
  }
  const response = parsed.data;

  // clarification and cannot_fulfil have no items, so the shape check is enough
  if (response.status !== "recommendation") {
    return [];
  }

  // 2. Business rules for an actual order
  return checkOrderRules(response.items, response.total, extraction);
}

// Every business rule an order must follow. The solver also uses this,
// so adding a rule here stops the solver from ever proposing an order that breaks it.
export function checkOrderRules(items: Item[], total: number, extraction: Extraction): string[] {
  const violations: string[] = [];
  checkOrderWanted(extraction, violations);
  checkBudgetIsKnown(extraction, violations);
  checkNoDuplicateSkus(items, violations);
  checkInStock(items, violations);
  checkTotalIsCorrect(items, total, violations);
  checkWithinBudget(total, extraction, violations);
  checkOnlyPreference(items, extraction, violations);
  checkExclusions(items, extraction, violations);
  checkRequiredMinimums(items, extraction, violations);
  checkRequiredMaximums(items, extraction, violations);
  checkNamedProductsOnly(items, extraction, violations);
  return violations;
}

// "Nothing for now" -> no order at all
function checkOrderWanted(extraction: Extraction, violations: string[]) {
  if (!extraction.wantsOrder) {
    violations.push("recommended an order but the customer doesn't want one");
  }
}

// We must never recommend an order without a clear budget
function checkBudgetIsKnown(extraction: Extraction, violations: string[]) {
  if (extraction.budget === null || extraction.budgetUnclear) {
    violations.push("recommended an order without a clear budget");
  }
}

function checkNoDuplicateSkus(items: Item[], violations: string[]) {
  const seen: string[] = [];
  for (const item of items) {
    if (seen.includes(item.sku)) {
      violations.push(item.sku + " appears more than once");
    }
    seen.push(item.sku);
  }
}

// Product exists, is in stock, and quantity does not exceed stock
function checkInStock(items: Item[], violations: string[]) {
  for (const item of items) {
    const product = findProduct(item.sku);
    if (product === undefined) {
      violations.push(item.sku + " is not in the catalogue");
      continue;
    }
    if (product.stock === 0) {
      violations.push(item.sku + " is out of stock");
    } else if (item.quantity > product.stock) {
      violations.push(item.sku + " quantity " + item.quantity + " exceeds stock " + product.stock);
    }
  }
}

// The total must equal what the catalogue prices add up to (no invented prices or discounts)
function checkTotalIsCorrect(items: Item[], total: number, violations: string[]) {
  let expectedTotal = 0;
  for (const item of items) {
    const product = findProduct(item.sku);
    if (product !== undefined) {
      expectedTotal = expectedTotal + product.price * item.quantity;
    }
  }
  if (total !== expectedTotal) {
    violations.push("total is " + total + " but catalogue prices add up to " + expectedTotal);
  }
}

function checkWithinBudget(total: number, extraction: Extraction, violations: string[]) {
  if (extraction.budget !== null && total > extraction.budget) {
    violations.push("total " + total + " is over the budget of " + extraction.budget);
  }
}

// "Only mango" -> every item must be in the only-list
function checkOnlyPreference(items: Item[], extraction: Extraction, violations: string[]) {
  if (extraction.onlySkus.length === 0) {
    return;
  }
  for (const item of items) {
    if (!extraction.onlySkus.includes(item.sku)) {
      violations.push(item.sku + " is not in the customer's 'only' list");
    }
  }
}

// "No water" -> water must not appear
function checkExclusions(items: Item[], extraction: Extraction, violations: string[]) {
  for (const item of items) {
    if (extraction.excludeSkus.includes(item.sku)) {
      violations.push(item.sku + " was excluded by the customer");
    }
  }
}

// "At least one case of mango" -> mango present with quantity >= 1
function checkRequiredMinimums(items: Item[], extraction: Extraction, violations: string[]) {
  for (const requirement of extraction.required) {
    let quantity = 0;
    for (const item of items) {
      if (item.sku === requirement.sku) {
        quantity = item.quantity;
      }
    }
    if (quantity < requirement.minQty) {
      violations.push(requirement.sku + " needs at least " + requirement.minQty + " but got " + quantity);
    }
  }
}

// "Mango and lime" (nothing else invited) -> only mango and lime may be in the order
function checkNamedProductsOnly(items: Item[], extraction: Extraction, violations: string[]) {
  if (extraction.invitesOtherProducts || extraction.required.length === 0) {
    return; // customer is open to other products, or named none
  }
  const namedSkus: string[] = [...extraction.onlySkus];
  for (const requirement of extraction.required) {
    namedSkus.push(requirement.sku);
  }
  for (const item of items) {
    if (!namedSkus.includes(item.sku)) {
      violations.push(item.sku + " was not asked for (customer named only " + namedSkus.join(", ") + ")");
    }
  }
}

// "Exactly 2 cases of lime" -> no more than 2 lime
function checkRequiredMaximums(items: Item[], extraction: Extraction, violations: string[]) {
  for (const requirement of extraction.required) {
    if (requirement.maxQty === null) {
      continue; // no upper limit
    }
    for (const item of items) {
      if (item.sku === requirement.sku && item.quantity > requirement.maxQty) {
        violations.push(requirement.sku + " allows at most " + requirement.maxQty + " but got " + item.quantity);
      }
    }
  }
}
