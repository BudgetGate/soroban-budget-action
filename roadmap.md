# soroban-budget-action roadmap

Progress tracker for this repo. The defect IDs (A1, A2, …) and their evidence are in `CLAUDE.md` section 3; the order comes from `CLAUDE.md` section 4. Tick a box only when the change is merged to `main`.

Last updated: 2026-10-26

## Where I left off

- `main` is at `bf1a289`. `dist/` is in sync with `src/`.
- A13 done: the tool-cache test builds its expected path with `path.join`; 6 of 6 tests pass on Windows and Linux.
- Core is feature-complete for its work order (exit code 2 for errors, report-only stdout, live network caps). The docs site's setup page shows the interim workflow: build core from source, pass `binary-path`.
- A10 done: CI rebuilds `dist/` and fails if it differs from the committed copy.
- A8 done: regression is decided by core's exit code only; a core error fails the step with core's stderr, posts no comment and saves no cache.
- A9 done: one report comment per PR, found by the hidden marker `<!-- budgetgate-report -->` and updated on each run.
- Open question (A14): after a core error the previous report comment stays; should it be updated to say the run failed?
- A5 done: the baseline comes from `baseline-path` if the file exists, else the Actions cache (saved on every default-branch push), else an empty baseline with a visible note. Found and fixed on the way: `@actions/cache` 6.2.0 is ESM-only, so the bundle never contained it and saving had never worked; pinned `^5.3.0` (CommonJS).
- A6 done: the stale `tsc` output `lib/index.js` (2026-09-15) is removed and `lib/` is gitignored.
- Next up: phase 1 leftovers (A4 license, A7 README checkout/token, A12 stale repo docs, A11 Node runtime). A14 waits for the maintainer.
- Not verified anywhere yet: a real cache round trip (save on a default-branch push, restore on a PR). That needs a workflow in a real repository.

## Blocked on core

The Action can't be finished end to end until core has:
- [x] Real measurement merged to `main` (core #9 and #8, verified on testnet 2026-10-26)
- [x] Exit code 2 for errors (core C4, core #15)
- [ ] A release containing `budget-core-linux-amd64` (core C12)

## Phase 1: Repo accuracy (not blocked)

- [x] A13: make the tool-cache test pass on Windows (path separators)
- [x] A10: CI step that rebuilds `dist/` and fails if it differs from the committed copy
- [ ] A4: `package.json` license `MIT` and a real description
- [x] A6: remove the unused `lib/index.js` (stale `tsc` output) and gitignore `lib/`
- [ ] A7: README example uses `actions/checkout@v4`; resolve `github-token` being both required and defaulted
- [ ] A12: replace `DOCUMENTATION.md` with a link to the docs site (or make it accurate); remove `PR_BODY.md` and `pr_body_action.md`
- [ ] A11: check whether `runs.using: node20` is still supported; move to the current runtime if not

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
