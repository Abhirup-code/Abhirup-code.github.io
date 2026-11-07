import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build, esc, FORM_ENDPOINT, hasForm, render, renderCase, renderLab, renderPostmortem, renderPostmortemIndex, safeUrl, skillProof, terminalData, validate } from "../build.mjs";

const content = JSON.parse(readFileSync(new URL("../content.json", import.meta.url), "utf8"));
const copy = () => structuredClone(content);

test("content.json is valid", () => {
  assert.deepEqual(validate(content), []);
});

test("every job, project, school, and skill appears on the page", () => {
  const html = render(content);
  for (const job of content.experience) {
    assert.ok(html.includes(esc(job.title)), job.title);
    assert.ok(html.includes(esc(job.dates)), job.dates);
    for (const point of job.points) assert.ok(html.includes(esc(point)), point);
  }
  for (const p of [...content.projects, ...content.moreProjects]) assert.ok(html.includes(esc(p.title)), p.title);
  for (const e of content.education) {
    assert.ok(html.includes(esc(e.school)), e.school);
    if (e.place) assert.ok(html.includes(`<span class="school-place">${esc(e.place)}</span>`), e.place);
  }
  for (const s of content.skills) for (const item of s.items) assert.ok(html.includes(esc(item)), item);
});

test("jobs are listed newest first, and only the first is marked current", () => {
  const html = render(content);
  const positions = content.experience.map((j) => html.indexOf(esc(j.title)));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.equal(html.split("job-current").length - 1, 1);
});

