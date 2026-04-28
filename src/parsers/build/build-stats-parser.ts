/**
 * Build stats parser for TracePulse.
 *
 * Parses Vite/webpack build statistics (module count, build time, bundle size)
 * from dev server output. These are info-level events that surface in
 * get_build_errors as metadata.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** Vite: 910 modules transformed. */
const VITE_MODULES = /(\d+)\s+modules?\s+transformed/;

/** Vite: built in 1.06s */
const VITE_BUILT = /built in\s+([\d.]+)\s*(s|ms)/;

/** webpack: compiled successfully in 245 ms */
const WEBPACK_COMPILED = /compiled\s+(?:successfully\s+)?in\s+([\d.]+)\s*(s|ms)/i;

/** webpack: asset main.js 1.2 MiB */
const WEBPACK_ASSET = /asset\s+(\S+)\s+([\d.]+)\s*(KiB|MiB|B)/;

export const buildStatsParser: ErrorParser = {
  name: "build-stats",

  canParse(line: string): boolean {
    return VITE_MODULES.test(line) || VITE_BUILT.test(line) ||
           WEBPACK_COMPILED.test(line) || WEBPACK_ASSET.test(line);
  },

  parse(line: string): ParsedError | null {
    const modulesMatch = line.match(VITE_MODULES);
    if (modulesMatch) {
      return {
        message: `Build: ${modulesMatch[1]} modules transformed`,
        level: "info",
        context: { framework: "vite" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const viteBuilt = line.match(VITE_BUILT);
    if (viteBuilt) {
      return {
        message: `Build completed in ${viteBuilt[1]}${viteBuilt[2]}`,
        level: "info",
        context: { framework: "vite" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const webpackMatch = line.match(WEBPACK_COMPILED);
    if (webpackMatch) {
      return {
        message: `Build compiled in ${webpackMatch[1]}${webpackMatch[2]}`,
        level: "info",
        context: { framework: "webpack" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    const assetMatch = line.match(WEBPACK_ASSET);
    if (assetMatch) {
      return {
        message: `Asset: ${assetMatch[1]} (${assetMatch[2]} ${assetMatch[3]})`,
        level: "info",
        context: { framework: "webpack" },
        scoring_hints: { is_user_code: false, has_stack_trace: false },
      };
    }

    return null;
  },
};
