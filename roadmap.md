# soroban-budget-action roadmap

Progress tracker for this repo. The defect IDs (A1, A2, …) and their evidence are in `CLAUDE.md` section 3; the order comes from `CLAUDE.md` section 4. Tick a box only when the change is merged to `main`.

Last updated: 2026-10-27

## Where I left off

- `main` is at `a8198a8` (after #19). `dist/` is in sync with `src/` (rebuilt with ncc on Linux and diffed 2026-10-27); 21 of 21 tests pass.
- A13 done: the tool-cache test builds its expected path with `path.join`; 6 of 6 tests pass on Windows and Linux.
- Core is feature-complete for its work order (exit code 2 for errors, report-only stdout, live network caps). The docs site's setup page shows the interim workflow: build core from source, pass `binary-path`.
- A10 done: CI rebuilds `dist/` and fails if it differs from the committed copy.
- A8 done: regression is decided by core's exit code only; a core error fails the step with core's stderr, posts no comment and saves no cache.
- A9 done: one report comment per PR, found by the hidden marker `<!-- budgetgate-report -->` and updated on each run.
- Open question (A14): after a core error the previous report comment stays; should it be updated to say the run failed?
- A5 done: the baseline comes from `baseline-path` if the file exists, else the Actions cache (saved on every default-branch push), else an empty baseline with a visible note. Found and fixed on the way: `@actions/cache` 6.2.0 is ESM-only, so the bundle never contained it and saving had never worked; pinned `^5.3.0` (CommonJS).
- A4 done: `package.json` and the lockfile root say `MIT`, matching `LICENSE`; `description` filled in.
- A6 done: the stale `tsc` output `lib/index.js` (2026-09-15) is removed and `lib/` is gitignored.
- A15 done: `package.json` `main` is `dist/index.js` (same as `action.yml`), `author` is Budget Gate.
- A7 done: README pins `actions/checkout@v4` like the examples; `github-token` is `required: false` in `action.yml` and the README (it always has the workflow token as default).
- A16 done: README and `examples/*.yml` use `actions/checkout@v7` (current major, node24 runtime); the docs site's setup page matches (`BudgetGate/docs` PR).
- A12 done: `DOCUMENTATION.md` (mostly invented behaviour), `PR_BODY.md` and `pr_body_action.md` removed; the README links to the docs site.
- A17 done: `website/` removed. It was an undeployed Vite site whose pages repeated `DOCUMENTATION.md`'s invented claims (debug env var, memory, `@v1`); the docs site is the only docs site.
- A18 done: `CONTRIBUTING.md` rewritten for this repo (Node 20, `npm ci`/`test`/`build`, committing `dist/` with `git add -f`, CI's `dist` artifact, the Action's rules).
- A11 done: `runs.using: node24`, CI on Node 24. GitHub made Node 24 the runner default on 2026-06-16 (forcing `node20` actions onto it with an annotation) and removed Node 20 on 2026-09-23.
- Next up: phase 1 is done. Everything left needs a maintainer decision: A14 (comment after a failed run), a test repository, and a core release (C12) for A1–A3.
- Not verified anywhere yet: a real cache round trip (save on a default-branch push, restore on a PR). That needs a workflow in a real repository.

## Blocked on core

The Action can't be finished end to end until core has:
- [x] Real measurement merged to `main` (core #9 and #8, verified on testnet 2026-10-26)
- [x] Exit code 2 for errors (core C4, core #15)
- [ ] A release containing `budget-core-linux-amd64` (core C12)

## Phase 1: Repo accuracy (not blocked)

- [x] A13: make the tool-cache test pass on Windows (path separators)
- [x] A10: CI step that rebuilds `dist/` and fails if it differs from the committed copy
- [x] A4: `package.json` license `MIT` and a real description
- [x] A15: `package.json` `main` points at a real file (or is removed); `author` set
- [x] A6: remove the unused `lib/index.js` (stale `tsc` output) and gitignore `lib/`
- [x] A7: README example uses `actions/checkout@v4`; resolve `github-token` being both required and defaulted
- [x] A16: move every `actions/checkout` pin (README, examples, docs site) to the current major
- [x] A12: replace `DOCUMENTATION.md` with a link to the docs site (or make it accurate); remove `PR_BODY.md` and `pr_body_action.md`
- [x] A17: remove the unused `website/` Vite template
- [x] A18: `CONTRIBUTING.md` written for this TypeScript repo (Node, `npm ci`, `npm test`, `npm run build`, committing `dist/`)
- [x] A11: check whether `runs.using: node20` is still supported; move to the current runtime if not

## Phase 2: Baseline persistence and PR comment

- [x] A5: restore the cached baseline before comparing (Actions cache, as decided in the workspace `roadmap.md`); typed `@actions/cache` import
- [x] A9: find and update the existing Budget Gate comment by a hidden HTML marker instead of posting a new one
- [ ] A14: decide how the comment shows a failed run (today it keeps the previous report)

## Phase 3: Correct regression signal (core C4 done in core #15)

- [x] A8: decide "regression" from core's exit code only (1 = regression, 2 = error → `core.setFailed` with the error, no regression comment); drop the stdout text match and its test

## Phase 4: Usable by others (needs core C12)

- [ ] A1: README example and inputs table match `action.yml`; no hand-made snapshots
- [ ] A2: a default that obtains a working core binary; examples that run as written
- [ ] Run the Action against a real PR in a test repository and record the result
- [ ] A3: release and a `v1` tag (only when the maintainer asks)

## Maintainer actions (Claude must not do these)

- [ ] Branch protection on `main`: currently 0 required reviews and no required status checks. Consider requiring `Action CI / build-and-test`.
- [ ] Repo topics and description.
- [ ] Delete branches `docs/claude-md-and-roadmap` and `feature/complete-missing-specs`; both are fully in `main` (checked 2026-10-26).
