// The simulation behind the "Break my service" lab. It uses the same SLO, burn-rate alert
// tiers, and deploy gate rule as the Burn_Rate project, minute by simulated minute.
// Pure logic, no page access, so it can be unit tested in Node.
(function (root) {
  "use strict";

  var OBJECTIVE = 0.995; // 99.5% of checkouts succeed
  var BUDGET = 1 - OBJECTIVE; // so 0.5% may fail
  var BASELINE = 0.0002; // a healthy service still fails 0.02% of requests
  var PER_MINUTE = 600; // 10 requests per second
  // The lab starts with 3 healthy days behind it, because the slowest alert looks back 3 days.
  // With less history, a short blip looks like a big share of all traffic and alerts fire early.
  var HISTORY = 3 * 1440;
  var PERIOD = 30 * 1440; // the SLO window: 30 days

  // Multi-window, multi-burn-rate tiers from the Google SRE Workbook (as Sloth generates them).
  var TIERS = [
    { severity: "page", burn: 14.4, long: 60, short: 5 },
    { severity: "page", burn: 6, long: 360, short: 30 },
    { severity: "ticket", burn: 3, long: 1440, short: 120 },
    { severity: "ticket", burn: 1, long: 4320, short: 360 },
  ];

  function Sim() {
    this.total = [0]; // running totals, so any window is a subtraction
    this.errors = [0];
    this.errorRate = BASELINE;
    this.alerts = { page: false, ticket: false };
    this.events = [];
    for (var i = 0; i < HISTORY; i++) this._add(BASELINE);
  }

  Sim.prototype._add = function (rate) {
    var n = this.total.length - 1;
    this.total.push(this.total[n] + PER_MINUTE);
    this.errors.push(this.errors[n] + PER_MINUTE * rate);
  };

  /** Minutes simulated since the lab opened (history not counted). */
  Sim.prototype.elapsed = function () {
    return this.total.length - 1 - HISTORY;
  };

  /** Share of failed requests over the last `minutes`. */
  Sim.prototype.ratio = function (minutes) {
    var end = this.total.length - 1;
    var start = Math.max(0, end - minutes);
    var total = this.total[end] - this.total[start];
    return total ? (this.errors[end] - this.errors[start]) / total : 0;
  };

  /** How fast the budget burns over a window. 1 spends it in exactly 30 days. */
  Sim.prototype.burn = function (minutes) {
    return this.ratio(minutes) / BUDGET;
  };

  /** Share of the 30 day budget still unspent. Below 0 means the SLO is broken. */
  Sim.prototype.budgetLeft = function () {
    return 1 - this.ratio(PERIOD) / BUDGET;
  };

  Sim.prototype.firing = function (severity) {
    var self = this;
    return TIERS.some(function (t) {
      return t.severity === severity && self.burn(t.long) > t.burn && self.burn(t.short) > t.burn;
    });
  };

  /** Sets the share of requests that fail (0 to 1). Below the healthy baseline means healthy. */
  Sim.prototype.setErrorRate = function (rate) {
    this.errorRate = Math.min(1, Math.max(BASELINE, rate));
  };

  /** Advances the simulation and records alerts starting or stopping. */
  Sim.prototype.step = function (minutes) {
    for (var i = 0; i < (minutes || 1); i++) {
      this._add(this.errorRate);
      for (var s in this.alerts) {
        var now = this.firing(s);
        if (now !== this.alerts[s]) {
          this.alerts[s] = now;
          this.events.push({ minute: this.elapsed(), kind: s, firing: now });
        }
      }
    }
  };

  /**
   * The deploy gate: features ship only while budget is left. A hotfix ships anyway, but only
   * with a written reason of at least 10 characters, the same rule as Burn_Rate's gate.
   */
  Sim.prototype.gate = function (hotfixReason) {
    var left = this.budgetLeft();
    if (left > 0) return { allowed: true, reason: "Budget left, so the deploy goes out." };
    var why = (hotfixReason || "").trim();
    if (hotfixReason !== undefined && why.length >= 10) {
      return { allowed: true, hotfix: true, reason: "Hotfix allowed while the budget is spent: " + why };
    }
    if (hotfixReason !== undefined) {
      return { allowed: false, reason: "A hotfix needs a reason of at least 10 characters." };
    }
    return { allowed: false, reason: "Error budget spent. Only reliability fixes may deploy." };
  };

  /** "Day 2, 03:15" for a minute count since the lab opened. */
  function clock(minute) {
    var m = minute + HISTORY;
    var day = Math.floor(m / 1440) + 1;
    var hh = Math.floor((m % 1440) / 60);
    var mm = m % 60;
    return "Day " + day + ", " + (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }

  var api = { Sim: Sim, TIERS: TIERS, OBJECTIVE: OBJECTIVE, BUDGET: BUDGET, BASELINE: BASELINE, HISTORY: HISTORY, clock: clock };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SloSim = api;
})(this);
