import { defineConfig } from "vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./apps/frontend-web/src", import.meta.url)) },
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
