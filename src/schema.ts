// Shapes of the data flowing through Shelf Help, checked at runtime with zod.
import { z } from "zod";
import { SKUS } from "./catalogue";

// A SKU must be one of the catalogue SKUs. Anything else fails validation.
export const SkuSchema = z.enum(SKUS);

// ---------- Input: one customer request from requests.json ----------

export const RequestSchema = z.object({
  id: z.string(),
  text: z.string(),
});

// requests.json is a list of requests
export const RequestFileSchema = z.array(RequestSchema);

// ---------- What the LLM extracts from the customer's text ----------
// The model only fills in these fields. There is deliberately no field for
// price, stock or discount, so the customer cannot change them.

export const ExtractionSchema = z.object({
  budget: z.number().nullable(), // null when the customer gave no budget
  budgetUnclear: z.boolean(), // true for things like "around 500" or "500-800"
  onlySkus: z.array(SkuSchema), // "only mango" -> ["MANGO"]
  excludeSkus: z.array(SkuSchema), // "no water" -> ["WATER"]
  required: z.array(
    // "at least 2 mango" -> { sku: "MANGO", minQty: 2, maxQty: null }
    // "exactly 2 mango"  -> { sku: "MANGO", minQty: 2, maxQty: 2 }
    z.object({
      sku: SkuSchema,
      minQty: z.number().int(),
      maxQty: z.number().int().nullable(), // null = no upper limit
    }),
  ),
  unknownProducts: z.array(z.string()), // products we don't sell, e.g. "Pepsi"
});

export type Extraction = z.infer<typeof ExtractionSchema>;

// ---------- Output: the response we send back for each request ----------

export const ItemSchema = z.object({
  sku: SkuSchema,
  quantity: z.number().int().positive(), // whole number of cases, at least 1
});

export type Item = z.infer<typeof ItemSchema>;

export const ResponseSchema = z
  .object({
    status: z.enum(["recommendation", "clarification", "cannot_fulfil"]),
    items: z.array(ItemSchema),
    total: z.number().int().min(0),
    message: z.string().min(1),
  })
  // Rule: clarification and cannot_fulfil carry no items and a total of 0
  .refine(
    (response) => {
      if (response.status === "recommendation") {
        return true;
      }
      return response.items.length === 0 && response.total === 0;
    },
    { message: "clarification and cannot_fulfil must have empty items and total 0" },
  )
  // Rule: a recommendation must actually recommend something
  .refine(
    (response) => {
      if (response.status !== "recommendation") {
        return true;
      }
      return response.items.length > 0;
    },
    { message: "recommendation must have at least one item" },
  );

export type OrderResponse = z.infer<typeof ResponseSchema>;
