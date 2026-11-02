// Builds the portfolio from content.json into _site/. No dependencies: run with `node build.mjs`.
// All text from content.json is HTML-escaped, and every link must be https, mailto, or a file in
// this repo, so a typo in content.json cannot break the page or inject markup.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STYLES = ["feature", "accent", "lime", "blue", "outline"];

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
  need(text(c?.links?.email), "links.email is missing");
  need(Array.isArray(c?.projects) && c.projects.length > 0, "projects must be a non-empty list");
  need(Array.isArray(c?.experience) && c.experience.length > 0, "experience must be a non-empty list");
  for (const [i, p] of (c?.projects ?? []).entries()) {
    need(text(p.title) && text(p.description) && text(p.url), `projects[${i}] needs title, description, and url`);
    need(STYLES.includes(p.style), `projects[${i}].style must be one of ${STYLES.join(", ")}`);
  }
  for (const [i, p] of (c?.moreProjects ?? []).entries()) {
    need(text(p.title) && text(p.description) && text(p.url), `moreProjects[${i}] needs title, description, and url`);
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

const isExternal = (url) => url.startsWith("https://");
const linkAttrs = (url) => (isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "");

function projectTile(p, i) {
  const n = String(i + 1).padStart(2, "0");
  const code = p.code
    ? `<a class="tile-code" href="${esc(safeUrl(p.code))}"${linkAttrs(p.code)}>Code</a>`
    : "";
  return `
      <article class="tile tile-${esc(p.style)}">
        <a class="tile-link" href="${esc(safeUrl(p.url))}"${linkAttrs(p.url)}>
          <span class="tile-top"><span class="kicker">${n} · ${esc(p.kicker ?? "")}</span><span class="arrow" aria-hidden="true">↗</span></span>
          <span class="tile-body"><strong class="tile-title">${esc(p.title)}</strong><span class="tile-desc">${esc(p.description)}</span></span>
        </a>${code}
      </article>`;
}

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

function job(e, i) {
  return `
      <li class="job reveal${i === 0 ? " job-current" : ""}">
        <span class="job-dot" aria-hidden="true"></span>
        <span class="job-dates">${esc(e.dates)}</span>
        <h3>${esc(e.title)}</h3>
        <p class="job-org">${esc(e.org)}${e.place ? ` · ${esc(e.place)}` : ""}</p>
        <ul>${e.points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>
      </li>`;
}

export function render(c) {
  const problems = validate(c);
  if (problems.length) throw new Error(`content.json has problems:\n- ${problems.join("\n- ")}`);
  const L = c.links;
  const ticker = (c.ticker ?? []).map(esc).join("  /  ") + "  /  ";
  const photo = c.photo
    ? `<img class="photo" src="${esc(safeUrl(c.photo))}" alt="${esc(c.name)}" width="270" height="340">`
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
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
${c.url ? `<link rel="canonical" href="${esc(safeUrl(c.url))}">` : ""}
<meta property="og:title" content="${esc(c.name)} · ${esc(c.role)}">
<meta property="og:description" content="${esc(c.description ?? c.intro)}">
<meta property="og:type" content="profile">
${c.url ? `<meta property="og:url" content="${esc(safeUrl(c.url))}">` : ""}
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&amp;family=Inter:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="assets/styles.css">
<script type="application/ld+json">${JSON.stringify(person).replaceAll("<", "\\u003c")}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav wrap">
  <a class="brand" href="#top">${esc(c.shortName ?? c.name)}</a>
  <nav aria-label="Sections">
    <a href="#work">Work</a>
    <a href="#experience">Experience</a>
    <a class="pill" href="${esc(safeUrl(L.resume))}">Resume ↗</a>
  </nav>
</header>
<div class="ticker" aria-hidden="true"><div class="ticker-track"><span>${ticker}</span><span>${ticker}</span></div></div>
<main id="main">
  <section class="hero wrap" id="top">
    <h1><span class="name-first">${esc(first)}</span> <span class="name-last">${esc(rest.join(" "))}.</span></h1>
    <p class="intro">${esc(c.intro)}</p>
    <p class="role">${esc(c.role)}</p>
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

  <section class="about wrap" id="about" aria-label="Education and skills">
    <div class="card card-dark reveal">
      <h2 class="eyebrow">Education</h2>
      ${(c.education ?? []).map((e) => `<div class="school"><strong>${esc(e.school)}</strong><span>${esc(e.degree)}</span>${e.details ? `<span>${esc(e.details)}</span>` : ""}</div>`).join("\n      ")}
    </div>
    <div class="card card-outline reveal">
      <h2 class="eyebrow">Skills</h2>
      ${(c.skills ?? []).map((s) => `<div class="skill-group"><h3>${esc(s.group)}</h3><ul class="chips">${s.items.map((it) => `<li class="chip chip-${esc(s.style)}">${esc(it)}</li>`).join("")}</ul></div>`).join("\n      ")}
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
` : ""}</main>
<footer class="contact" id="contact">
  <div class="wrap">
    <h2>${esc(c.contact?.heading ?? "Let's talk.")}</h2>
    <p>${esc(c.contact?.text ?? c.location ?? "")}</p>
    <ul class="contact-links">
      <li><a class="solid" href="${esc(safeUrl(`mailto:${L.email}`))}">${esc(L.email)}</a></li>
      ${L.linkedin ? `<li><a href="${esc(safeUrl(L.linkedin))}"${linkAttrs(L.linkedin)}>LinkedIn ↗</a></li>` : ""}
      ${L.github ? `<li><a href="${esc(safeUrl(L.github))}"${linkAttrs(L.github)}>GitHub ↗</a></li>` : ""}
      ${L.resume ? `<li><a href="${esc(safeUrl(L.resume))}">Resume ↗</a></li>` : ""}
    </ul>
    <p class="fine">© ${new Date().getFullYear()} ${esc(c.name)}</p>
  </div>
</footer>
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
  cpSync(join(ROOT, "assets"), join(outDir, "assets"), { recursive: true });
  for (const file of ["404.html", "CNAME", "robots.txt"]) {
    if (existsSync(join(ROOT, file))) copyFileSync(join(ROOT, file), join(outDir, file));
  }
  for (const link of [content.links.resume, content.photo].filter(Boolean)) {
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
