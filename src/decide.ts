// Decides the final response from the extracted constraints.
// Pure code, no LLM: picks the status, builds the order with the solver,
// and writes the message from templates, so the message can never invent anything.
import { CATALOGUE, findProduct } from "./catalogue";
import type { Extraction, Item, OrderResponse } from "./schema";
import { solve, orderTotal } from "./solver";

export function respond(extraction: Extraction): OrderResponse {
  // 1. No budget, or a vague one -> ask for it instead of guessing
  if (extraction.budget === null) {
    return clarification("What is your budget for this order?");
  }
  if (extraction.budgetUnclear) {
    return clarification("Could you confirm your exact budget in rupees?");
  }

  // 2. Customer asked for something we don't sell
  if (extraction.unknownProducts.length > 0) {
    return cannotFulfil(
      "We don't stock " + extraction.unknownProducts.join(", ") + ". We sell: " + sellableProductNames() + ".",
    );
  }

  // 3. A product the customer insists on can't be supplied
  const stockProblem = findStockProblem(extraction);
  if (stockProblem !== null) {
    return cannotFulfil(stockProblem);
  }

  // 4. Search for the best valid order
  const items = solve(extraction);
  if (items === null) {
    return cannotFulfil(
      "No order fits your ₹" + extraction.budget + " budget with these preferences. We sell: " + sellableProductNames() + ".",
    );
  }

  // 5. Success
  const total = orderTotal(items);
  return {
    status: "recommendation",
    items: items,
    total: total,
    message: "For your ₹" + extraction.budget + " budget: " + describeItems(items) + ". Total ₹" + total + ".",
  };
}

// Returns a reason if a required or "only" product can't be supplied, otherwise null.
function findStockProblem(extraction: Extraction): string | null {
  // Every required product must have enough stock
  for (const requirement of extraction.required) {
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
