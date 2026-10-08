// Decides the final response from the extracted constraints.
// Pure code, no LLM: picks the status, builds the order with the solver,
// and writes the message from templates, so the message can never invent anything.
import { CATALOGUE, findProduct } from "./catalogue";
import type { Extraction, Item, OrderResponse } from "./schema";
import { solve, orderTotal } from "./solver";

export function respond(extraction: Extraction): OrderResponse {
  // 0. Customer doesn't want an order right now -> don't invent one
  if (!extraction.wantsOrder) {
    return clarification(
      "No order placed. We sell: " + sellableProductNames() + ". Tell me what you'd like and your budget when you're ready.",
    );
  }

  // 1. No budget, or a vague one -> ask for it instead of guessing
  if (extraction.budget === null) {
    return clarification("What is your budget for this order?");
  }
  if (extraction.budgetUnclear || extraction.budget < 0) {
    return clarification("Could you confirm your exact budget in rupees?");
  }

  // 2. Customer both asked for and excluded the same product -> ask which they meant
  const conflict = findConflict(extraction);
  if (conflict !== null) {
    return clarification(conflict);
  }

  // 3. Customer asked ONLY for things we don't sell. If they also named products we do sell,
  //    we carry on with those and mention the rest in the message (step 6).
  const namedCatalogueProducts = extraction.required.length > 0 || extraction.onlySkus.length > 0;
  if (extraction.unknownProducts.length > 0 && !namedCatalogueProducts) {
    return cannotFulfil(
      "We don't stock " + extraction.unknownProducts.join(", ") + ". We sell: " + sellableProductNames() + ".",
    );
  }

  // 4. A product the customer insists on can't be supplied
  const stockProblem = findStockProblem(extraction);
  if (stockProblem !== null) {
    return cannotFulfil(stockProblem);
  }

  // 5. Search for the best valid order
  const items = solve(extraction);
  if (items === null) {
    return cannotFulfil(explainNoOrder(extraction, extraction.budget));
  }

  // 6. Success
  const total = orderTotal(items);
  let message = "For your ₹" + extraction.budget + " budget: " + describeItems(items) + ". Total ₹" + total + ".";
  if (extraction.unknownProducts.length > 0) {
    message = message + " We don't stock " + extraction.unknownProducts.join(", ") + ".";
  }
  return { status: "recommendation", items: items, total: total, message: message };
}

// Returns a reason if a required or "only" product can't be supplied, otherwise null.
function findStockProblem(extraction: Extraction): string | null {
  // Every required product must have enough stock
  for (const requirement of extraction.required) {
    if (requirement.minQty < 1) {
      continue; // only an upper limit ("at most 2"), so 0 cases is fine
    }
    const product = findProduct(requirement.sku)!; // the schema guarantees the SKU exists
    if (product.stock === 0) {
      return product.name + " is out of stock, so this request cannot be fulfilled.";
    }
    if (requirement.minQty > product.stock) {
      return (
        "You asked for at least " + requirement.minQty + " cases of " + product.name +
        " but only " + product.stock + " are in stock."
      );
    }
  }

  // "Only X" where every X is out of stock
  if (extraction.onlySkus.length > 0) {
    const outOfStockNames: string[] = [];
    for (const sku of extraction.onlySkus) {
      const product = findProduct(sku)!;
      if (product.stock === 0) {
        outOfStockNames.push(product.name);
      }
    }
    if (outOfStockNames.length === extraction.onlySkus.length) {
      return outOfStockNames.join(", ") + " is out of stock, so this request cannot be fulfilled.";
    }
  }

  return null;
}

// Returns a question if a product is both wanted and excluded ("only mango, no mango"), otherwise null.
function findConflict(extraction: Extraction): string | null {
  for (const sku of extraction.excludeSkus) {
    let alsoWanted = extraction.onlySkus.includes(sku);
    for (const requirement of extraction.required) {
      if (requirement.sku === sku) {
        alsoWanted = true;
      }
    }
    if (alsoWanted) {
      const name = findProduct(sku)!.name;
      return "You asked for " + name + " but also said not to include it. Should the order include " + name + "?";
    }
  }
  return null;
}

// Why no valid order exists. Most specific reason first.
function explainNoOrder(extraction: Extraction, budget: number): string {
  // What the required minimums alone would cost
  let minimumCost = 0;
  for (const requirement of extraction.required) {
    if (requirement.minQty > 0) {
      minimumCost = minimumCost + findProduct(requirement.sku)!.price * requirement.minQty;
    }
  }
  if (minimumCost > budget) {
    return "The products you asked for cost at least ₹" + minimumCost + ", which is over your ₹" + budget + " budget.";
  }
  return "No order fits your ₹" + budget + " budget with these preferences. We sell: " + sellableProductNames() + ".";
}

function clarification(message: string): OrderResponse {
  return { status: "clarification", items: [], total: 0, message: message };
}

function cannotFulfil(message: string): OrderResponse {
  return { status: "cannot_fulfil", items: [], total: 0, message: message };
}

// "Mango drink (₹300), Lime soda (₹200), Drinking water (₹100)" - only products with stock
function sellableProductNames(): string {
  const names: string[] = [];
  for (const product of CATALOGUE) {
    if (product.stock > 0) {
      names.push(product.name + " (₹" + product.price + ")");
    }
  }
  return names.join(", ");
}

// "1 case of Mango drink, 2 cases of Lime soda"
function describeItems(items: Item[]): string {
  const parts: string[] = [];
  for (const item of items) {
    const product = findProduct(item.sku)!;
    const caseWord = item.quantity === 1 ? "case" : "cases";
    parts.push(item.quantity + " " + caseWord + " of " + product.name);
  }
  return parts.join(", ");
}
