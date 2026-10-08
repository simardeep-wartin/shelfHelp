// The order solver.
// Tries every possible order (every quantity of every product, up to its stock),
// keeps the ones that pass all business rules, and picks the best one.
// With the current catalogue that is 5 x 7 x 11 x 1 = 385 orders, so brute force is instant
// and easy to trust: if a valid order exists, we will find it.
import { CATALOGUE, findProduct } from "./catalogue";
import type { Extraction, Item } from "./schema";
import { checkOrderRules } from "./validate";

// Returns the best valid order, or null if no valid order exists.
export function solve(extraction: Extraction): Item[] | null {
  let bestItems: Item[] | null = null;

  for (const quantities of allQuantityCombinations(0)) {
    const items = toItems(quantities);
    if (items.length === 0) {
      continue; // an empty order is not a recommendation
    }
    const violations = checkOrderRules(items, orderTotal(items), extraction);
    if (violations.length > 0) {
      continue; // breaks a rule, skip it
    }
    if (bestItems === null || isBetter(items, bestItems)) {
      bestItems = items;
    }
  }

  return bestItems;
}

// Every possible list of quantities, one number per catalogue product (in catalogue order).
// Example with two products of stock 1: [[0,0], [0,1], [1,0], [1,1]]
function allQuantityCombinations(productIndex: number): number[][] {
  // No products left: one combination, the empty one
  if (productIndex === CATALOGUE.length) {
    return [[]];
  }
  const product = CATALOGUE[productIndex];
  const combinationsOfTheRest = allQuantityCombinations(productIndex + 1);

  const combinations: number[][] = [];
  for (let quantity = 0; quantity <= product.stock; quantity++) {
    for (const rest of combinationsOfTheRest) {
      combinations.push([quantity, ...rest]);
    }
  }
  return combinations;
}

// Turn [2, 0, 1, 0] into [{ sku: "MANGO", quantity: 2 }, { sku: "WATER", quantity: 1 }]
function toItems(quantities: number[]): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < CATALOGUE.length; i++) {
    if (quantities[i] > 0) {
      items.push({ sku: CATALOGUE[i].sku, quantity: quantities[i] });
    }
  }
  return items;
}

// Price comes from the catalogue only
export function orderTotal(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    const product = findProduct(item.sku);
    if (product !== undefined) {
      total = total + product.price * item.quantity;
    }
  }
  return total;
}

// Is order "a" better than order "b"? Checked in this order:
// 1. Spends more of the budget
// 2. Has more different products (a better mix)
// 3. Quantities are more even (smaller gap between biggest and smallest)
function isBetter(a: Item[], b: Item[]): boolean {
  if (orderTotal(a) !== orderTotal(b)) {
    return orderTotal(a) > orderTotal(b);
  }
  if (a.length !== b.length) {
    return a.length > b.length;
  }
  return quantityGap(a) < quantityGap(b);
}

function quantityGap(items: Item[]): number {
  let biggest = items[0].quantity;
  let smallest = items[0].quantity;
  for (const item of items) {
    if (item.quantity > biggest) biggest = item.quantity;
    if (item.quantity < smallest) smallest = item.quantity;
  }
  return biggest - smallest;
}
