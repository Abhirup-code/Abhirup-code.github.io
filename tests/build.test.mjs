import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build, esc, render, safeUrl, validate } from "../build.mjs";

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
  for (const p of content.projects) assert.ok(html.includes(esc(p.title)), p.title);
  for (const e of content.education) assert.ok(html.includes(esc(e.school)), e.school);
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

test("the page blocks scripts and outside content with a Content Security Policy", () => {
  const html = render(content);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'none'/);
  assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(html), "no executable scripts");
});

test("outside links open in a new tab without giving it access to this page", () => {
  const html = render(content);
  const external = html.match(/<a [^>]*href="https:[^"]*"[^>]*>/g) ?? [];
  assert.ok(external.length > 0);
  for (const tag of external) assert.match(tag, /rel="noopener noreferrer"/, tag);
});

test("the build writes the page, assets, domain, and 404 page", () => {
  const out = build(join(mkdtempSync(join(tmpdir(), "site-")), "_site"));
  for (const file of ["index.html", "404.html", "CNAME", "robots.txt", "assets/styles.css", "assets/favicon.svg", content.links.resume]) {
    assert.ok(existsSync(join(out, file)), file);
  }
  assert.equal(readFileSync(join(out, "CNAME"), "utf8").trim(), "abhirupkhan.me");
});
