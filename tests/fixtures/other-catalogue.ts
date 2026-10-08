// A completely different catalogue, used to prove that nothing in src/ has the real
// products hardcoded. Tests swap it in for src/catalogue.ts with vi.mock.
// Same exports as src/catalogue.ts.
export const SKUS = ["COLA", "JUICE", "SODA"] as const;

export const CATALOGUE = [
  { sku: "COLA", name: "Cola can", price: 250, stock: 3 },
  { sku: "JUICE", name: "Orange juice", price: 150, stock: 0 },
  { sku: "SODA", name: "Club soda", price: 120, stock: 5 },
];

export function findProduct(sku: string) {
  for (const product of CATALOGUE) {
    if (product.sku === sku) {
      return product;
    }
  }
  return undefined;
}
