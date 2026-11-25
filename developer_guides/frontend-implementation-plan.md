# Frontend Implementation Plan

The frontend implementation plan has three steps so far:

1. Curator/Admin UI on GitHub Pages (Status: Done)
2. Resource summaries in the UI (Status: Done)
3. Human verification of agentic updates (Status: Not implemented)

## ToDo Checklist
- [x] 1. Static GitHub Pages site serving from `docs/`, no backend, see `Architecture`
- [x] 2. Browse view over all three data sheets, see `Browse`
- [x] 3. Schema-driven edit form in a side drawer, see `Edit`
- [x] 4. Staged edits submitted as one pull request, see `Submit`
- [x] 5. Review queue with a field-level diff, approve and merge, see `Review`
- [x] 6. One-click row verification, see `Verify`
- [x] 7. Read, write and edit resource summaries, see `Resource Summaries`
- [x] 8. Deployment notes, see `Deployment`
- [x] 9. ALAF checklist reader, see `ALAF Checklist Reader`
- [ ] 10. Edit the ALAF checklist from the UI, as summaries are edited, see `ALAF Checklist Reader`
- [ ] 11. Human verification of agentic updates, see `Human Verification of Agentic Updates`

## Architecture

A static site hosted on GitHub Pages from `docs/`, client-side JavaScript only, no server and no build step. It is the browser-based counterpart to the scripts and Actions described in `backend-implementation-plan.md`, and it adds no data rules of its own.

- **Reads** come from `raw.githubusercontent.com`: CORS-enabled and not rate limited, unlike the REST API's 60 requests/hour for unauthenticated callers. Browsing works signed out.
- **Writes** go through the GitHub REST API as the signed-in user: branch, file contents, pull request, review, merge, workflow dispatch. The token needs Contents, Pull requests and Actions, read and write.
- **Auth** is a fine-grained personal access token pasted once and held in `sessionStorage` for that tab only. The UI hides what the token cannot do; GitHub enforces it server-side.
- **No conversion logic is reimplemented.** The page edits `data/json/` and opens a pull request; the scripts and Actions keep the xlsx in sync.

Files in `docs/`: `index.html`, `styles.css`, and the modules `config.js` (constants), `github-api.js` (REST and raw access), `schema.js` (field definitions from `dictionary.json`), `markdown.js` (summary rendering), `ui.js` (shared primitives), `app.js` (application logic).

## Browse

A table over `Knowledgebase`, `Deprecated` and `SOTA Coding Agents Benchmarks`, scoped to `Knowledgebase` by default. Search covers name, URL and organization. Filters cover sheet, resource type, maturity, rows needing verification, and rows with a summary. Each row shows its verification state as Verified, Stale or Unverified.

## Edit

Clicking a resource opens a side drawer holding the edit form for that row. The field list, control types and vocabulary terms come from `data/json/dictionary.json`, so adding a column or a term reaches the form with no JavaScript change. `controlled_multi` fields are JSON arrays and are written back as arrays, not joined strings. Fields the pipeline owns (`ID`, `Added/Edited By`, `Last Updated`, `Verified By`, `Last Verified`) are shown but never editable. The form is read-only when signed out.

## Submit

Edits are staged rather than sent one at a time. Submitting creates a branch, writes each changed sheet file, and opens a single pull request, which follows the review path in `backend-implementation-plan.md`. Each file is re-read at write time for its blob SHA, so a stale tab cannot overwrite newer rows.

## Review

Open pull requests touching `data/json/` appear as cards with a field-level before and after diff. Approve and merge are one action. GitHub still blocks an author approving their own pull request.

## Verify

A curator listed in `.github/CODEOWNERS` can tick rows in the table and mark them verified directly, without opening a pull request. The UI dispatches `verify-rows.yml`, which re-checks the caller against `.github/CODEOWNERS` and pushes as the branch-protection bypass actor. Use it to re-confirm a row that has no pending edit. Changing a row's content still clears its verification.

## Resource Summaries

Each resource may have a Markdown summary in `data/summaries/`, named `<id>_<resource name>.md`. The id prefix maps a file to its row, so no column stores a link. Discovery needs one REST call to list the directory; if it fails the summary affordances are hidden and nothing else is affected. Markdown is escaped before rendering and link hrefs are limited to http, https and mailto. The UI shows which resources have one, renders it in the drawer with its provenance line, and lets a curator write or edit one. Summaries are staged and submitted in the same pull request as row edits. `reviewed_by` is stamped from the approving review on merge.

## ALAF Checklist Reader

`data/alaf/ALAF_CHECKLIST.md` is read in a full-page panel opened from the header, addressable as `#checklist` so the README can link to it and a reload keeps the panel open. Content comes from `raw.githubusercontent.com` like every other read, so nothing Markdown is served from `docs/`.

`markdown.js` covers the constructs the checklist uses that summaries do not: GFM tables, horizontal rules, task list items, and in-document anchors. Task boxes render disabled, the repository copy is the template rather than an answer sheet. Heading ids use GitHub's slug so a link written for github.com resolves in the panel, and anchor clicks are intercepted to scroll within the panel instead of replacing the route. Front matter is stripped and shown as a provenance line.

**Not built yet (item 10):** the panel is read-only, so the checklist is edited on github.com. Planned is the same editor summaries use, write and preview tabs, staged into the same pull request, with `reviewed_by` stamped on approval. The stamping half already works, `stamp_markdown` covers `data/alaf` alongside `data/summaries`.

## Local development

Two ways to run the UI locally. Pick by whether the data you need is already on `main`.

Opening `index.html` from the filesystem does not work either way, because ES modules are blocked over `file://`.

### Option 1: data is already on main

No build step. Serve `docs/` and open it:

1. `cd docs`
2. `python -m http.server 8000`
3. Open [http://localhost:8000](http://localhost:8000)

Reads come from `raw.githubusercontent.com` and writes go to `api.github.com`, so sign-in and editing behave as they do in production.

### Option 2: data is only on your branch

`DEFAULT_BRANCH` in `config.js` is `main`, so the UI reads `main` no matter which branch you are on or which branch Pages serves. A file added on a branch is invisible until it merges, and the request 404s.

`src/scripts/serve_ui_locally.py` copies `docs/` to `.local-ui/` (gitignored), repoints `RAW_BASE` at localhost, and stages `data/json`, `data/summaries` and `data/alaf` from the working tree under a `main/` folder so the raw URL shape still matches.

1. From the repository root, build and serve:

   ```powershell
   python src/scripts/serve_ui_locally.py --build --serve --port 8123
   ```

2. Open [http://localhost:8123](http://localhost:8123). The table and the `ALAF Checklist` panel now read your working tree.
3. Stop with `Ctrl+C`.

**`.local-ui/` is a copy, not a symlink.** Editing `docs/` changes nothing in the running site until you re-run with `--build`. Expect to see your old code and assume the change failed otherwise.

Writes still target the real `api.github.com`, so use this for read and render checks, not for staging edits. Full argument list in `scripts-guide.md`.

### What local testing cannot cover

Verification stamping runs on `pull_request: closed`, so steps that depend on it need a real merged pull request. No local harness substitutes for that.

## Deployment

Pages serves `docs/` from the branch set in Settings. Assets are sent with `Cache-Control: max-age=600`, so hard reload (`Ctrl+Shift+R`) after a deploy; a soft reload reuses cached ES modules and hides the change for up to ten minutes.

## Human Verification of Agentic Updates

Not implemented. No design decisions made yet.

The backend plan anticipates agents proposing changes to the VT Radar. The plan needs to define what a human needs to see or click in the UI, in order to accept or reject a change an agent produced.