test("text from content.json is escaped, so it cannot add markup", () => {
  const c = copy();
  c.projects[0].title = '<img src=x onerror="alert(1)">';
  c.experience[0].points = ["<script>alert(1)</script>"];
  const html = render(c);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("only https, mailto, and files in this repo are allowed as links", () => {
  assert.equal(safeUrl("https://github.com/Abhirup-code"), "https://github.com/Abhirup-code");
  assert.equal(safeUrl("mailto:a@b.com"), "mailto:a@b.com");
  assert.equal(safeUrl("assets/resume.pdf"), "assets/resume.pdf");
  for (const bad of ["javascript:alert(1)", "http://insecure.example", "../secret", "/etc/passwd", "data:text/html,x", 'https://x" onclick="y']) {
    assert.throws(() => safeUrl(bad), /Link not allowed/, bad);
  }
  const c = copy();
  c.projects[1].url = "javascript:alert(1)";
  assert.throws(() => render(c), /Link not allowed/);
});

test("validation explains what is wrong", () => {
  const c = copy();
  delete c.name;
  c.projects[0].style = "neon";
  c.experience[0].points = "not a list";
  c.intro = "Uses an em dash — here";
  const problems = validate(c);
  assert.ok(problems.includes("name is missing"));
  assert.ok(problems.some((p) => p.startsWith("projects[0].style must be one of")));
  assert.ok(problems.includes("experience[0].points must be a list"));
  assert.ok(problems.some((p) => p.includes("em dash")));
  assert.throws(() => render(c), /content.json has problems/);
});

test("a photo is optional", () => {
  const none = copy();
  none.photo = null;
  assert.ok(!render(none).includes('class="photo"'));
  const c = copy();
  c.photo = "assets/photo.jpg";
  const html = render(c);
  assert.ok(html.includes('<img class="photo" src="assets/photo.jpg" alt="Abhirup Khan"'));
  assert.ok(html.includes("hero-art has-photo"));
});

test("scripts can only come from this site, and none are inline", () => {
  const pages = [render(content), ...content.projects.map((p) => renderCase(content, p))];
  for (const html of pages) {
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'self'/);
    const scripts = html.match(/<script[^>]*>/g) ?? [];
    for (const tag of scripts) {
      assert.match(tag, /^<script (src="(\.\.\/)?assets\/(theme|app)\.js"( defer)?|type="application\/ld\+json"|type="application\/json" id="site-data")>$/, tag);
    }
    // style-src has no 'unsafe-inline', so an inline style attribute would be silently ignored.
    assert.ok(!/\sstyle="/.test(html), "no inline style attributes");
  }
});

test("the theme is set before the stylesheet loads, so the page never flashes the wrong theme", () => {
  const html = render(content);
  assert.ok(html.indexOf("assets/theme.js") < html.indexOf("assets/styles.css"));
  assert.match(html, /<button class="theme-toggle magnetic" type="button" aria-label="Switch to dark mode" hidden>/);
});

test("each project tile opens a pop-up, and links to a full case study page without JavaScript", () => {
  const html = render(content);
  for (const p of content.projects) {
    const slug = p.caseStudy.slug;
    assert.ok(html.includes(`href="work/${slug}.html" data-dialog="dlg-${slug}"`), slug);
    assert.ok(html.includes(`<dialog class="project-dialog" id="dlg-${slug}" aria-labelledby="dlg-${slug}-title">`), slug);
    const page = renderCase(content, p);
    assert.ok(page.includes(`<h1>${esc(p.title)}</h1>`));
    for (const item of [...p.caseStudy.built, ...p.caseStudy.results]) assert.ok(page.includes(esc(item)), item.slice(0, 30));
    assert.ok(page.includes('href="../assets/styles.css"'));
  }
});

test("a case study needs every part and a safe slug", () => {
  const bad = copy();
  bad.projects[0].caseStudy.slug = "../evil";
  bad.projects[1].caseStudy.results = [];
  const problems = validate(bad);
  assert.ok(problems.includes("projects[0].caseStudy.slug must be lowercase letters, numbers, and dashes"));
  assert.ok(problems.includes("projects[1].caseStudy needs problem, built, results, and tech"));
});

test("the role line rotates, with one plain sentence for screen readers", () => {
  const html = render(content);
  assert.ok(html.includes(`<span class="sr-only">Open to roles in ${content.roles.join(", ")}</span>`));
  assert.ok(html.includes(`rotator rotator-${content.roles.length}`));
  const one = copy();
  one.roles = ["DevOps"];
  assert.ok(render(one).includes(`<p class="role">${esc(one.role)}</p>`));
});

test("carousel controls stay hidden until JavaScript turns them on", () => {
  assert.match(render(content), /<div class="carousel-controls" hidden>/);
});

test("Wipro jobs say Bengaluru, India", () => {
  const html = render(content);
  assert.equal(html.split("Bengaluru, India").length - 1, 2);
});

test("outside links open in a new tab without giving it access to this page", () => {
  const html = render(content);
  const external = html.match(/<a [^>]*href="https:[^"]*"[^>]*>/g) ?? [];
  assert.ok(external.length > 0);
  for (const tag of external) assert.match(tag, /rel="noopener noreferrer"/, tag);
});

test("the build writes the page, assets, domain, and 404 page", () => {
  const out = build(join(mkdtempSync(join(tmpdir(), "site-")), "_site"));
  for (const file of ["index.html", "404.html", "thanks.html", "work/honest-fit.html", "postmortems/index.html", "postmortems/k6-flag-removed.html", "lab/index.html", "assets/slo-sim.js", "assets/lab.js", "assets/app.js", "assets/theme.js", "CNAME", "robots.txt", "assets/styles.css", "assets/favicon.svg", content.links.resume]) {
    assert.ok(existsSync(join(out, file)), file);
  }
  assert.equal(readFileSync(join(out, "CNAME"), "utf8").trim(), "abhirupkhan.me");
});

test("more projects are optional, and need a title, description, and safe link", () => {
  const none = copy();
  delete none.moreProjects;
  assert.ok(!render(none).includes("More projects"));
  const bad = copy();
  bad.moreProjects[0] = { title: "X", description: "", url: "javascript:alert(1)" };
  const problems = validate(bad);
  assert.ok(problems.includes("moreProjects[0] needs title, description, and url"));
  assert.ok(problems.some((p) => p.startsWith("Link not allowed")));
});

test("the badge text is fitted around its circle whatever its length", () => {
  const html = render(content);
  assert.match(html, /<textPath href="#badge-circle" textLength="370" lengthAdjust="spacing">OPEN TO OPPORTUNITIES/);
});

test("awards are listed in order, are optional, and need a title and org", () => {
  const html = render(content);
  const section = html.slice(html.indexOf('id="awards"'), html.indexOf('id="contact"'));
  const positions = content.awards.map((a) => section.indexOf(esc(a.title)));
  assert.ok(positions.every((p) => p > 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  const none = copy();
  delete none.awards;
  assert.ok(!render(none).includes("Honors &amp;"));
  const bad = copy();
  bad.awards[0] = { title: "Award" };
  assert.ok(validate(bad).includes("awards[0] needs title and org"));
  const dated = copy();
  dated.awards[1].year = "2023";
  assert.ok(render(dated).includes(`${esc(dated.awards[1].org)} · 2023`));
  const undated = copy();
  delete undated.awards[1].year;
  assert.ok(render(undated).includes(`<strong>${esc(undated.awards[1].title)}</strong><span>${esc(undated.awards[1].org)}</span>`));
});

test("recommendations show a word-for-word pull quote, the person, and the full text", () => {
  const html = render(content);
  for (const r of content.recommendations) {
    assert.ok(html.includes(esc(r.quote)), r.name);
    assert.ok(html.includes(esc(r.name)), r.name);
    for (const para of r.text) assert.ok(html.includes(`<p>${esc(para)}</p>`), para.slice(0, 40));
  }
  assert.equal(html.split("<details>").length - 1, content.recommendations.length);
});

test("a reworded pull quote is rejected", () => {
  const c = copy();
  c.recommendations[0].quote = "Abhirup is the best engineer I have ever worked with.";
  assert.ok(validate(c).includes("recommendations[0].quote is not word for word from its text"));
  const none = copy();
  delete none.recommendations;
  assert.ok(!render(none).includes("What people"));
});

const KEY = "12345678-abcd-4ef0-9876-0123456789ab";

test("the contact form appears only once a Web3Forms key is set", () => {
  const off = copy();
  off.contactForm.accessKey = "";
  assert.ok(!hasForm(off));
  assert.ok(!render(off).includes('<form class="contact-form"'));
  assert.match(render(off), /form-action 'none'/);
  const on = copy();
  on.contactForm.accessKey = KEY;
  const html = render(on);
  assert.ok(html.includes(`<form class="contact-form" action="${FORM_ENDPOINT}" method="POST"`));
  assert.ok(html.includes(`name="access_key" value="${KEY}"`));
  assert.ok(html.includes('name="redirect" value="https://abhirupkhan.me/thanks.html"'));
  // 'self' is needed too: the browser checks the redirect back to thanks.html against form-action.
  assert.match(html, /form-action 'self' https:\/\/api\.web3forms\.com"/);
});

test("the form has labelled, required fields and a hidden spam trap", () => {
  const on = copy();
  on.contactForm.accessKey = KEY;
  const html = render(on);
  for (const [id, label] of [["f-name", "Your name"], ["f-email", "Your email"], ["f-message", "Message"]]) {
    assert.ok(html.includes(`<label for="${id}">${label}</label>`), label);
    assert.match(html, new RegExp(`id="${id}"[^>]*required`), id);
  }
  assert.match(html, /<input type="checkbox" name="botcheck" class="hp" tabindex="-1"/);
});

test("a malformed access key is rejected", () => {
  const bad = copy();
  bad.contactForm.accessKey = '"><script>alert(1)</script>';
  assert.ok(validate(bad).some((p) => p.startsWith("contactForm.accessKey must be")));
});

test("the header links to the contact section", () => {
  assert.ok(render(content).includes('<a class="nav-contact" href="#contact">Contact</a>'));
});

test("quick facts list every item and open from the hero", () => {
  const html = render(content);
  assert.ok(html.includes('href="#contact" data-dialog="dlg-quick">Quick facts</a>'));
  assert.ok(html.includes('<dialog class="project-dialog quick-dialog" id="dlg-quick" aria-labelledby="dlg-quick-title">'));
  for (const q of content.quickView.items) assert.ok(html.includes(`<dt>${esc(q.label)}</dt><dd>${esc(q.value)}</dd>`), q.label);
  assert.match(html, /<button class="btn magnetic copy-email" type="button" data-email="[^"]+" hidden>/);
  const bad = copy();
  bad.quickView.items[0].value = "";
  assert.ok(validate(bad).includes("quickView.items[0] needs label and value"));
});

test("leadership and volunteering are listed, and are optional", () => {
  const html = render(content);
  for (const l of content.leadership) {
    assert.ok(html.includes(`<h3>${esc(l.title)}</h3>`), l.title);
    assert.ok(html.includes(esc(l.org)), l.org);
  }
  const none = copy();
  delete none.leadership;
  assert.ok(!render(none).includes('id="leadership"'));
  const bad = copy();
  bad.leadership[0] = { title: "X" };
  assert.ok(validate(bad).includes("leadership[0] needs title, org, and text"));
});

test("a skill links only to jobs and projects whose own text names it", () => {
  const html = render(content);
  const postman = skillProof(content, "Postman").map((s) => s.label);
  assert.ok(postman.includes("Test Project Engineer, Wipro"));
  // A dash joins words: the aws-healthcheck-iac name inside another project is not proof of AWS.
  assert.ok(!skillProof(content, "AWS (IAM, EC2, CloudWatch, Secrets Manager)").some((s) => s.label === "Live Status Dashboard"));
  assert.ok(!skillProof(content, "pytest").some((s) => /pytest-bdd/.test(s.label)));
  assert.equal(skillProof(content, "Kubernetes Operator Pro").length, 0);
  // Chips with proof open a list; chips without stay plain.
  assert.match(html, /<details class="proof"><summary class="chip chip-lime">Postman<span class="proof-count" aria-hidden="true">\d+<\/span>/);
  assert.ok(html.includes('<li class="chip chip-accent">Troubleshooting</li>'));
  for (const [i] of content.experience.entries()) assert.ok(html.includes(`id="job-${i}"`));
  const bad = copy();
  bad.skillMatch.Postman = "Postman";
  assert.ok(validate(bad).some((p) => p.startsWith('skillMatch["Postman"]')));
});

test("the hidden terminal carries only public page facts as data, never as a script", () => {
  const html = render(content);
  assert.match(html, /<button class="term-open" type="button" hidden>/);
  assert.ok(html.includes('<dialog class="terminal" id="terminal" aria-labelledby="term-title">'));
  const raw = html.match(/<script type="application\/json" id="site-data">([^<]*)<\/script>/)[1];
  const data = JSON.parse(raw);
  assert.deepEqual(data, JSON.parse(JSON.stringify(terminalData(content))));
  assert.equal(data.links.email, content.links.email);
  assert.ok(!/\(\d{3}\)\s?\d{3}-\d{4}/.test(raw), "no phone number");
  const evil = copy();
  evil.intro = "</script><script>alert(1)</script>";
  assert.ok(!render(evil).includes("</script><script>alert(1)"));
});

test("postmortems get their own pages, newest first, with every part shown", () => {
  const index = renderPostmortemIndex(content);
  const dates = [...index.matchAll(/<time datetime="([0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...dates].sort().reverse(), dates);
  for (const pm of content.postmortems) {
    assert.ok(index.includes(`href="${pm.slug}.html"`), pm.slug);
    const page = renderPostmortem(content, pm);
    for (const part of [pm.title, pm.summary, pm.rootCause, pm.detection, ...pm.wentWell, ...pm.wentBadly]) {
      assert.ok(page.includes(esc(part)), part.slice(0, 30));
    }
    for (const t of pm.timeline) assert.ok(page.includes(esc(t.event)), t.event.slice(0, 30));
    for (const a of pm.actions) assert.ok(page.includes(`pm-type-${a.type.toLowerCase()}`));
    assert.match(page, /script-src 'self'/);
  }
  const home = render(content);
  assert.ok(home.includes('id="postmortems"'));
  assert.ok(home.includes('href="postmortems/"'));
});

test("a postmortem needs every section, a real date, and known action types", () => {
  const bad = copy();
  bad.postmortems[0].date = "Nov 6";
  bad.postmortems[1].actions = [{ action: "Do better", type: "Hope" }];
  bad.postmortems[2].slug = bad.postmortems[0].slug;
  delete bad.postmortems[2].rootCause;
  const problems = validate(bad);
  assert.ok(problems.includes("postmortems[0].date must be YYYY-MM-DD"));
  assert.ok(problems.some((p) => p.startsWith("postmortems[1].actions type must be one of")));
  assert.ok(problems.includes("postmortems[2].slug must be unique lowercase letters, numbers, and dashes"));
  assert.ok(problems.includes("postmortems[2] needs title, system, severity, summary, rootCause, and detection"));
  const none = copy();
  delete none.postmortems;
  assert.ok(!render(none).includes('id="postmortems"'));
});

test("the site's own SLO badge waits for real data and may only fetch from GitHub", () => {
  const html = render(content);
  assert.match(html, /<p class="site-slo" data-status-url="https:\/\/raw\.githubusercontent\.com\/[^"]+\/status\.json" hidden>/);
  assert.match(html, /connect-src 'self' https:\/\/raw\.githubusercontent\.com;/);
  const none = copy();
  delete none.siteSlo;
  assert.ok(!render(none).includes("site-slo"));
  assert.ok(!render(none).includes("connect-src"));
  const bad = copy();
  bad.siteSlo.statusUrl = "https://evil.example/status.json";
  assert.ok(validate(bad).includes("siteSlo.statusUrl must be a raw.githubusercontent.com JSON file"));
});

test("the lab page loads only its own scripts and works as a plain page without them", () => {
  const html = renderLab(content);
  assert.ok(html.includes('<script src="../assets/slo-sim.js" defer></script>'));
  assert.ok(html.includes('<script src="../assets/lab.js" defer></script>'));
  assert.ok(html.includes('<div class="lab-grid" hidden>'));
  assert.ok(html.includes("<noscript>"));
  assert.ok(!/\sstyle="/.test(html));
  assert.ok(render(content).includes('href="lab/"'));
  const none = copy();
  delete none.lab;
  assert.ok(!render(none).includes('id="lab"'));
});
