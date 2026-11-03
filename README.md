# abhirupkhan.me

[![Test and deploy](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/deploy.yml)

My portfolio: projects, experience, education, and resume. Live at **[abhirupkhan.me](https://abhirupkhan.me)**.

## Update the content

Everything on the page comes from [`content.json`](content.json): projects, jobs, education, skills, and links. Edit it on GitHub (pencil icon, then **Commit changes**) or locally, and the site rebuilds and deploys on its own in about a minute.

- **New job:** add an entry at the top of `experience` (newest first). The first job is marked as current.
- **Recruiter quick view:** edit `quickView.items` (a label and value each). It opens from the button under the intro.
- **Leadership and volunteering:** edit `leadership` (title, org, dates, text).
- **Skill proof:** each skill links to the jobs and projects whose own text names it, so nothing is claimed that the page does not show. When a skill is written differently in the text (for example "API testing" vs "API tests"), add the words to look for in `skillMatch`.
- **New project:** add an entry to `projects`, with a `caseStudy` (slug, problem, built, results, tech) for its pop-up and case study page. `style` is one of `feature`, `accent`, `lime`, `blue`, or `outline`; `code` is optional, for a project whose main link is a live demo.
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

## How it is built

| | |
|---|---|
| Build | `build.mjs` turns `content.json` into one static HTML page. No framework, no dependencies |
| Safety | Every value is HTML-escaped, links must be https, mailto, or a file in this repo, and a Content-Security-Policy allows scripts only from this site (no inline scripts or styles) and forms only to Web3Forms |
| Contact form | Plain HTML, no JavaScript: name, email, and message post to Web3Forms, which emails them to me and sends the visitor to a thank-you page. A hidden field catches spam bots |
| Motion | A skills ticker, a spinning badge, a rotating role line, hover lift on projects, magnetic buttons, a timeline that draws itself as you scroll, and sections that rise into place; all motion stops for people who turn on reduced motion |
| Interactive | Project pop-ups with a short case study, full case study pages under `work/`, a recommendations carousel with pause and previous/next controls, and a dark mode that follows the system setting or a saved choice. A recruiter quick view, skills that open a list of where each was used, and a hidden terminal (the footer button or the ` key; try `help`). Everything still works without JavaScript: tiles link to the case study pages, skill lists open as plain disclosures, and recommendations stack |
| Accessibility | axe-core finds no WCAG 2.1 AA issues at desktop and phone sizes in light and dark mode, including with a pop-up open and on the case study pages; skip link, focus outlines, focus returns after closing a pop-up, and the carousel never auto-plays for reduced-motion users |
| Tests | `node --test` checks the content, escaping, allowed links, page order, and build output |
| Deploy | GitHub Actions runs the tests, builds, and publishes to GitHub Pages on every push to `main`. Every action is pinned to a commit SHA and the workflow token is read-only except for the deploy step |
| Domain | `abhirupkhan.me`, with free HTTPS from GitHub Pages |
