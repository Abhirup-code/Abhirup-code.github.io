// Builds the portfolio from content.json into _site/. No dependencies: run with `node build.mjs`.
// All text from content.json is HTML-escaped, and every link must be https, mailto, or a file in
// this repo, so a typo in content.json cannot break the page or inject markup.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STYLES = ["feature", "accent", "lime", "blue", "outline"];

export const FORM_ENDPOINT = "https://api.web3forms.com/submit";
// Browsers apply form-action to the redirect after submitting too, so the policy must also allow
// this site ('self'), or Web3Forms' redirect back to thanks.html is blocked.
const FORM_ENDPOINT_ORIGIN = "https://api.web3forms.com";
const ACCESS_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The contact form shows only once a Web3Forms access key is set in content.json. */
export function hasForm(c) {
  return ACCESS_KEY.test(c?.contactForm?.accessKey ?? "");
}

export function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A link is allowed if it is https, mailto, or a relative path to a file in this repo. */
export function safeUrl(url) {
  const value = String(url ?? "").trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return value;
  if (/^mailto:[^\s"'<>]+$/i.test(value)) return value;
  if (/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(value) && !value.includes("..")) return value;
  throw new Error(`Link not allowed: ${JSON.stringify(value)} (use https://, mailto:, or a file in this repo)`);
}

/** Checks content.json and returns a list of problems, empty when it is fine. */
export function validate(c) {
  const problems = [];
  const need = (cond, msg) => cond || problems.push(msg);
  const text = (v) => typeof v === "string" && v.trim().length > 0;
  need(text(c?.name), "name is missing");
  need(text(c?.role), "role is missing");
  need(text(c?.intro), "intro is missing");
  if (c?.pronounce != null) {
    need(text(c.pronounce.text), "pronounce.text is missing");
    need(c.pronounce.audio == null || /^assets\/[\w.-]+\.(mp3|m4a|ogg|wav)$/.test(c.pronounce.audio),
      "pronounce.audio must be a sound file in assets/ (mp3, m4a, ogg, or wav)");
  }
  need(text(c?.links?.email), "links.email is missing");
  need(Array.isArray(c?.projects) && c.projects.length > 0, "projects must be a non-empty list");
  need(Array.isArray(c?.experience) && c.experience.length > 0, "experience must be a non-empty list");
  for (const [i, p] of (c?.projects ?? []).entries()) {
    need(text(p.title) && text(p.description) && text(p.url), `projects[${i}] needs title, description, and url`);
    need(STYLES.includes(p.style), `projects[${i}].style must be one of ${STYLES.join(", ")}`);
  }
  for (const [i, p] of (c?.projects ?? []).entries()) {
    const cs = p.caseStudy;
    if (cs) {
      need(/^[a-z0-9-]+$/.test(cs.slug ?? ""), `projects[${i}].caseStudy.slug must be lowercase letters, numbers, and dashes`);
      need(text(cs.problem) && [cs.built, cs.results, cs.tech].every((l) => Array.isArray(l) && l.length && l.every(text)),
        `projects[${i}].caseStudy needs problem, built, results, and tech`);
      need(cs.stats == null || (Array.isArray(cs.stats) && cs.stats.length <= 4 && cs.stats.every((x) => text(x?.value) && text(x?.label))),
        `projects[${i}].caseStudy.stats must be up to 4 items, each with a value and a label`);
    }
  }
  need((c?.roles ?? []).every(text), "roles must be a list of text");
  for (const [i, p] of (c?.moreProjects ?? []).entries()) {
    need(text(p.title) && text(p.description) && text(p.url), `moreProjects[${i}] needs title, description, and url`);
  }
  for (const [i, r] of (c?.recommendations ?? []).entries()) {
    const ok = text(r.name) && text(r.quote) && Array.isArray(r.text) && r.text.every(text);
    need(ok, `recommendations[${i}] needs name, quote, and text (a list of paragraphs)`);
    // The pull quote must be copied word for word from the recommendation, never reworded.
    if (ok) need(r.text.some((para) => para.includes(r.quote)), `recommendations[${i}].quote is not word for word from its text`);
  }
  for (const [i, a] of (c?.awards ?? []).entries()) {
    need(text(a.title) && text(a.org), `awards[${i}] needs title and org`);
  }
  for (const [i, e] of (c?.experience ?? []).entries()) {
    need(text(e.dates) && text(e.title) && text(e.org), `experience[${i}] needs dates, title, and org`);
    need(Array.isArray(e.points), `experience[${i}].points must be a list`);
  }
  for (const [i, s] of (c?.skills ?? []).entries()) {
    need(STYLES.includes(s.style) && s.style !== "feature", `skills[${i}].style must be accent, lime, blue, or outline`);
  }
  for (const [i, q] of (c?.quickView?.items ?? []).entries()) {
    need(text(q.label) && text(q.value), `quickView.items[${i}] needs label and value`);
  }
  for (const [i, l] of (c?.leadership ?? []).entries()) {
    need(text(l.title) && text(l.org) && text(l.text), `leadership[${i}] needs title, org, and text`);
  }
  for (const [skill, terms] of Object.entries(c?.skillMatch ?? {})) {
    need(Array.isArray(terms) && terms.length > 0 && terms.every(text), `skillMatch["${skill}"] must be a list of words to look for`);
  }
  if (c?.siteSlo) {
    need(/^https:\/\/raw\.githubusercontent\.com\/[\w./-]+\.json$/.test(c.siteSlo.statusUrl ?? ""), "siteSlo.statusUrl must be a raw.githubusercontent.com JSON file");
    if (c.siteSlo.about) safeUrl(c.siteSlo.about);
  }
  const seen = new Set();
  for (const [i, pm] of (c?.postmortems ?? []).entries()) {
    const at = `postmortems[${i}]`;
    need(/^[a-z0-9-]+$/.test(pm.slug ?? "") && !seen.has(pm.slug), `${at}.slug must be unique lowercase letters, numbers, and dashes`);
    seen.add(pm.slug);
    need(/^\d{4}-\d{2}-\d{2}$/.test(pm.date ?? ""), `${at}.date must be YYYY-MM-DD`);
    need(["title", "system", "severity", "summary", "rootCause", "detection"].every((k) => text(pm[k])), `${at} needs title, system, severity, summary, rootCause, and detection`);
    need(["impact", "timeline", "wentWell", "wentBadly", "actions"].every((k) => Array.isArray(pm[k]) && pm[k].length), `${at} needs impact, timeline, wentWell, wentBadly, and actions`);
    for (const a of pm.actions ?? []) need(ACTION_TYPES.includes(a.type), `${at}.actions type must be one of ${ACTION_TYPES.join(", ")}`);
    if (pm.link) safeUrl(pm.link);
  }
  const key = c?.contactForm?.accessKey ?? "";
  need(key === "" || ACCESS_KEY.test(key), "contactForm.accessKey must be the key Web3Forms emailed you (it looks like 8-4-4-4-12 letters and numbers)");
  // House style: no em dashes anywhere in the content.
  const all = JSON.stringify(c ?? {});
  need(!all.includes("\u2014"), "content uses an em dash; use a comma, colon, or 'to' instead");
  const links = [c?.links?.linkedin, c?.links?.github, c?.links?.resume, c?.photo, c?.url,
    ...(c?.projects ?? []).flatMap((p) => [p.url, p.code]), ...(c?.moreProjects ?? []).map((p) => p.url)].filter(Boolean);
  for (const link of links) {
    try {
      safeUrl(link);
    } catch (err) {
      problems.push(err.message);
    }
  }
  return problems;
}

const ACTION_TYPES = ["Prevent", "Detect", "Mitigate", "Document"];
const isExternal = (url) => url.startsWith("https://");
const linkAttrs = (url) => (isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "");

const casePath = (p) => `work/${p.caseStudy.slug}.html`;

/** Words to look for when finding where a skill was used: skillMatch in content.json, or the skill's own name. */
function skillTerms(c, item) {
  if (c.skillMatch?.[item]) return c.skillMatch[item];
  return item.replace(/\(.*?\)/g, "").split(/\s+and\s+/).map((t) => t.trim()).filter((t) => t.length > 1);
}

/** Every job and project on the page, with its text, for finding where a skill was used. */
function proofSources(c) {
  const jobs = c.experience.map((e, i) => ({
    kind: "Job",
    label: `${e.title}, ${e.org.split(" · ")[0]}`,
    href: `#job-${i}`,
    text: [e.title, e.org, ...e.points].join(" "),
  }));
  const projects = c.projects.map((p) => ({
    kind: "Project",
    label: p.title,
    href: p.caseStudy ? casePath(p) : safeUrl(p.url),
    dialog: p.caseStudy ? `dlg-${p.caseStudy.slug}` : null,
    text: [p.title, p.description, p.kicker ?? "", ...(p.caseStudy ? [p.caseStudy.problem, ...p.caseStudy.built, ...p.caseStudy.results, ...p.caseStudy.tech] : [])].join(" "),
  }));
  const more = (c.moreProjects ?? []).map((p) => ({
    kind: "Project",
    label: p.title,
    href: safeUrl(p.url),
    text: [p.title, p.description, p.tech ?? ""].join(" "),
  }));
  return [...jobs, ...projects, ...more];
}

/** The jobs and projects whose own text names the skill, so every link is backed by what the page says.
 * A dash counts as part of a word, so "pytest" does not match "pytest-bdd" and "aws" does not match "aws-healthcheck-iac". */
export function skillProof(c, item) {
  const terms = skillTerms(c, item).map((t) => new RegExp(`(?<![A-Za-z0-9-])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9-])`, "i"));
  return proofSources(c).filter((src) => terms.some((re) => re.test(src.text)));
}

function skillChip(c, item, style) {
  const proof = skillProof(c, item);
  if (!proof.length) return `<li class="chip chip-${esc(style)}">${esc(item)}</li>`;
  const links = proof.map((src) => {
    const attrs = src.dialog ? ` data-dialog="${esc(src.dialog)}"` : linkAttrs(src.href);
    return `<li><a href="${esc(src.href)}"${attrs}><span class="proof-kind">${src.kind}</span>${esc(src.label)}</a></li>`;
  }).join("");
  return `<li class="chip-item"><details class="proof"><summary class="chip chip-${esc(style)}">${esc(item)}<span class="proof-count" aria-hidden="true">${proof.length}</span><span class="sr-only">, used in ${proof.length} ${proof.length === 1 ? "place" : "places"}</span></summary><div class="proof-pop"><p>Where I used ${esc(item)}</p><ul>${links}</ul></div></details></li>`;
}

function projectTile(p) {
  const code = p.code
    ? `<a class="tile-code" href="${esc(safeUrl(p.code))}"${linkAttrs(p.code)}>Code</a>`
    : "";
  const target = p.caseStudy
    ? `href="${casePath(p)}" data-dialog="dlg-${esc(p.caseStudy.slug)}"`
    : `href="${esc(safeUrl(p.url))}"${linkAttrs(p.url)}`;
  return `
      <article class="tile tile-${esc(p.style)}">
        <a class="tile-link" ${target}>
          <span class="tile-top"><span class="kicker">${esc(p.kicker ?? "")}</span></span>
          <span class="tile-body"><strong class="tile-title">${esc(p.title)}</strong><span class="tile-desc">${esc(p.description)}</span></span>
        </a>${code}
      </article>`;
}

const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const chips = (items) => `<ul class="chips">${items.map((x) => `<li class="chip chip-outline">${esc(x)}</li>`).join("")}</ul>`;

/** Links for a project: the live demo when there is one, and the code. */
function projectLinks(p) {
  const out = [];
  if (p.code) out.push(`<a class="btn btn-solid magnetic" href="${esc(safeUrl(p.url))}"${linkAttrs(p.url)}>Live demo ↗</a>`);
  const code = p.code ?? p.url;
  out.push(`<a class="btn magnetic" href="${esc(safeUrl(code))}"${linkAttrs(code)}>Code on GitHub ↗</a>`);
  return out.join("\n          ");
}

/**
 * A pop-up with the short version of a case study: big numbers first, then tabs for the problem, what I
 * built, the results, and the tech. JavaScript opens it and switches the tabs; without it the tile links
 * to the full page.
 */
function projectDialog(p) {
  const cs = p.caseStudy;
  const id = `dlg-${esc(cs.slug)}`;
  const stats = (cs.stats ?? []).length
    ? `<ul class="dialog-stats">${cs.stats.map((x) => `<li><strong>${esc(x.value)}</strong><span>${esc(x.label)}</span></li>`).join("")}</ul>`
    : "";
  const panes = [
    ["problem", "Problem", `<p class="dialog-problem">${esc(cs.problem)}</p>`],
    ["built", "What I built", list(cs.built)],
    ["results", "Results", list(cs.results)],
    ["tech", "Tech", chips(cs.tech)],
  ];
  const tabs = panes.map(([key, label], n) =>
    `<button class="dialog-tab" type="button" role="tab" id="${id}-tab-${key}" aria-controls="${id}-${key}" aria-selected="${n === 0}" tabindex="${n === 0 ? 0 : -1}">${label}</button>`).join("");
  const panels = panes.map(([key, , body], n) =>
    `<div class="dialog-pane" role="tabpanel" id="${id}-${key}" aria-labelledby="${id}-tab-${key}"${n === 0 ? "" : " hidden"}>${body}</div>`).join("");
  return `
  <dialog class="project-dialog" id="${id}" aria-labelledby="${id}-title">
    <form method="dialog" class="dialog-close-form"><button class="dialog-close" aria-label="Close">×</button></form>
    <p class="eyebrow">${esc(p.kicker ?? "Project")}</p>
    <h2 id="${id}-title">${esc(p.title)}</h2>
    ${stats}
    <div class="dialog-tabs" role="tablist" aria-label="${esc(p.title)}">${tabs}</div>
    ${panels}
    <div class="dialog-actions">
      ${projectLinks(p)}
      <a class="btn magnetic" href="${casePath(p)}">Full case study →</a>
    </div>
  </dialog>`;
}

/**
 * The shell shared by pages one folder down (work/, postmortems/, lab/): head, menu bar, main.
 * `path` is the page's address under the site root, used for the canonical link.
 */
function subpage(c, { title, description, path, body, back = "../#work", backLabel = "All work", scripts = [] }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(c.name)}</title>
<meta name="description" content="${esc(description)}">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'">
${c.url ? `<link rel="canonical" href="${esc(safeUrl(c.url).replace(/\/?$/, "/"))}${esc(path)}">` : ""}
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<script src="../assets/theme.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&amp;family=Inter:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="../assets/styles.css">
<script src="../assets/app.js" defer></script>
<script src="../assets/stars.js" defer></script>
${scripts.map((src) => `<script src="../assets/${src}" defer></script>`).join("\n")}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav wrap">
  <a class="brand" href="../">${esc(c.shortName ?? c.name)}</a>
  <nav aria-label="Site">
    <a href="${back}">${esc(backLabel)}</a>
    ${themeToggle}
    <a class="pill magnetic" href="../${esc(safeUrl(c.links.resume))}">Resume ↗</a>
  </nav>
</header>
${body}
</body>
</html>
`;
}

/** A full case study page for one project, at work/<slug>.html. */
export function renderCase(c, p) {
  const cs = p.caseStudy;
  return subpage(c, {
    title: `${p.title} · Case study`,
    description: cs.problem,
    path: casePath(p),
    body: `<main id="main" class="case wrap">
  <p class="eyebrow">Case study · ${esc(p.kicker ?? "")}</p>
  <h1>${esc(p.title)}</h1>
  <p class="case-lede">${esc(p.description)}</p>
  <div class="case-actions">${projectLinks(p)}</div>
  <section class="case-section reveal"><h2>The problem</h2><p>${esc(cs.problem)}</p></section>
  <section class="case-section reveal"><h2>What I built</h2>${list(cs.built)}</section>
  <section class="case-section reveal"><h2>Results and quality</h2>${list(cs.results)}</section>
  <section class="case-section reveal"><h2>Tech</h2>${chips(cs.tech)}</section>
  <p class="case-back"><a class="btn btn-solid magnetic" href="../#work">← Back to all work</a></p>
</main>`,
  });
}

const pmPath = (pm) => `postmortems/${pm.slug}.html`;
const formatDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** One blameless postmortem, at postmortems/<slug>.html. */
export function renderPostmortem(c, pm) {
  return subpage(c, {
    title: `Postmortem: ${pm.title}`,
    description: pm.summary,
    path: pmPath(pm),
    back: "./",
    backLabel: "All postmortems",
    body: `<main id="main" class="case postmortem wrap">
  <p class="eyebrow">Postmortem · ${esc(pm.system)}</p>
  <h1>${esc(pm.title)}</h1>
  <p class="pm-meta"><time datetime="${esc(pm.date)}">${esc(formatDate(pm.date))}</time><span class="pm-sev">${esc(pm.severity)}</span><span>Blameless</span></p>
  <p class="case-lede">${esc(pm.summary)}</p>
  <section class="case-section"><h2>Impact</h2>
    <dl class="pm-impact">${pm.impact.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join("")}</dl>
  </section>
  <section class="case-section"><h2>Timeline</h2>
    <ol class="pm-timeline">${pm.timeline.map((t) => `<li>${t.time ? `<span class="pm-time">${esc(t.time)}</span>` : ""}<span>${esc(t.event)}</span></li>`).join("")}</ol>
  </section>
  <section class="case-section"><h2>Root cause</h2><p>${esc(pm.rootCause)}</p></section>
  <section class="case-section"><h2>Detection</h2><p>${esc(pm.detection)}</p></section>
  <section class="case-section pm-two"><div><h2>What went well</h2>${list(pm.wentWell)}</div><div><h2>What went badly</h2>${list(pm.wentBadly)}</div></section>
  <section class="case-section"><h2>Action items</h2>
    <ul class="pm-actions">${pm.actions.map((a) => `<li><span class="pm-type pm-type-${esc(a.type.toLowerCase())}">${esc(a.type)}</span>${esc(a.action)}</li>`).join("")}</ul>
  </section>
  <p class="case-back"><a class="btn btn-solid magnetic" href="./">← All postmortems</a>${pm.link ? ` <a class="btn magnetic" href="${esc(safeUrl(pm.link))}"${linkAttrs(pm.link)}>The project on GitHub ↗</a>` : ""}</p>
</main>`,
  });
}

const sortedPostmortems = (c) => [...(c.postmortems ?? [])].sort((a, b) => b.date.localeCompare(a.date));

function pmCard(pm, prefix) {
  return `
      <li class="pm-card"><a href="${prefix}${esc(pm.slug)}.html">
        <span class="pm-card-meta"><time datetime="${esc(pm.date)}">${esc(formatDate(pm.date))}</time> · ${esc(pm.system)} · ${esc(pm.severity)}</span>
        <strong>${esc(pm.title)}</strong>
        <span>${esc(pm.summary)}</span>
      </a></li>`;
}

/** The list of postmortems, at postmortems/index.html. */
export function renderPostmortemIndex(c) {
  return subpage(c, {
    title: "Postmortems",
    description: "Blameless write-ups of what broke in my projects, how it was caught, and what changed after.",
    path: "postmortems/",
    back: "../",
    backLabel: "Home",
    body: `<main id="main" class="case wrap">
  <p class="eyebrow">Postmortems</p>
  <h1>When things <em class="accent">broke.</em></h1>
  <p class="case-lede">Blameless write-ups of real failures and drills in my projects: what happened, how it was caught, the root cause, and what changed after. Newest first.</p>
  <ul class="pm-list">${sortedPostmortems(c).map((pm) => pmCard(pm, "")).join("")}
  </ul>
</main>`,
  });
}

/** The "Break my service" lab, at lab/index.html. Runs entirely in the browser. */
export function renderLab(c) {
  return subpage(c, {
    title: "Lab: break my service",
    description: "A simulated checkout service with real SLOs, burn-rate alerts, and an error budget deploy gate. Turn up the errors and watch what happens.",
    path: "lab/",
    back: "../#lab",
    backLabel: "Home",
    scripts: ["slo-sim.js", "lab.js"],
    body: `<main id="main" class="lab wrap">
  <p class="eyebrow">Lab</p>
  <h1>Break my <em class="accent">service.</em></h1>
  <p class="case-lede">A simulated checkout service with the same 99.5% SLO, burn-rate alerts, and deploy gate as my
  <a href="https://github.com/Abhirup-code/Burn_Rate" target="_blank" rel="noopener noreferrer">Burn_Rate</a> project. Turn up the errors and watch the
  error budget burn, the alerts fire, and the deploy gate decide. It starts with 3 healthy days of history.</p>
  <noscript><p class="lab-noscript">The lab runs in your browser and needs JavaScript.</p></noscript>

  <div class="lab-grid" hidden>
    <section class="lab-card lab-controls" aria-labelledby="lab-controls-h">
      <h2 id="lab-controls-h">Controls</h2>
      <label class="lab-label" for="lab-errors">Failing checkouts: <output id="lab-errors-out" for="lab-errors">0%</output></label>
      <input id="lab-errors" type="range" min="0" max="100" step="0.5" value="0">
      <div class="lab-presets" role="group" aria-label="Scenarios">
        <button type="button" class="btn" data-rate="0">Healthy</button>
        <button type="button" class="btn" data-rate="2">Slow leak (2%)</button>
        <button type="button" class="btn" data-rate="20">Bad deploy (20%)</button>
        <button type="button" class="btn" data-rate="100">Full outage</button>
      </div>
      <fieldset class="lab-speed">
        <legend>Speed (simulated time per real second)</legend>
        <label><input type="radio" name="lab-speed" value="1" checked> 1 minute</label>
        <label><input type="radio" name="lab-speed" value="10"> 10 minutes</label>
        <label><input type="radio" name="lab-speed" value="60"> 1 hour</label>
      </fieldset>
      <div class="lab-run">
        <button type="button" class="btn btn-solid" id="lab-pause">Pause</button>
        <button type="button" class="btn" id="lab-reset">Reset</button>
      </div>
    </section>

    <section class="lab-card lab-status" aria-labelledby="lab-status-h">
      <h2 id="lab-status-h">Service status <span class="lab-clock" id="lab-clock"></span></h2>
      <dl class="lab-numbers">
        <div><dt>Error budget left (30 days)</dt><dd id="lab-budget">100%</dd></div>
        <div><dt>Burn rate (5 minutes)</dt><dd id="lab-burn">0</dd></div>
        <div><dt>Failing right now</dt><dd id="lab-ratio">0%</dd></div>
      </dl>
      <div class="lab-meter" aria-hidden="true"><span id="lab-meter-fill"></span></div>
      <div class="lab-alerts">
        <span class="lab-alert" id="lab-page"><b>Page</b> <span>quiet</span></span>
        <span class="lab-alert" id="lab-ticket"><b>Ticket</b> <span>quiet</span></span>
      </div>
      <figure class="lab-chart">
        <svg viewBox="0 0 600 200" role="img" aria-labelledby="lab-chart-cap" preserveAspectRatio="none">
          <line class="lab-th lab-th-1" x1="0" x2="600" y1="0" y2="0"></line>
          <line class="lab-th lab-th-6" x1="0" x2="600" y1="0" y2="0"></line>
          <line class="lab-th lab-th-14" x1="0" x2="600" y1="0" y2="0"></line>
          <polyline id="lab-line" points=""></polyline>
        </svg>
        <figcaption id="lab-chart-cap">Burn rate over the last 3 simulated hours. Dashed lines: 1 (ticket over days), 6 and 14.4 (page).</figcaption>
      </figure>
    </section>

    <section class="lab-card lab-gate" aria-labelledby="lab-gate-h">
      <h2 id="lab-gate-h">Deploy gate</h2>
      <p>Features ship only while there is error budget left. A fix can always ship, with a reason on record.</p>
      <button type="button" class="btn btn-solid" id="lab-ship">Ship a feature</button>
      <form class="lab-hotfix" id="lab-hotfix">
        <label class="lab-label" for="lab-reason">Hotfix reason</label>
        <input id="lab-reason" type="text" maxlength="120" placeholder="Roll back the bad config" autocomplete="off">
        <button type="submit" class="btn">Ship a hotfix</button>
      </form>
      <p class="lab-verdict" id="lab-verdict" role="status"></p>
    </section>

    <section class="lab-card lab-log" aria-labelledby="lab-log-h">
      <h2 id="lab-log-h">What happened</h2>
      <ol id="lab-events" aria-live="polite"></ol>
    </section>
  </div>

  <section class="case-section"><h2>How the alerts decide</h2>
    <p>Each alert checks a long window to prove the problem is real and a short one to prove it is still happening.</p>
    <table class="lab-table">
      <thead><tr><th scope="col">Severity</th><th scope="col">Burn rate</th><th scope="col">Long window</th><th scope="col">Short window</th></tr></thead>
      <tbody>
        <tr><td>Page</td><td>14.4x</td><td>1 hour</td><td>5 minutes</td></tr>
        <tr><td>Page</td><td>6x</td><td>6 hours</td><td>30 minutes</td></tr>
        <tr><td>Ticket</td><td>3x</td><td>1 day</td><td>2 hours</td></tr>
        <tr><td>Ticket</td><td>1x</td><td>3 days</td><td>6 hours</td></tr>
      </tbody>
    </table>
    <p>Try a full outage: it pages after about 4.5 minutes and spends the month's budget in about 22. Then try a 2% leak at
    1 hour per second: no page, ever, but a ticket after about 18 hours.</p>
  </section>
</main>`,
  });
}

function labSection() {
  return `
  <section class="lab-teaser wrap" id="lab" aria-labelledby="lab-heading">
    <div>
      <span class="eyebrow">Lab</span>
      <h2 id="lab-heading">Break my <em>service.</em></h2>
      <p>A live simulation of a checkout service with real SLOs. Turn up the errors, watch the error budget burn and the alerts fire, then try to ship a feature past the deploy gate.</p>
    </div>
    <a class="btn btn-solid magnetic" href="lab/">Open the lab →</a>
  </section>
`;
}

const themeToggle = `<button class="theme-toggle magnetic" type="button" aria-label="Switch to dark mode" hidden>
      <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg>
      <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
    </button>`;

function moreCard(p) {
  return `
      <li class="more-card reveal">
        <a href="${esc(safeUrl(p.url))}"${linkAttrs(p.url)}>
          <strong>${esc(p.title)} <span aria-hidden="true">↗</span></strong>
          <span class="more-desc">${esc(p.description)}</span>
          ${p.tech ? `<span class="more-tech">${esc(p.tech)}</span>` : ""}
        </a>
      </li>`;
}

function initials(name) {
  return name.split(",")[0].trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function recommendation(r) {
  return `
      <figure class="rec reveal">
        <span class="rec-mark" aria-hidden="true">“</span>
        <blockquote><p>${esc(r.quote)}</p></blockquote>
        <figcaption>
          <span class="rec-avatar" aria-hidden="true">${esc(initials(r.name))}</span>
          <span><strong>${esc(r.name)}</strong><span>${esc(r.role ?? "")}</span><span class="rec-meta">${esc([r.relation, r.date].filter(Boolean).join(" · "))}</span></span>
        </figcaption>
        <details>
          <summary>Read the full recommendation</summary>
          ${r.text.map((para) => `<p>${esc(para)}</p>`).join("\n          ")}
        </details>
      </figure>`;
}

function contactForm(c) {
  const base = c.url ? safeUrl(c.url).replace(/\/?$/, "/") : "";
  return `<form class="contact-form" action="${FORM_ENDPOINT}" method="POST" aria-labelledby="form-heading">
      <h3 id="form-heading">Send me a message</h3>
      <input type="hidden" name="access_key" value="${esc(c.contactForm.accessKey)}">
      <input type="hidden" name="subject" value="${esc(c.contactForm.subject ?? `New message from ${c.name}'s site`)}">
      <input type="hidden" name="from_name" value="${esc(c.name)} portfolio">
      ${base ? `<input type="hidden" name="redirect" value="${esc(base)}thanks.html">` : ""}
      <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="field"><label for="f-name">Your name</label><input id="f-name" name="name" type="text" required maxlength="100" autocomplete="name"></div>
      <div class="field"><label for="f-email">Your email</label><input id="f-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
      <div class="field"><label for="f-message">Message</label><textarea id="f-message" name="message" required minlength="10" maxlength="5000" rows="5"></textarea></div>
      <button type="submit" class="magnetic">Send message ↗</button>
      <p class="form-note">Messages go straight to my inbox through Web3Forms. Nothing is stored on this site.</p>
    </form>`;
}

function job(e, i) {
  return `
      <li class="job reveal${i === 0 ? " job-current" : ""}" id="job-${i}">
        <span class="job-dot" aria-hidden="true"></span>
        <span class="job-dates">${esc(e.dates)}</span>
        <h3>${esc(e.title)}</h3>
        <p class="job-org">${esc(e.org)}${e.place ? ` · ${esc(e.place)}` : ""}</p>
        <ul>${e.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>
      </li>`;
}

/** Quick facts: the key details in one pop-up. */
function quickDialog(c) {
  const L = c.links;
  return `
  <dialog class="project-dialog quick-dialog" id="dlg-quick" aria-labelledby="dlg-quick-title">
    <form method="dialog" class="dialog-close-form"><button class="dialog-close" aria-label="Close">×</button></form>
    <p class="eyebrow">Quick facts</p>
    <h2 id="dlg-quick-title">${esc(c.quickView.title ?? c.name)}</h2>
    <dl class="quick-facts">${c.quickView.items.map((q) => `
      <div><dt>${esc(q.label)}</dt><dd>${esc(q.value)}</dd></div>`).join("")}
    </dl>
    <div class="dialog-actions">
      <a class="btn btn-solid magnetic" href="${esc(safeUrl(`mailto:${L.email}`))}">Email me</a>
      <button class="btn magnetic copy-email" type="button" data-email="${esc(L.email)}" hidden>Copy email</button>
      ${L.resume ? `<a class="btn magnetic" href="${esc(safeUrl(L.resume))}">Resume (PDF)</a>` : ""}
      ${L.linkedin ? `<a class="btn magnetic" href="${esc(safeUrl(L.linkedin))}"${linkAttrs(L.linkedin)}>LinkedIn ↗</a>` : ""}
    </div>
    <p class="copy-status" role="status"></p>
  </dialog>`;
}

function leadershipSection(c) {
  return `
  <section class="leadership wrap" id="leadership" aria-labelledby="lead-heading">
    <div class="section-head">
      <span class="eyebrow">Leadership</span>
      <h2 id="lead-heading">Leading &amp; <em>giving back.</em></h2>
    </div>
    <ul class="lead-list">${c.leadership.map((l) => `
      <li class="lead reveal">
        ${l.dates ? `<span class="lead-dates">${esc(l.dates)}</span>` : ""}
        <h3>${esc(l.title)}</h3>
        <p class="lead-org">${esc(l.org)}</p>
        <p>${esc(l.text)}</p>
      </li>`).join("")}
    </ul>
  </section>
`;
}

/** What the hidden terminal can print. Only public facts that are already on the page. */
export function terminalData(c) {
  const L = c.links;
  return {
    name: c.name,
    shortName: c.shortName ?? c.name,
    role: c.role,
    roles: c.roles ?? [],
    intro: c.intro,
    location: c.location ?? "",
    links: { email: L.email, linkedin: L.linkedin ?? "", github: L.github ?? "", resume: L.resume ?? "" },
    skills: (c.skills ?? []).map((s) => ({ group: s.group, items: s.items })),
    projects: [
      ...c.projects.map((p) => ({ title: p.title, description: p.description, href: p.caseStudy ? casePath(p) : p.url })),
      ...(c.moreProjects ?? []).map((p) => ({ title: p.title, description: p.description, href: p.url })),
    ],
    experience: c.experience.map((e) => ({ title: e.title, org: e.org, dates: e.dates })),
    awards: (c.awards ?? []).map((a) => ({ title: a.title, org: a.org })),
    leadership: (c.leadership ?? []).map((l) => ({ title: l.title, org: l.org, dates: l.dates ?? "" })),
    quick: (c.quickView?.items ?? []).map((q) => ({ label: q.label, value: q.value })),
  };
}

function terminal(c) {
  // type="application/json" is data, never run, so the Content-Security-Policy still allows no inline scripts.
  const data = JSON.stringify(terminalData(c)).replaceAll("<", "\\u003c");
  return `
<dialog class="terminal" id="terminal" aria-labelledby="term-title">
  <div class="term-bar">
    <span class="term-dots" aria-hidden="true"><span></span><span></span><span></span></span>
    <h2 id="term-title">${esc((c.shortName ?? "guest").toLowerCase())}@${esc(c.url ? new URL(c.url).host : "portfolio")}: ~</h2>
    <form method="dialog"><button class="term-close" aria-label="Close terminal">×</button></form>
  </div>
  <div class="term-out" role="log" aria-live="polite" aria-label="Terminal output" tabindex="0"></div>
  <form class="term-form" autocomplete="off">
    <label class="term-prompt" for="term-in">$</label>
    <input id="term-in" type="text" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-describedby="term-help">
  </form>
  <p class="sr-only" id="term-help">Type help and press Enter to see commands.</p>
</dialog>
<script type="application/json" id="site-data">${data}</script>`;
}

function roleLine(c) {
  const roles = c.roles ?? [];
  if (roles.length < 2 || roles.length > 5) return `<p class="role">${esc(c.role)}</p>`;
  // Screen readers get one plain sentence; the moving words are hidden from them.
  return `<p class="role"><span class="sr-only">Open to roles in ${esc(roles.join(", "))}</span><span class="role-static" aria-hidden="true">${esc(c.role)}</span><span class="role-anim" aria-hidden="true">Open to roles in <span class="rotator rotator-${Math.min(roles.length, 5)}"><span class="rotator-track">${[...roles, roles[0]].map((r) => `<span>${esc(r)}</span>`).join("")}</span></span></span></p>`;
}

// How to say my name: the spelling always shows; app.js reveals the play button when it can speak
// (a recording if pronounce.audio is set, otherwise the browser's own voice).
function sayName(c) {
  const p = c.pronounce;
  if (!p) return "";
  const audio = p.audio ? ` data-audio="${esc(safeUrl(p.audio))}"` : "";
  return `<p class="say-name">Say it: <strong>${esc(p.text)}</strong> <button class="say-btn" type="button" data-say="${esc(p.speak ?? p.text)}"${audio} aria-label="Play how to say my name" hidden><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"></path><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg></button></p>`;
}

export function render(c) {
  const problems = validate(c);
  if (problems.length) throw new Error(`content.json has problems:\n- ${problems.join("\n- ")}`);
  const L = c.links;
  const ticker = (c.ticker ?? []).map(esc).join("  /  ") + "  /  ";
  const photo = c.photo
    ? `<div class="photo-stage"><figure class="photo-wrap"><img class="photo" src="${esc(safeUrl(c.photo))}" alt="${esc(c.name)}" width="640" height="695"><span class="photo-light" aria-hidden="true"></span></figure></div>`
    : "";
  const stat = c.stat
    ? `<div class="tile tile-stat"><strong>${esc(c.stat.value)}</strong><span>${esc(c.stat.label)}</span></div>`
    : "";
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: c.name,
    jobTitle: c.role,
    url: c.url,
    sameAs: [L.linkedin, L.github].filter(Boolean),
  };
  const [first, ...rest] = c.name.split(" ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.name)} · ${esc(c.role)}</title>
<meta name="description" content="${esc(c.description ?? c.intro)}">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'self';${c.siteSlo ? " connect-src 'self' https://raw.githubusercontent.com;" : ""} base-uri 'none'; form-action ${hasForm(c) ? `'self' ${FORM_ENDPOINT_ORIGIN}` : "'none'"}">
<meta name="referrer" content="strict-origin-when-cross-origin">
${c.url ? `<link rel="canonical" href="${esc(safeUrl(c.url))}">` : ""}
<meta property="og:title" content="${esc(c.name)} · ${esc(c.role)}">
<meta property="og:description" content="${esc(c.description ?? c.intro)}">
<meta property="og:type" content="profile">
${c.url ? `<meta property="og:url" content="${esc(safeUrl(c.url))}">` : ""}
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<script src="assets/theme.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&amp;family=Inter:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="assets/styles.css">
<script src="assets/app.js" defer></script>
<script src="assets/stars.js" defer></script>
<script type="application/ld+json">${JSON.stringify(person).replaceAll("<", "\\u003c")}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav wrap">
  <a class="brand" href="#top">${esc(c.shortName ?? c.name)}</a>
  <nav aria-label="Sections">
    <a href="#work">Work</a>
    <a href="#experience">Experience</a>
    <a class="nav-contact" href="#contact">Contact</a>
    ${themeToggle}
    <a class="pill magnetic" href="${esc(safeUrl(L.resume))}">Resume ↗</a>
  </nav>
</header>
<div class="ticker" aria-hidden="true"><div class="ticker-track"><span>${ticker}</span><span>${ticker}</span></div></div>
<main id="main">
  <section class="hero wrap" id="top"${c.siteSlo ? ` data-slo-url="${esc(c.siteSlo.statusUrl)}"` : ""}>
    <h1><span class="name-first">${esc(first)}</span> <span class="name-last">${esc(rest.join(" "))}.</span></h1>
    ${sayName(c)}
    <p class="intro">${esc(c.intro)}</p>
    ${roleLine(c)}
    ${c.quickView ? `<p class="hero-cta"><a class="btn btn-solid magnetic" href="#contact" data-dialog="dlg-quick">Quick facts</a></p>` : ""}
    <div class="skyline" aria-hidden="true"><span class="skyline-lights"></span></div>
    <div class="hero-art${photo ? " has-photo" : ""}">${photo}
      <svg class="badge" viewBox="0 0 168 168" role="img" aria-label="${esc(c.badge.replaceAll("·", ",").replace(/[,\s]+$/, ""))}">
        <defs><path id="badge-circle" d="M84,84 m-60,0 a60,60 0 1,1 120,0 a60,60 0 1,1 -120,0"></path></defs>
        <circle cx="84" cy="84" r="84" class="badge-bg"></circle>
        <text><textPath href="#badge-circle" textLength="370" lengthAdjust="spacing">${esc(c.badge)}</textPath></text>
        <path d="M70 98 L98 70 M78 70 H98 V90" class="badge-arrow"></path>
      </svg>
    </div>
  </section>

  <section class="work wrap" id="work" aria-labelledby="work-heading">
    <h2 id="work-heading" class="sr-only">Projects</h2>
    <div class="tiles">${c.projects.map(projectTile).join("")}
      ${stat}
    </div>
  </section>
${c.projects.filter((p) => p.caseStudy).map(projectDialog).join("")}${c.quickView ? quickDialog(c) : ""}

${(c.moreProjects ?? []).length ? `  <section class="more wrap" aria-labelledby="more-heading">
    <h2 id="more-heading" class="eyebrow">More projects</h2>
    <ul class="more-grid">${c.moreProjects.map(moreCard).join("")}
    </ul>
  </section>

` : ""}  <section class="experience wrap" id="experience" aria-labelledby="exp-heading">
    <div class="section-head">
      <span class="eyebrow">Experience</span>
      <h2 id="exp-heading">Where I've <em>worked.</em></h2>
      <p>Newest first.</p>
    </div>
    <ol class="timeline">${c.experience.map(job).join("")}
    </ol>
  </section>
${c.lab ? labSection() : ""}
${(c.recommendations ?? []).length ? `  <section class="recs wrap" id="recommendations" aria-labelledby="recs-heading">
    <div class="section-head">
      <span class="eyebrow">Recommendations</span>
      <h2 id="recs-heading">What people <em>say.</em></h2>
      ${L.linkedin ? `<p><a href="${esc(safeUrl(L.linkedin))}"${linkAttrs(L.linkedin)}>See them on LinkedIn ↗</a></p>` : ""}
    </div>
    <div class="rec-carousel" data-carousel>
      <div class="rec-list">${c.recommendations.map(recommendation).join("")}
      </div>
      <div class="carousel-controls" hidden>
        <button type="button" class="carousel-prev magnetic" aria-label="Previous recommendation">←</button>
        <p class="carousel-status" aria-live="polite"></p>
        <button type="button" class="carousel-pause magnetic" aria-label="Pause automatic slides">Pause</button>
        <button type="button" class="carousel-next magnetic" aria-label="Next recommendation">→</button>
      </div>
    </div>
  </section>

` : ""}  <section class="about wrap" id="about" aria-label="Education and skills">
    <div class="card card-dark reveal">
      <h2 class="eyebrow">Education</h2>
      ${(c.education ?? []).map((e) => `<div class="school"><strong>${esc(e.school)}</strong>${e.place ? `<span class="school-place">${esc(e.place)}</span>` : ""}<span>${esc(e.degree)}</span>${e.details ? `<span>${esc(e.details)}</span>` : ""}</div>`).join("\n      ")}
    </div>
    <div class="card card-outline reveal">
      <h2 class="eyebrow">Skills</h2>
      <p class="skills-hint">Tap a skill with a number to see the jobs and projects where I used it.</p>
      ${(c.skills ?? []).map((s) => `<div class="skill-group"><h3>${esc(s.group)}</h3><ul class="chips">${s.items.map((it) => skillChip(c, it, s.style)).join("")}</ul></div>`).join("\n      ")}
    </div>
  </section>
${(c.awards ?? []).length ? `
  <section class="awards wrap" id="awards" aria-labelledby="awards-heading">
    <div class="section-head">
      <span class="eyebrow">Recognition</span>
      <h2 id="awards-heading">Honors &amp; <em>awards.</em></h2>
    </div>
    <ul class="award-list">${c.awards.map((a, i) => `
      <li class="award reveal">
        <span class="award-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
        <div><strong>${esc(a.title)}</strong><span>${esc(a.org)}${a.year ? ` · ${esc(a.year)}` : ""}</span></div>
        <svg class="award-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6-4.9-4.6 6.6-.8z"></path></svg>
      </li>`).join("")}
    </ul>
  </section>
` : ""}${(c.leadership ?? []).length ? leadershipSection(c) : ""}</main>
<footer class="contact" id="contact">
  <div class="wrap">
    <h2>${esc(c.contact?.heading ?? "Let's talk.")}</h2>
    <p>${esc(c.contact?.text ?? c.location ?? "")}</p>
    <ul class="contact-links">
      <li><a class="solid magnetic" href="${esc(safeUrl(`mailto:${L.email}`))}">${esc(L.email)}</a></li>
      ${L.linkedin ? `<li><a class="magnetic" href="${esc(safeUrl(L.linkedin))}"${linkAttrs(L.linkedin)}>LinkedIn ↗</a></li>` : ""}
      ${L.github ? `<li><a class="magnetic" href="${esc(safeUrl(L.github))}"${linkAttrs(L.github)}>GitHub ↗</a></li>` : ""}
      ${L.resume ? `<li><a class="magnetic" href="${esc(safeUrl(L.resume))}">Resume ↗</a></li>` : ""}
    </ul>
    ${hasForm(c) ? contactForm(c) : ""}
    <p class="fine">© ${new Date().getFullYear()} ${esc(c.name)}<button class="term-open" type="button" hidden><span aria-hidden="true">&gt;_</span> Open terminal</button></p>
  </div>
</footer>${terminal(c)}
</body>
</html>
`;
}

export function build(outDir = join(ROOT, "_site")) {
  const content = JSON.parse(readFileSync(join(ROOT, "content.json"), "utf8"));
  const html = render(content);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html);
  mkdirSync(join(outDir, "work"), { recursive: true });
  for (const p of content.projects.filter((x) => x.caseStudy)) {
    writeFileSync(join(outDir, casePath(p)), renderCase(content, p));
  }
  if (content.lab) {
    mkdirSync(join(outDir, "lab"), { recursive: true });
    writeFileSync(join(outDir, "lab", "index.html"), renderLab(content));
  }
  if ((content.postmortems ?? []).length) {
    mkdirSync(join(outDir, "postmortems"), { recursive: true });
    writeFileSync(join(outDir, "postmortems", "index.html"), renderPostmortemIndex(content));
    for (const pm of content.postmortems) writeFileSync(join(outDir, pmPath(pm)), renderPostmortem(content, pm));
  }
  cpSync(join(ROOT, "assets"), join(outDir, "assets"), { recursive: true });
  for (const file of ["404.html", "thanks.html", "CNAME", "robots.txt"]) {
    if (existsSync(join(ROOT, file))) copyFileSync(join(ROOT, file), join(outDir, file));
  }
  for (const link of [content.links.resume, content.photo, content.pronounce?.audio].filter(Boolean)) {
    if (!isExternal(link) && !existsSync(join(outDir, link))) throw new Error(`Missing file: ${link}`);
  }
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Built ${build()}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
