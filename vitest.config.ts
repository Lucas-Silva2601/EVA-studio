import { defineConfig } from "vitest/config";

/**
 * Configuração do Vitest para testes unitários (Fase 5).
 * Ambiente Node para funções em lib/ (sem DOM).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/**/*.spec.ts"],
    globals: false,
  },
});
