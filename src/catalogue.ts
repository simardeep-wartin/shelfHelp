// The product catalogue.
// This file is the ONLY source of truth for products, prices and stock.
// Nothing the customer or the model says can change these values.

// Every SKU we sell. "as const" makes TypeScript treat these as fixed values, not any string.
export const SKUS = ["MANGO", "LIME", "WATER", "BERRY"] as const;

// Sku is one of: "MANGO" | "LIME" | "WATER" | "BERRY"
export type Sku = (typeof SKUS)[number];

export type Product = {
  sku: Sku;
  name: string;
  price: number; // rupees per case
  stock: number; // cases in stock
};

export const CATALOGUE: Product[] = [
  { sku: "MANGO", name: "Mango drink", price: 300, stock: 4 },
  { sku: "LIME", name: "Lime soda", price: 200, stock: 6 },
  { sku: "WATER", name: "Drinking water", price: 100, stock: 10 },
  { sku: "BERRY", name: "Berry fizz", price: 400, stock: 0 },
];

// Look up a product by its SKU. Returns undefined if we don't sell it.
export function findProduct(sku: string): Product | undefined {
  for (const product of CATALOGUE) {
    if (product.sku === sku) {
      return product;
    }
  }
  return undefined;
}
