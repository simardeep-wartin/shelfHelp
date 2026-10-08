// Config for real-model evals that need vitest's module mocking (npm run eval:catalogue).
// Separate from the default config so npm test never calls the API.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["evals/**/*.eval.ts"],
    testTimeout: 300000, // real API calls with retries can take a while
  },
});
