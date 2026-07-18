/**
 * Shared energy / cost model — the single source of truth for the constants used to
 * estimate the token, dollar, energy, and CO₂ figures TracePulse reports (TRP-81).
 *
 * IMPORTANT: these are **modeled estimates** from published research, not measurements
 * taken from the running system. Two surfaces previously disagreed by 10× on the energy
 * constant (`0.34` vs `0.034` Wh/1K tokens); this module reconciles them. Any output
 * derived from these constants MUST carry `ESTIMATE_PROVENANCE` so a modeled number is
 * never mistaken for an observed one.
 *
 * @see docs/research/telemetry-savings-measurement.md (TRP-73)
 */

/** USD per 1K input tokens (Claude Sonnet pricing, 2026). */
export const USD_PER_1K_TOKENS = 0.003;

/**
 * Watt-hours per 1K tokens (arXiv 2512.03024, peer-reviewed per-token figure).
 *
 * Chosen over the 0.34 Wh/1K "per-query average" figure previously used by
 * get_session_impact: the per-token measurement is the more defensible and more
 * conservative basis (10× lower → no over-claiming of energy saved).
 */
export const WH_PER_1K_TOKENS = 0.034;

/** Grams CO₂ per Wh (IEA 2025 global grid average). */
export const CO2_G_PER_WH = 0.4;

/** Human-readable citation for the constants above. */
export const ENERGY_MODEL_SOURCES =
  "energy 0.034 Wh/1K tokens (arXiv 2512.03024); CO₂ 0.4 g/Wh (IEA 2025 grid avg); cost $0.003/1K input tokens (Claude Sonnet 2026)";

/**
 * Provenance label for any figure derived from this model. Stamp it on outputs so
 * consumers (and the future `tracepulse report`) can distinguish modeled estimates
 * from measured values.
 */
export const ESTIMATE_PROVENANCE = "estimated (unvalidated model)";
