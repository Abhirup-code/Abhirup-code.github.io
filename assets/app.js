// Small enhancements on top of a page that works without JavaScript:
// the theme toggle, magnetic buttons, project pop-ups, and the recommendations carousel.
(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  /* ---------- Dark mode toggle ---------- */
  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set === "dark" || set === "light") return set;
    return systemDark.matches ? "dark" : "light";
  }
  function labelToggles() {
    var dark = currentTheme() === "dark";
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
    });
  }
  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* not saved, still switches */ }
      labelToggles();
    });
  });
  if (systemDark.addEventListener) systemDark.addEventListener("change", labelToggles);
  labelToggles();

  /* ---------- Magnetic buttons: lean a little toward the pointer ---------- */
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  document.querySelectorAll(".magnetic").forEach(function (el) {
    el.addEventListener("pointermove", function (e) {
      if (reduceMotion.matches || !finePointer.matches) return;
      var r = el.getBoundingClientRect();
      var x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      el.style.transform = "translate(" + (x * 6).toFixed(1) + "px, " + (y * 5).toFixed(1) + "px)";
    });
    el.addEventListener("pointerleave", function () { el.style.transform = ""; });
  });

  /* ---------- Project pop-ups ---------- */
  document.querySelectorAll("[data-dialog]").forEach(function (link) {
    var dialog = document.getElementById(link.getAttribute("data-dialog"));
    if (!dialog || typeof dialog.showModal !== "function") return; // falls back to the case study page
    link.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
      e.preventDefault();
      dialog.showModal();
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close(); // a click on the backdrop closes it
    });
    dialog.addEventListener("close", function () { link.focus(); });
  });

  /* ---------- Recommendations carousel ---------- */
  document.querySelectorAll("[data-carousel]").forEach(function (box) {
    var slides = Array.prototype.slice.call(box.querySelectorAll(".rec"));
    var controls = box.querySelector(".carousel-controls");
    if (slides.length < 2 || !controls) return;
    var status = box.querySelector(".carousel-status");
    var pauseBtn = box.querySelector(".carousel-pause");
    var index = 0;
    var timer = null;
    var paused = reduceMotion.matches; // never auto-advance for people who asked for less motion
    var hovering = false;

    box.classList.add("is-carousel");
    controls.hidden = false;

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) {
        var active = n === index;
        s.classList.toggle("is-active", active);
        s.setAttribute("aria-hidden", active ? "false" : "true");
        s.inert = !active;
      });
      status.textContent = "Recommendation " + (index + 1) + " of " + slides.length;
    }
    function anyOpen() {
      return slides.some(function (s) { var d = s.querySelector("details"); return d && d.open; });
    }
    function tick() {
      if (!paused && !hovering && !anyOpen() && !document.hidden) show(index + 1);
    }
    function setPaused(p) {
      paused = p;
      pauseBtn.textContent = p ? "Play" : "Pause";
      pauseBtn.setAttribute("aria-label", p ? "Play automatic slides" : "Pause automatic slides");
    }

    box.querySelector(".carousel-prev").addEventListener("click", function () { show(index - 1); });
    box.querySelector(".carousel-next").addEventListener("click", function () { show(index + 1); });
    pauseBtn.addEventListener("click", function () { setPaused(!paused); });
    box.addEventListener("mouseenter", function () { hovering = true; });
    box.addEventListener("mouseleave", function () { hovering = false; });
    box.addEventListener("focusin", function () { hovering = true; });
    box.addEventListener("focusout", function () { hovering = false; });

    setPaused(paused);
    show(0);
    timer = window.setInterval(tick, 9000);
  });
})();
