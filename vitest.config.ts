import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Rules tests need the Firestore emulator; they run via `npm run test:rules`.
    exclude: ["**/node_modules/**", process.env.RULES_TEST ? "" : "tests/rules/**"].filter(Boolean),
  },
});
