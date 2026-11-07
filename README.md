# abhirupkhan.me

[![Test and deploy](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/deploy.yml)
[![Uptime check](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/uptime.yml/badge.svg)](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/uptime.yml)

My portfolio: projects, experience, education, and resume. Live at **[abhirupkhan.me](https://abhirupkhan.me)**.

## Update the content

Everything on the page comes from [`content.json`](content.json): projects, jobs, education, skills, and links. Edit it on GitHub (pencil icon, then **Commit changes**) or locally, and the site rebuilds and deploys on its own in about a minute.

- **New job:** add an entry at the top of `experience` (newest first). The first job is marked as current.
- **Quick facts:** edit `quickView.items` (a label and value each). It opens from the button under the intro.
- **Leadership and volunteering:** edit `leadership` (title, org, dates, text).
- **Skill proof:** each skill links to the jobs and projects whose own text names it, so nothing is claimed that the page does not show. When a skill is written differently in the text (for example "API testing" vs "API tests"), add the words to look for in `skillMatch`.
- **New project:** add an entry to `projects`, with a `caseStudy` (slug, problem, built, results, tech) for its pop-up and case study page. `style` is one of `feature`, `accent`, `lime`, `blue`, or `outline`; `code` is optional, for a project whose main link is a live demo.
- **Postmortems:** add an entry to `postmortems` (slug, date, title, system, severity, summary, impact, timeline, rootCause, detection, wentWell, wentBadly, actions). Each gets a page under `postmortems/`, and the newest three show on the home page. Action types are `Prevent`, `Detect`, `Mitigate`, or `Document`.
- **Photo:** put the image in `assets/` and set `"photo": "assets/photo.jpg"`.
- **Resume:** replace `assets/Abhirup_Khan_Resume.pdf`.
- **Contact form:** get a free access key at [web3forms.com](https://web3forms.com) (enter your email, and the key arrives by email), then paste it into `contactForm.accessKey`. The form appears once the key is set, and every message goes to that email. The key is meant to be public; it can only send mail to you.

If something in `content.json` is wrong (a missing field, a bad link, an em dash), the build stops with a message saying what to fix, and the live site stays as it was.

## Run it locally

Needs Node 22 or newer. No packages to install.

```
node --test
node build.mjs
python3 -m http.server -d _site 8000
```

Then open http://localhost:8000.

## The site runs its own SLO

`.github/workflows/uptime.yml` checks the live site every 15 minutes. A check passes only if the
home page answers 200, contains my name, and loads in under 3 seconds. `scripts/uptime.mjs` keeps
30 days of daily totals in `status.json` on the `uptime-data` branch (one commit, rewritten each
time), and the home page shows the result against a **99.9% objective**, for example:

> This site: 99.97% up over 30 days · error budget 65% left · checked 6 min ago

The dot is green with more than 25% of the budget left, amber below that, red once it is spent, and
grey if the last check is more than 2 hours old. If the data cannot be read, the badge stays hidden.
To run a check by hand: Actions, then **Uptime check**, then **Run workflow**.

## The lab

[`/lab/`](https://abhirupkhan.me/lab/) is an in-browser simulation of a checkout service with the
same SLO, burn-rate alert tiers, and deploy gate as [Burn_Rate](https://github.com/Abhirup-code/Burn_Rate).
The logic in `assets/slo-sim.js` is unit tested against the same scenarios as Burn_Rate's promtool
alert tests: a full outage pages in about 4.5 minutes, and a 2% leak opens a ticket after about
18 hours without ever paging.

## Verify this site

Every deploy is signed. GitHub Actions builds the site, then creates a signed
[build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations)
for every file it is about to publish.

To check that the page you are looking at really came from this repository's CI, unchanged,
with the [GitHub CLI](https://cli.github.com/):

```bash
curl -sO https://abhirupkhan.me/index.html
gh attestation verify index.html --repo Abhirup-code/Abhirup-code.github.io
```

A match prints `✓ Verification succeeded!` with the workflow and commit that built it. Any other
file works the same way, for example `assets/styles.css`.

## How it is built

| | |
|---|---|
| Build | `build.mjs` turns `content.json` into one static HTML page. No framework, no dependencies |
| Safety | Every value is HTML-escaped, links must be https, mailto, or a file in this repo, and a Content-Security-Policy allows scripts only from this site (no inline scripts or styles) and forms only to Web3Forms |
| Contact form | Plain HTML, no JavaScript: name, email, and message post to Web3Forms, which emails them to me and sends the visitor to a thank-you page. A hidden field catches spam bots |
| Motion | A skills ticker, a spinning badge, a rotating role line, hover lift on projects, magnetic buttons, a timeline that draws itself as you scroll, and sections that rise into place; all motion stops for people who turn on reduced motion |
| Interactive | Project pop-ups with a short case study, full case study pages under `work/`, a recommendations carousel with pause and previous/next controls, and a dark mode that follows the system setting or a saved choice. A quick facts pop-up, skills that open a list of where each was used, and a hidden terminal (the footer button or the ` key; try `help`). Everything still works without JavaScript: tiles link to the case study pages, skill lists open as plain disclosures, and recommendations stack |
| Reliability | A 99.9% uptime SLO measured every 15 minutes and shown live on the home page, public blameless postmortems under `postmortems/`, and an interactive error budget lab under `lab/` |
| Supply chain | Every published file carries a signed build provenance attestation |
| Accessibility | axe-core finds no WCAG 2.1 AA issues at desktop and phone sizes in light and dark mode, including with a pop-up open and on the case study pages; skip link, focus outlines, focus returns after closing a pop-up, and the carousel never auto-plays for reduced-motion users |
| Tests | `node --test` checks the content, escaping, allowed links, page order, and build output |
| Deploy | GitHub Actions runs the tests, builds, and publishes to GitHub Pages on every push to `main`. Every action is pinned to a commit SHA and the workflow token is read-only except for the deploy step |
| Domain | `abhirupkhan.me`, with free HTTPS from GitHub Pages |
