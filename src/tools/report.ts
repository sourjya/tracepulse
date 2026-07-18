/**
 * `tracepulse report` — an on-demand, read-only view over persisted telemetry.
 *
 * Reads `.tracepulse/telemetry.json` (the compacted journal) and renders either a
 * terminal summary (with a Unicode sparkline) or a single self-contained HTML file.
 * It touches nothing on the hot path — no server, no daemon, no runtime overhead;
 * it just formats data that already exists.
 *
 * What's charted is MEASURED (per-session error counts, recurring fingerprints).
 * Fix/recurrence RATES are not persisted here — call `get_effectiveness_report` in a
 * live session for those (stated in the report footer so nothing is over-claimed).
 *
 * @see docs/research/telemetry-savings-measurement.md (TRP-73)
 * @see TRP-86
 */

import type { TelemetrySummary } from "@/persistence/event-journal.js";

/** Chart-ready model built from the telemetry summary. */
export interface ReportModel {
  readonly totals: { readonly sessions: number; readonly errors: number; readonly unique_fingerprints: number };
  readonly sessions: ReadonlyArray<{ readonly label: string; readonly error_count: number; readonly unique_fingerprints: number }>;
  readonly top_fingerprints: ReadonlyArray<{ readonly fp: string; readonly total_occurrences: number; readonly last_state?: string }>;
}

const SPARK = "▁▂▃▄▅▆▇█";

/** Render a Unicode sparkline for a series of non-negative values. */
export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 0);
  if (max === 0) return SPARK[0].repeat(values.length);
  return values.map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))]).join("");
}

/** Format a ms timestamp as an ISO date (YYYY-MM-DD), stable across locales. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Build the chart model from the persisted telemetry summary. */
export function buildReportModel(t: TelemetrySummary): ReportModel {
  const sessions = [...t.sessions]
    .sort((a, b) => a.started_at - b.started_at)
    .map((s) => ({ label: isoDate(s.started_at), error_count: s.error_count, unique_fingerprints: s.unique_fingerprints }));

  const errors = sessions.reduce((sum, s) => sum + s.error_count, 0);
  const uniqueFingerprints = Object.keys(t.fingerprints).length;

  const top_fingerprints = Object.entries(t.fingerprints)
    .map(([fp, f]) => ({ fp, total_occurrences: f.total_occurrences, last_state: f.last_state }))
    .sort((a, b) => b.total_occurrences - a.total_occurrences)
    .slice(0, 10);

  return {
    totals: { sessions: sessions.length, errors, unique_fingerprints: uniqueFingerprints },
    sessions,
    top_fingerprints,
  };
}

const FOOTER_NOTE =
  "Measured from .tracepulse/telemetry.json (per-session error counts + recurring fingerprints). " +
  "Confirmed-fix / recurrence rates are not persisted here — call get_effectiveness_report in a live session.";

/** Render a terminal summary with a sparkline. */
export function renderReportText(m: ReportModel): string {
  const lines: string[] = [];
  lines.push("TracePulse Report");
  lines.push("=".repeat(40));
  lines.push("");
  lines.push(`Sessions: ${m.totals.sessions}   Errors: ${m.totals.errors}   Unique fingerprints: ${m.totals.unique_fingerprints}`);
  lines.push("");
  if (m.sessions.length > 0) {
    lines.push(`Errors per session:  ${sparkline(m.sessions.map((s) => s.error_count))}`);
    lines.push(`  ${m.sessions[0].label} → ${m.sessions[m.sessions.length - 1].label}`);
    lines.push("");
  }
  if (m.top_fingerprints.length > 0) {
    lines.push("Top recurring errors:");
    for (const f of m.top_fingerprints) {
      lines.push(`  ${f.fp.slice(0, 12)}…  ${f.total_occurrences}×${f.last_state ? `  (${f.last_state})` : ""}`);
    }
    lines.push("");
  }
  lines.push(FOOTER_NOTE);
  return lines.join("\n");
}

/** Escape a string for safe inclusion in HTML text/attributes. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Render a self-contained HTML dashboard (inline SVG + CSS, no external deps).
 * Theme-aware (light/dark via prefers-color-scheme). Single sequential hue for
 * magnitude (one series → no legend, per the dataviz method).
 */
