import assert from "node:assert/strict";
import { test } from "node:test";
import { OBJECTIVE, probe, record, summarize, WINDOW_DAYS } from "../scripts/uptime.mjs";

const page = (status, body) => async () => ({ status, text: async () => body });
// A fake clock: the first reading is 0 and every later one is `ms`, so a check "takes" ms.
const timer = (ms) => {
  let calls = 0;
  return () => (calls++ === 0 ? 0 : ms);
};

test("a fast 200 with the expected text is a good check", async () => {
  const r = await probe("https://x.test/", "Abhirup Khan", { fetchImpl: page(200, "<h1>Abhirup Khan</h1>"), now: timer(200) });
  assert.deepEqual([r.ok, r.status, r.ms], [true, 200, 200]);
});

test("errors, missing content, slowness, and timeouts are bad checks", async () => {
  assert.equal((await probe("https://x.test/", "Abhirup", { fetchImpl: page(503, "down"), now: timer(50) })).error, "HTTP 503");
  assert.equal((await probe("https://x.test/", "Abhirup", { fetchImpl: page(200, "Parked domain"), now: timer(50) })).error, "Expected text missing");
  assert.match((await probe("https://x.test/", "Abhirup", { fetchImpl: page(200, "Abhirup"), now: timer(4000) })).error, /^Slow/);
  const timeout = async () => {
    throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
  };
  const r = await probe("https://x.test/", "Abhirup", { fetchImpl: timeout, now: timer(10) });
  assert.deepEqual([r.ok, r.error], [false, "Timed out"]);
});

test("results roll up by day into availability and error budget", () => {
  let data = {};
  const day = new Date("2026-11-07T10:00:00Z");
  for (let i = 0; i < 999; i++) data = record(data, { ok: true, status: 200, ms: 100 }, day);
  data = record(data, { ok: false, status: 503, ms: 80, error: "HTTP 503" }, day);
  const s = data.summary;
  assert.equal(s.checks, 1000);
  assert.equal(s.availability, 0.999);
  // Exactly at the 99.9% objective, the whole budget is spent.
  assert.ok(Math.abs(s.budgetLeft) < 1e-9);
  assert.equal(s.since, "2026-11-07");
  assert.equal(s.lastOk, false);
  assert.equal(data.recent.length, 12);
  assert.equal(data.recent[0].error, "HTTP 503");
});

test("only the last 30 days count", () => {
  let data = {};
  data = record(data, { ok: false, status: 0, ms: 0 }, new Date("2026-10-01T00:00:00Z"));
  data = record(data, { ok: true, status: 200, ms: 90 }, new Date("2026-11-07T00:00:00Z"));
  assert.deepEqual(Object.keys(data.days), ["2026-11-07"]);
  assert.equal(data.summary.availability, 1);
  assert.equal(data.summary.windowDays, WINDOW_DAYS);
  assert.equal(data.summary.objective, OBJECTIVE);
});

test("no data yet means no numbers, not zero", () => {
  const s = summarize({ days: {} });
  assert.deepEqual([s.checks, s.availability, s.budgetLeft], [0, null, null]);
});
