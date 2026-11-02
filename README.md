# abhirupkhan.me

[![Test and deploy](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/Abhirup-code/Abhirup-code.github.io/actions/workflows/deploy.yml)

My portfolio: projects, experience, education, and resume. Live at **[abhirupkhan.me](https://abhirupkhan.me)**.

## Update the content

Everything on the page comes from [`content.json`](content.json): projects, jobs, education, skills, and links. Edit it on GitHub (pencil icon, then **Commit changes**) or locally, and the site rebuilds and deploys on its own in about a minute.

- **New job:** add an entry at the top of `experience` (newest first). The first job is marked as current.
- **New project:** add an entry to `projects`. `style` is one of `feature`, `accent`, `lime`, `blue`, or `outline`; `code` is optional, for a project whose main link is a live demo.
- **Photo:** put the image in `assets/` and set `"photo": "assets/photo.jpg"`.
- **Resume:** replace `assets/Abhirup_Khan_Resume.pdf`.

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
| Safety | Every value is HTML-escaped, links must be https, mailto, or a file in this repo, and a Content-Security-Policy blocks all scripts |
| Motion | A skills ticker, a spinning badge, hover lift on projects, and sections that rise into place on scroll, all in CSS; all motion stops for people who turn on reduced motion |
| Accessibility | axe-core finds no WCAG 2.1 AA issues at desktop and phone sizes; skip link, focus outlines, and real headings and lists |
| Tests | `node --test` checks the content, escaping, allowed links, page order, and build output |
| Deploy | GitHub Actions runs the tests, builds, and publishes to GitHub Pages on every push to `main`. Every action is pinned to a commit SHA and the workflow token is read-only except for the deploy step |
| Domain | `abhirupkhan.me`, with free HTTPS from GitHub Pages |
