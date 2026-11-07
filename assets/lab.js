// Drives the "Break my service" lab page. The simulation itself lives in slo-sim.js.
(function () {
  "use strict";
  var api = window.SloSim;
  var grid = document.querySelector(".lab-grid");
  if (!api || !grid) return;
  grid.hidden = false;

  var $ = function (id) { return document.getElementById(id); };
  var slider = $("lab-errors");
  var sliderOut = $("lab-errors-out");
  var pauseBtn = $("lab-pause");
  var events = $("lab-events");
  var verdict = $("lab-verdict");
  var line = $("lab-line");

  var CHART_MINUTES = 180; // 3 simulated hours
  var CHART_MAX = 20; // burn rate at the top of the chart
  var sim, history, shown, speed = 1, paused = false;

  function pct(x, digits) { return (x * 100).toFixed(digits) + "%"; }
  // 8px of padding top and bottom, so a healthy line and an off-the-chart line both stay visible.
  function yFor(burn) { return 192 - (Math.min(burn, CHART_MAX) / CHART_MAX) * 184; }

  // Threshold lines at burn rates 1, 6, and 14.4.
  [["lab-th-1", 1], ["lab-th-6", 6], ["lab-th-14", 14.4]].forEach(function (t) {
    var el = document.querySelector("." + t[0]);
    el.setAttribute("y1", yFor(t[1]));
    el.setAttribute("y2", yFor(t[1]));
  });

  function log(text, kind) {
    var li = document.createElement("li");
    if (kind) li.className = "lab-ev-" + kind;
    var when = document.createElement("span");
    when.className = "lab-when";
    when.textContent = api.clock(sim.elapsed());
    li.appendChild(when);
    li.appendChild(document.createTextNode(" " + text));
    events.insertBefore(li, events.firstChild);
    while (events.children.length > 8) events.removeChild(events.lastChild);
  }

  function reset() {
    sim = new api.Sim();
    sim.setErrorRate(Number(slider.value) / 100);
    // The chart starts with the healthy hours that came before the lab opened.
    history = [];
    for (var i = 0; i < CHART_MINUTES; i++) history.push(sim.burn(5));
    shown = 0;
    events.textContent = "";
    verdict.textContent = "";
    verdict.className = "lab-verdict";
    log("Lab opened with 3 healthy days of history.");
    render();
  }

  function setAlert(id, firing) {
    var el = $(id);
    el.classList.toggle("is-firing", firing);
    el.querySelector("span").textContent = firing ? "firing" : "quiet";
  }

  function render() {
    var left = sim.budgetLeft();
    var burn = sim.burn(5);
    $("lab-clock").textContent = api.clock(sim.elapsed());
    $("lab-budget").textContent = left > -10 ? pct(left, 1) : "below -1000%";
    $("lab-budget").className = left <= 0 ? "is-bad" : left < 0.25 ? "is-warn" : "";
    $("lab-burn").textContent = burn < 100 ? burn.toFixed(1) + "x" : Math.round(burn) + "x";
    $("lab-ratio").textContent = pct(sim.ratio(5), 2);
    var fill = $("lab-meter-fill");
    fill.style.width = Math.max(0, Math.min(1, left)) * 100 + "%";
    fill.className = left <= 0 ? "is-bad" : left < 0.25 ? "is-warn" : "";
    setAlert("lab-page", sim.alerts.page);
    setAlert("lab-ticket", sim.alerts.ticket);

    var points = history.map(function (b, i) {
      var x = (i + CHART_MINUTES - history.length) * (600 / (CHART_MINUTES - 1));
      return x.toFixed(1) + "," + yFor(b).toFixed(1);
    });
    line.setAttribute("points", points.join(" "));
  }

  function tick() {
    if (paused || document.hidden) return;
    for (var i = 0; i < speed; i++) {
      sim.step(1);
      history.push(sim.burn(5));
    }
    if (history.length > CHART_MINUTES) history = history.slice(-CHART_MINUTES);
    for (; shown < sim.events.length; shown++) {
      var e = sim.events[shown];
      var name = e.kind === "page" ? "Page" : "Ticket";
      log(e.firing ? name + " fired." : name + " cleared.", e.firing ? "fire" : "clear");
    }
    render();
  }

  function setRate(value) {
    slider.value = value;
    sliderOut.textContent = Number(value) + "%";
    sim.setErrorRate(Number(value) / 100);
  }

  slider.addEventListener("input", function () { setRate(slider.value); });
  slider.addEventListener("change", function () { log("Failing checkouts set to " + Number(slider.value) + "%."); });
  document.querySelectorAll(".lab-presets [data-rate]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setRate(btn.getAttribute("data-rate"));
      log("Scenario: " + btn.textContent + ".");
    });
  });
  document.querySelectorAll('input[name="lab-speed"]').forEach(function (r) {
    r.addEventListener("change", function () { speed = Number(r.value); });
  });
  pauseBtn.addEventListener("click", function () {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
  });
  $("lab-reset").addEventListener("click", function () {
    setRate(0);
    reset();
  });

  function showVerdict(result, what) {
    verdict.textContent = (result.allowed ? "Shipped: " : "Blocked: ") + result.reason;
    verdict.className = "lab-verdict " + (result.allowed ? "is-ok" : "is-bad");
    log(what + (result.allowed ? (result.hotfix ? " shipped as a hotfix." : " shipped.") : " blocked by the gate."), result.allowed ? "clear" : "fire");
  }
  $("lab-ship").addEventListener("click", function () { showVerdict(sim.gate(), "Feature"); });
  $("lab-hotfix").addEventListener("submit", function (e) {
    e.preventDefault();
    showVerdict(sim.gate($("lab-reason").value), "Hotfix");
  });

  reset();
  window.setInterval(tick, 1000);
})();
