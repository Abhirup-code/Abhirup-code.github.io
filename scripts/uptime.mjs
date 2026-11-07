// Checks the live site and keeps 30 days of results, so the site can show its own SLO.
// Run by .github/workflows/uptime.yml every 15 minutes. Results live on the uptime-data branch.
//
//   node scripts/uptime.mjs --url https://abhirupkhan.me/ --expect "Abhirup Khan" --data data/status.json

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const OBJECTIVE = 0.999; // 99.9% of checks succeed over 30 days
export const WINDOW_DAYS = 30;
export const SLOW_MS = 3000; // a page slower than this counts as a failed check
const RECENT = 12;

/** One check: the page must answer 200, contain the expected text, and be fast enough. */
export async function probe(url, expect, { timeoutMs = 10000, fetchImpl = fetch, now = () => performance.now() } = {}) {
  const start = now();
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: { "User-Agent": "abhirupkhan.me uptime check" },
    });
    const body = await res.text();
    const ms = Math.round(now() - start);
    if (res.status !== 200) return { ok: false, status: res.status, ms, error: `HTTP ${res.status}` };
    if (!body.includes(expect)) return { ok: false, status: res.status, ms, error: "Expected text missing" };
    if (ms > SLOW_MS) return { ok: false, status: res.status, ms, error: `Slow: ${ms} ms` };
    return { ok: true, status: res.status, ms };
  } catch (err) {
    const error = err.name === "TimeoutError" ? "Timed out" : err.message;
    return { ok: false, status: 0, ms: Math.round(now() - start), error };
  }
}

const dayKey = (date) => date.toISOString().slice(0, 10);

/** Adds one result, drops days older than the window, and recomputes the summary. */
export function record(data, result, at = new Date()) {
  const next = structuredClone(data ?? {});
  next.version = 1;
  next.objective = OBJECTIVE;
  next.days ??= {};
  const day = (next.days[dayKey(at)] ??= { good: 0, bad: 0 });
  day[result.ok ? "good" : "bad"] += 1;

  const oldest = dayKey(new Date(at.getTime() - (WINDOW_DAYS - 1) * 86400000));
  for (const k of Object.keys(next.days)) if (k < oldest) delete next.days[k];

  const entry = { t: at.toISOString(), ok: result.ok, ms: result.ms, status: result.status };
  if (result.error) entry.error = result.error;
  next.recent = [entry, ...(next.recent ?? [])].slice(0, RECENT);
  next.summary = summarize(next, at);
  return next;
}

/** Availability and error budget over the window, as the site's badge shows them. */
export function summarize(data, at = new Date()) {
  const days = Object.keys(data.days ?? {}).sort();
  let good = 0;
  let bad = 0;
  for (const k of days) {
    good += data.days[k].good;
    bad += data.days[k].bad;
  }
  const checks = good + bad;
  return {
    windowDays: WINDOW_DAYS,
    objective: OBJECTIVE,
    checks,
    good,
    availability: checks ? good / checks : null,
    budgetLeft: checks ? 1 - bad / checks / (1 - OBJECTIVE) : null,
    since: days[0] ?? null,
    lastCheck: data.recent?.[0]?.t ?? at.toISOString(),
    lastOk: data.recent?.[0]?.ok ?? null,
  };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url, expect, data: path } = args(process.argv.slice(2));
  if (!url?.startsWith("https://") || !expect || !path) {
    console.error('Usage: node scripts/uptime.mjs --url https://... --expect "text" --data status.json');
    process.exit(2);
  }
  const before = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const result = await probe(url, expect);
  const after = record(before, result);
  writeFileSync(path, JSON.stringify(after, null, 2) + "\n");
  const s = after.summary;
  const detail = result.error ? ` (${result.error})` : "";
  console.log(`${result.ok ? "UP" : "DOWN"} ${result.status} ${result.ms} ms${detail}`);
  console.log(`30 days: ${s.good}/${s.checks} good, ${(s.availability * 100).toFixed(3)}%, budget left ${(s.budgetLeft * 100).toFixed(1)}%`);
}
