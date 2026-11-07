// The lab must behave like the real Burn_Rate alerts (checked there with promtool).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const { Sim, clock } = createRequire(import.meta.url)("../assets/slo-sim.js");

function firstEvent(sim, kind, firing = true) {
  return sim.events.find((e) => e.kind === kind && e.firing === firing);
}

test("a healthy service stays quiet and ships features", () => {
  const sim = new Sim();
  sim.step(24 * 60);
  assert.deepEqual(sim.events, []);
  assert.ok(sim.budgetLeft() > 0.9);
  assert.equal(sim.gate().allowed, true);
});

test("a full outage pages in about 4.5 minutes, not at 2", () => {
  const sim = new Sim();
  sim.setErrorRate(1);
  sim.step(2);
  assert.equal(sim.alerts.page, false);
  sim.step(6);
  const page = firstEvent(sim, "page");
  assert.ok(page && page.minute >= 4 && page.minute <= 5, `paged at minute ${page?.minute}`);
});

test("a full outage spends the budget in about 22 minutes, then the gate blocks features", () => {
  const sim = new Sim();
  sim.setErrorRate(1);
  sim.step(20);
  assert.equal(sim.gate().allowed, true);
  sim.step(5);
  assert.ok(sim.budgetLeft() <= 0);
  const g = sim.gate();
  assert.equal(g.allowed, false);
  assert.match(g.reason, /budget spent/);
});

test("a hotfix gets through only with a real reason", () => {
  const sim = new Sim();
  sim.setErrorRate(1);
  sim.step(30);
  assert.equal(sim.gate("fix").allowed, false);
  const g = sim.gate("Roll back the bad config");
  assert.equal(g.allowed, true);
  assert.equal(g.hotfix, true);
});

test("a 2% slow leak opens a ticket after about 18 hours and never pages", () => {
  const sim = new Sim();
  sim.setErrorRate(0.02);
  sim.step(60);
  assert.deepEqual(sim.events, []);
  sim.step(23 * 60);
  const ticket = firstEvent(sim, "ticket");
  assert.ok(ticket && ticket.minute >= 17 * 60 && ticket.minute <= 19 * 60, `ticket at minute ${ticket?.minute}`);
  assert.equal(firstEvent(sim, "page"), undefined);
});

test("after a fix the fast page clears, and the alert record shows when", () => {
  const sim = new Sim();
  sim.setErrorRate(1);
  sim.step(6);
  sim.setErrorRate(0);
  sim.step(90);
  assert.ok(firstEvent(sim, "page", false), "page cleared");
  assert.equal(sim.alerts.page, false);
});

test("the clock reads like a real one", () => {
  assert.equal(clock(0), "Day 4, 00:00");
  assert.equal(clock(195), "Day 4, 03:15");
  assert.equal(clock(1440 + 61), "Day 5, 01:01");
});
