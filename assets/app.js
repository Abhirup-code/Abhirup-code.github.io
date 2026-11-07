// Small enhancements on top of a page that works without JavaScript: the theme toggle, magnetic
// buttons, pop-ups, skill proof, the recommendations carousel, and a hidden terminal.
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
  function setTheme(next) {
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) { /* not saved, still switches */ }
    labelToggles();
  }
  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener("click", function () { setTheme(currentTheme() === "dark" ? "light" : "dark"); });
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

  /* ---------- Pop-ups (projects and quick facts) ---------- */
  // Several links can open the same pop-up, so each pop-up remembers which one opened it
  // and sends focus back there when it closes.
  function openDialog(dialog, opener) {
    if (!dialog || typeof dialog.showModal !== "function") return false;
    dialog.opener = opener || document.activeElement;
    if (!dialog.open) dialog.showModal();
    return true;
  }
  document.querySelectorAll("dialog").forEach(function (dialog) {
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close(); // a click on the backdrop closes it
    });
    dialog.addEventListener("close", function () {
      if (dialog.opener && document.contains(dialog.opener)) dialog.opener.focus();
      dialog.opener = null;
    });
  });
  document.querySelectorAll("[data-dialog]").forEach(function (link) {
    var dialog = document.getElementById(link.getAttribute("data-dialog"));
    if (!dialog || typeof dialog.showModal !== "function") return; // falls back to the link's page
    link.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
      e.preventDefault();
      openDialog(dialog, link);
    });
  });

  /* ---------- Copy email in the quick view ---------- */
  document.querySelectorAll(".copy-email").forEach(function (btn) {
    if (!navigator.clipboard) return;
    btn.hidden = false;
    var status = btn.closest("dialog").querySelector(".copy-status");
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(btn.getAttribute("data-email")).then(function () {
        status.textContent = "Email copied: " + btn.getAttribute("data-email");
      }, function () {
        status.textContent = "Could not copy. The email is " + btn.getAttribute("data-email");
      });
    });
  });

  /* ---------- Skill proof: one open at a time, Esc or a click outside closes it ---------- */
  var proofs = Array.prototype.slice.call(document.querySelectorAll("details.proof"));
  function closeProofs(except) {
    proofs.forEach(function (d) { if (d !== except) d.open = false; });
  }
  proofs.forEach(function (d) {
    var pop = d.querySelector(".proof-pop");
    // Close the others right away on click; the toggle event below covers the keyboard too.
    d.querySelector("summary").addEventListener("click", function () { if (!d.open) closeProofs(d); });
    d.addEventListener("toggle", function () {
      if (!d.open) return;
      closeProofs(d);
      // Keep the list on screen when the chip is near an edge.
      pop.style.left = "";
      var r = pop.getBoundingClientRect();
      var max = document.documentElement.clientWidth - 12;
      var shift = Math.max(0, r.right - max);
      if (r.left - shift < 12) shift = r.left - 12;
      if (shift) pop.style.left = (-shift) + "px";
    });
    d.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && d.open) { d.open = false; d.querySelector("summary").focus(); }
    });
    pop.querySelectorAll("a:not([data-dialog])").forEach(function (a) {
      a.addEventListener("click", function () { d.open = false; });
    });
  });
  document.addEventListener("click", function (e) {
    if (document.querySelector("dialog[open]")) return; // a pop-up opened from the list keeps it open for focus
    if (!e.target.closest || !e.target.closest("details.proof")) closeProofs(null);
  });

  /* ---------- Recommendations carousel ---------- */
  document.querySelectorAll("[data-carousel]").forEach(function (box) {
    var slides = Array.prototype.slice.call(box.querySelectorAll(".rec"));
    var controls = box.querySelector(".carousel-controls");
    if (slides.length < 2 || !controls) return;
    var status = box.querySelector(".carousel-status");
    var pauseBtn = box.querySelector(".carousel-pause");
    var index = 0;
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
    window.setInterval(tick, 9000);
  });

  /* ---------- This site's own SLO, from the scheduled uptime check ---------- */
  // Filled in by the badge below, and read by the terminal's `uptime` command.
  var siteSlo = { text: "", state: "loading" };
  var sloBadge = document.querySelector(".site-slo");

  // Rounds down, so 99.996% never shows as a perfect 100.00%.
  function pct(x, digits) { var f = Math.pow(10, digits); return (Math.floor(x * 100 * f) / f).toFixed(digits) + "%"; }
  function ago(iso) {
    var mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 60) return mins + " min ago";
    var hours = Math.round(mins / 60);
    return hours < 48 ? hours + " h ago" : Math.round(hours / 24) + " days ago";
  }
  function describeSlo(s) {
    var fresh = Date.now() - Date.parse(s.lastCheck) < 2 * 3600000;
    var state = !fresh ? "stale" : s.budgetLeft > 0.25 ? "ok" : s.budgetLeft > 0 ? "warn" : "bad";
    var text;
    if (s.checks < 96) {
      // Under a day of checks: show the raw count, not a percentage that means little yet.
      var since = new Date(s.since + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      text = "This site's uptime: " + s.good + " of " + s.checks + " checks passed since " + since;
    } else {
      text = "This site: " + pct(s.availability, 2) + " up over " + s.windowDays + " days · error budget " +
        pct(Math.max(s.budgetLeft, 0), 0) + " left";
    }
    return { text: text + " · checked " + ago(s.lastCheck), state: state };
  }
  function validSummary(s) {
    return s && typeof s.checks === "number" && s.checks > 0 && typeof s.good === "number" &&
      typeof s.availability === "number" && typeof s.budgetLeft === "number" &&
      typeof s.windowDays === "number" && !isNaN(Date.parse(s.lastCheck)) && /^\d{4}-\d{2}-\d{2}$/.test(s.since);
  }
  if (sloBadge && window.fetch) {
    fetch(sloBadge.getAttribute("data-status-url"), { cache: "no-cache" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (data) {
        if (!validSummary(data.summary)) throw new Error("No usable data yet");
        siteSlo = describeSlo(data.summary);
        sloBadge.querySelector(".slo-text").textContent = siteSlo.text;
        sloBadge.className = "site-slo slo-" + siteSlo.state;
        sloBadge.hidden = false;
      })
      .catch(function () { siteSlo = { text: "", state: "unavailable" }; }); // the badge just stays hidden
  }

  /* ---------- Hidden terminal: the footer button or the ` key opens it ---------- */
  var term = document.getElementById("terminal");
  var dataEl = document.getElementById("site-data");
  if (term && dataEl && typeof term.showModal === "function") {
    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { data = null; }
    if (data) setUpTerminal(term, data);
  }

  function setUpTerminal(term, data) {
    var out = term.querySelector(".term-out");
    var form = term.querySelector(".term-form");
    var input = term.querySelector("#term-in");
    var openBtn = document.querySelector(".term-open");
    var history = [];
    var hIndex = 0;
    var started = false;
    var user = (data.shortName || "guest").toLowerCase();

    function line(text, cls) {
      var div = document.createElement("div");
      if (cls) div.className = cls;
      div.textContent = text;
      out.appendChild(div);
      return div;
    }
    function linkLine(prefix, label, href) {
      var div = line(prefix);
      var a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      if (/^https:/.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      div.appendChild(a);
      return div;
    }
    function blank() { line(""); }
    function go(href) {
      if (/^https:/.test(href)) window.open(href, "_blank", "noopener");
      else window.location.href = href;
    }

    var commands = {
      help: {
        about: "list commands",
        run: function () {
          line("Commands", "t-head");
          var narrow = out.clientWidth < 520; // phones: name and description on their own lines
          Object.keys(commands).forEach(function (name) {
            if (commands[name].hidden) return;
            if (narrow) { line("  " + name); line("      " + commands[name].about, "t-dim"); }
            else line("  " + (name + "            ").slice(0, 14) + commands[name].about);
          });
          line("Tip: Tab completes, the arrow keys bring back old commands, Esc closes.", "t-dim");
        }
      },
      whoami: {
        about: "who I am",
        run: function () {
          line(data.name + " (" + data.shortName + ")", "t-head");
          line(data.role);
          line(data.intro);
        }
      },
      quickview: {
        about: "the key details at a glance",
        run: function () {
          data.quick.forEach(function (q) { line((q.label + ":                    ").slice(0, 21) + q.value); });
        }
      },
      skills: {
        about: "skills by group",
        run: function () {
          data.skills.forEach(function (s) { line(s.group, "t-head"); line("  " + s.items.join(", ")); });
        }
      },
      projects: {
        about: "projects (then: open 1)",
        run: function () {
          data.projects.forEach(function (p, i) {
            var n = String(i + 1);
            linkLine("  " + (n.length < 2 ? " " : "") + n + "  ", p.title, p.href);
            line("      " + p.description, "t-dim");
          });
          line("Type open <number> to open one.", "t-dim");
        }
      },
      experience: {
        about: "where I have worked",
        run: function () {
          data.experience.forEach(function (e) {
            line(e.dates, "t-dim");
            line("  " + e.title + ", " + e.org);
          });
        }
      },
      awards: {
        about: "honors and awards",
        run: function () { data.awards.forEach(function (a) { line("  * " + a.title + " (" + a.org + ")"); }); }
      },
      leadership: {
        about: "leadership and volunteering",
        run: function () {
          data.leadership.forEach(function (l) { line("  " + l.title + ", " + l.org + (l.dates ? " (" + l.dates + ")" : "")); });
        }
      },
      contact: {
        about: "how to reach me",
        run: function () {
          linkLine("  email     ", data.links.email, "mailto:" + data.links.email);
          if (data.links.linkedin) linkLine("  linkedin  ", data.links.linkedin, data.links.linkedin);
          if (data.links.github) linkLine("  github    ", data.links.github, data.links.github);
        }
      },
      resume: {
        about: "open my resume (PDF)",
        run: function () {
          if (!data.links.resume) { line("No resume linked.", "t-err"); return; }
          linkLine("Opening ", data.links.resume, data.links.resume);
          go(data.links.resume);
        }
      },
      open: {
        about: "open 1, open resume, open github",
        run: function (args) {
          var what = (args[0] || "").toLowerCase();
          var n = parseInt(what, 10);
          if (n >= 1 && n <= data.projects.length) {
            var p = data.projects[n - 1];
            linkLine("Opening ", p.title, p.href);
            go(p.href);
          } else if (what === "resume") {
            commands.resume.run();
          } else if ((what === "linkedin" || what === "github") && data.links[what]) {
            linkLine("Opening ", data.links[what], data.links[what]);
            go(data.links[what]);
          } else {
            line("Usage: open <1-" + data.projects.length + "|resume|linkedin|github>", "t-err");
          }
        }
      },
      theme: {
        about: "theme dark or theme light",
        run: function (args) {
          var want = (args[0] || "").toLowerCase();
          if (want !== "dark" && want !== "light") want = currentTheme() === "dark" ? "light" : "dark";
          setTheme(want);
          line("Theme set to " + want + ".");
        }
      },
      ls: {
        about: "list files",
        run: function () { line("about.txt  projects/  experience/  skills.txt  awards.txt  resume.pdf  contact.txt"); }
      },
      cat: {
        about: "cat <file>",
        hidden: true,
        run: function (args) {
          var map = { "about.txt": "whoami", "skills.txt": "skills", "awards.txt": "awards", "contact.txt": "contact", "resume.pdf": "resume", "projects": "projects", "projects/": "projects", "experience": "experience", "experience/": "experience" };
          var cmd = map[(args[0] || "").toLowerCase()];
          if (cmd) commands[cmd].run([]);
          else line("cat: " + (args[0] || "") + ": No such file. Try ls.", "t-err");
        }
      },
      cd: {
        about: "",
        hidden: true,
        run: function (args) {
          var dir = (args[0] || "").replace(/\/$/, "").toLowerCase();
          if (dir === "projects" || dir === "experience") commands[dir].run([]);
          else if (!dir || dir === "~") line("");
          else line("cd: " + args[0] + ": No such directory. Try ls.", "t-err");
        }
      },
      hire: {
        about: "get in touch",
        run: function () {
          line("Let's talk:", "t-head");
          linkLine("  ", data.links.email, "mailto:" + data.links.email);
        }
      },
      sudo: {
        about: "",
        hidden: true,
        run: function (args) {
          if (args.join(" ").toLowerCase().indexOf("hire") === 0) { commands.hire.run([]); return; }
          line(user + " is not in the sudoers file. Try: hire", "t-err");
        }
      },
      rm: {
        about: "",
        hidden: true,
        run: function () { line("rm: permission denied. This portfolio has branch protection on.", "t-err"); }
      },
      coffee: {
        about: "",
        hidden: true,
        run: function () { line("Brewing... done. Best served with a green CI pipeline."); }
      },
      echo: {
        about: "",
        hidden: true,
        run: function (args) { line(args.join(" ")); }
      },
      date: {
        about: "",
        hidden: true,
        run: function () { line(new Date().toString()); }
      },
      history: {
        about: "",
        hidden: true,
        run: function () { history.forEach(function (h, i) { line("  " + (i + 1) + "  " + h); }); }
      },
      uptime: {
        about: "this site's own SLO",
        run: function () {
          if (siteSlo.text) line(siteSlo.text);
          else line(siteSlo.state === "loading" ? "Still loading the uptime data. Try again in a second." : "Uptime data is not available right now.", "t-dim");
          line("Checked every 15 minutes by a GitHub Action against a 99.9% objective.", "t-dim");
        }
      },
      clear: {
        about: "clear the screen",
        run: function () { out.textContent = ""; }
      },
      exit: {
        about: "close the terminal",
        run: function () { term.close(); }
      }
    };
    commands.about = { about: "", hidden: true, run: commands.whoami.run };
    commands.jobs = { about: "", hidden: true, run: commands.experience.run };
    commands["?"] = { about: "", hidden: true, run: commands.help.run };

    function runLine(raw) {
      var text = raw.trim();
      var echo = line("", "t-cmd");
      var b = document.createElement("b");
      b.textContent = user + "@site:~$ ";
      echo.appendChild(b);
      echo.appendChild(document.createTextNode(text));
      if (!text) return;
      history.push(text);
      hIndex = history.length;
      var parts = text.split(/\s+/);
      var name = parts[0].toLowerCase();
      var cmd = Object.prototype.hasOwnProperty.call(commands, name) ? commands[name] : null;
      if (cmd) cmd.run(parts.slice(1));
      else line("command not found: " + parts[0] + ". Type help to see what works.", "t-err");
      blank();
      out.scrollTop = out.scrollHeight;
    }

    function open(opener) {
      if (!started) {
        started = true;
        line("Welcome to " + data.shortName + "'s terminal.", "t-head");
        line("Same facts as the page, typed out. Try: help, whoami, projects, hire", "t-dim");
        blank();
      }
      openDialog(term, opener);
      input.focus();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      runLine(input.value);
      input.value = "";
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp" && history.length) {
        e.preventDefault();
        hIndex = Math.max(0, hIndex - 1);
        input.value = history[hIndex];
      } else if (e.key === "ArrowDown" && history.length) {
        e.preventDefault();
        hIndex = Math.min(history.length, hIndex + 1);
        input.value = history[hIndex] || "";
      } else if (e.key === "Tab" && input.value.trim() && input.value.indexOf(" ") < 0) {
        var start = input.value.trim().toLowerCase();
        var matches = Object.keys(commands).filter(function (n) { return !commands[n].hidden && n.indexOf(start) === 0; });
        if (matches.length === 1) { e.preventDefault(); input.value = matches[0] + " "; }
        else if (matches.length > 1) { e.preventDefault(); line(matches.join("  "), "t-dim"); out.scrollTop = out.scrollHeight; }
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        out.textContent = "";
      }
    });
    // Clicking anywhere in the terminal (but not on a link or the close button) puts the cursor back.
    out.addEventListener("click", function (e) {
      if (!e.target.closest("a") && !String(window.getSelection())) input.focus();
    });

    if (openBtn) {
      openBtn.hidden = false;
      openBtn.addEventListener("click", function () { open(openBtn); });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "`" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      open(null);
    });
  }
})();
