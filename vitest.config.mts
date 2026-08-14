import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // `.tsx` was missing, so no component could be tested even if a test for one
    // existed — which is why a rendering bug could reach production with every
    // check green. Server-rendering is enough to catch a component that throws,
    // so no browser environment is needed.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
