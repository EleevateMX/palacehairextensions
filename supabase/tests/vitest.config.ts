import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Las pruebas comparten una sola base de datos: ejecución secuencial.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
