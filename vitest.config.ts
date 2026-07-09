import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes de UNIDADE da lógica pura (sem IA, sem rede, sem DOM). Os aliases
// resolvem os imports "@/..." do apps/web e o pacote @stalo/shared direto pro
// source .ts (o vitest transpila via esbuild), sem precisar de build.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
      "@stalo/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "apps/web/src/**/*.test.ts"],
  },
});