export function renderReportHtml(m: ReportModel): string {
  const maxErr = Math.max(1, ...m.sessions.map((s) => s.error_count));
  const barW = 26, gap = 8, chartH = 160, padL = 8;
  const bars = m.sessions.map((s, i) => {
    const h = Math.round((s.error_count / maxErr) * (chartH - 24));
    const x = padL + i * (barW + gap);
    const y = chartH - h;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" class="bar"><title>${esc(s.label)}: ${s.error_count} errors</title></rect>`
      + `<text x="${x + barW / 2}" y="${y - 4}" class="barlabel">${s.error_count}</text>`;
  }).join("");
  const chartW = Math.max(320, padL * 2 + m.sessions.length * (barW + gap));

  const maxOcc = Math.max(1, ...m.top_fingerprints.map((f) => f.total_occurrences));
  const rowH = 24;
  const fpRows = m.top_fingerprints.map((f, i) => {
    const w = Math.round((f.total_occurrences / maxOcc) * 260);
    const y = i * rowH;
    return `<g transform="translate(0,${y})">`
      + `<text x="0" y="15" class="fplabel">${esc(f.fp.slice(0, 12))}…</text>`
      + `<rect x="110" y="4" width="${w}" height="14" rx="4" class="bar"><title>${esc(f.fp)}: ${f.total_occurrences}×</title></rect>`
      + `<text x="${110 + w + 6}" y="15" class="barlabel">${f.total_occurrences}</text>`
      + `</g>`;
  }).join("");

  const tile = (label: string, value: number) =>
    `<div class="tile"><div class="tileval">${value}</div><div class="tilelabel">${esc(label)}</div></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TracePulse Report</title>
<style>
  :root {
    --bg: #ffffff; --surface: #f6f8fa; --ink: #1f2328; --muted: #656d76;
    --grid: #d0d7de; --bar: #2563eb; --barlabel: #656d76;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --surface: #161b22; --ink: #e6edf3; --muted: #8b949e; --grid: #30363d; --bar: #4f9bff; --barlabel: #8b949e; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: var(--bg); color: var(--ink);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; color: var(--ink); }
  .sub { color: var(--muted); margin: 0 0 16px; }
  .tiles { display: flex; gap: 12px; flex-wrap: wrap; }
  .tile { background: var(--surface); border: 1px solid var(--grid); border-radius: 8px; padding: 12px 16px; min-width: 120px; }
  .tileval { font-size: 24px; font-weight: 600; }
  .tilelabel { color: var(--muted); font-size: 12px; }
  .card { background: var(--surface); border: 1px solid var(--grid); border-radius: 8px; padding: 16px; margin-top: 8px; overflow-x: auto; }
  .bar { fill: var(--bar); }
  .barlabel { fill: var(--barlabel); font-size: 11px; text-anchor: middle; }
  .fplabel { fill: var(--ink); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  svg text.fplabel { text-anchor: start; }
  footer { color: var(--muted); font-size: 12px; margin-top: 24px; border-top: 1px solid var(--grid); padding-top: 12px; }
  .empty { color: var(--muted); font-style: italic; }
</style>
</head>
<body>
  <h1>TracePulse Report</h1>
  <p class="sub">On-demand view of persisted telemetry — read-only, generated from <code>.tracepulse/telemetry.json</code>.</p>
  <div class="tiles">
    ${tile("Sessions", m.totals.sessions)}
    ${tile("Errors", m.totals.errors)}
    ${tile("Unique fingerprints", m.totals.unique_fingerprints)}
  </div>

  <h2>Errors per session</h2>
  <div class="card">
    ${m.sessions.length
      ? `<svg width="${chartW}" height="${chartH + 20}" role="img" aria-label="Errors per session bar chart">${bars}</svg>`
      : `<span class="empty">No sessions recorded yet.</span>`}
  </div>

  <h2>Top recurring errors</h2>
  <div class="card">
    ${m.top_fingerprints.length
      ? `<svg width="420" height="${m.top_fingerprints.length * rowH + 8}" role="img" aria-label="Top recurring errors bar chart">${fpRows}</svg>`
      : `<span class="empty">No recurring fingerprints yet.</span>`}
  </div>

  <footer>${esc(FOOTER_NOTE)}</footer>
</body>
</html>
`;
}
