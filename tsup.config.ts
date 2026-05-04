import { defineConfig } from "tsup";
import { readFileSync, copyFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node22",
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    "process.env.TRACEPULSE_VERSION": JSON.stringify(pkg.version),
  },
  onSuccess: async () => {
    // Copy cluster-config.json to dist/ so gateway.ts can find it at runtime
    copyFileSync("src/clusters/cluster-config.json", "dist/cluster-config.json");
  },
});
