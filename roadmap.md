# soroban-budget-action roadmap

Progress tracker for this repo. The defect IDs (A1, A2, …) and their evidence are in `CLAUDE.md` section 3; the order comes from `CLAUDE.md` section 4. Tick a box only when the change is merged to `main`.

Last updated: 2026-10-29

## Where I left off

- `main` is at `909e535` (after #32; `v0.2.0` is tagged on `467b83f`, so `@v0.2.0` users do not have A21 yet). `dist/index.js` is in sync with `src/` (CI's rebuild check passed 2026-10-29); 38 of 38 tests pass on `main` (checked locally 2026-10-29).
- A13 done: the tool-cache test builds its expected path with `path.join`; 6 of 6 tests pass on Windows and Linux.
- Core is feature-complete for its work order (exit code 2 for errors, report-only stdout, live network caps). The docs site's setup page shows the interim workflow: build core from source, pass `binary-path`.
- A10 done: CI rebuilds `dist/` and fails if it differs from the committed copy.
- A8 done: regression is decided by core's exit code only; a core error fails the step with core's stderr, posts no comment and saves no cache.
- A9 done: one report comment per PR, found by the hidden marker `<!-- budgetgate-report -->` and updated on each run.
- A14 decided by the maintainer (2026-10-27): after a core error the PR comment says the latest run failed.
- A5 done: the baseline comes from `baseline-path` if the file exists, else the Actions cache (saved on every default-branch push), else an empty baseline with a visible note. Found and fixed on the way: `@actions/cache` 6.2.0 is ESM-only, so the bundle never contained it and saving had never worked; pinned `^5.3.0` (CommonJS).
- A4 done: `package.json` and the lockfile root say `MIT`, matching `LICENSE`; `description` filled in.
- A6 done: the stale `tsc` output `lib/index.js` (2026-09-15) is removed and `lib/` is gitignored.
- A15 done: `package.json` `main` is `dist/index.js` (same as `action.yml`), `author` is Budget Gate.
- A7 done: README pins `actions/checkout@v4` like the examples; `github-token` is `required: false` in `action.yml` and the README (it always has the workflow token as default).
- A16 done: README and `examples/*.yml` use `actions/checkout@v7` (current major, node24 runtime); the docs site's setup page matches (`BudgetGate/docs` PR).
- A12 done: `DOCUMENTATION.md` (mostly invented behaviour), `PR_BODY.md` and `pr_body_action.md` removed; the README links to the docs site.
- A17 done: `website/` removed. It was an undeployed Vite site whose pages repeated `DOCUMENTATION.md`'s invented claims (debug env var, memory, `@v1`); the docs site is the only docs site.
- A18 done: `CONTRIBUTING.md` rewritten for this repo (Node 20 at the time, now Node 24 since A11; `npm ci`/`test`/`build`, committing `dist/` (`git add -f` then, `git add dist` since A22), CI's `dist` artifact, the Action's rules).
- A11 done: `runs.using: node24`, CI on Node 24. GitHub made Node 24 the runner default on 2026-06-16 (forcing `node20` actions onto it with an annotation) and removed Node 20 on 2026-09-23.
- Found while doing A11: CI's own action pins (`checkout`, `setup-node`, `upload-artifact` at `@v4`) target Node 20 and are forced onto Node 24 with a warning (A19).
- A19 done: `ci.yml` uses `actions/checkout@v7`, `setup-node@v7` and `upload-artifact@v7` (all `node24`), so CI no longer warns about Node 20.
- A14 done: after a core error (exit code other than 0 or 1) the marked comment is updated, or created, with "The latest run failed", the exit code and a link to the workflow run; the earlier report is replaced. Core's stderr is not posted (it can contain the RPC URL) and stays in the step failure. Ran on real PRs 2026-10-28 (see below).
- A1, A2 done: README rewritten (fixture-based workflow with `binary-version: 0.2.0`, all inputs, outputs, baseline, comment, permissions) and examples that set `binary-version`; the downloaded core binary is checked against the release's `SHA256SUMS`, and `binary-version` refuses non-Linux-x64 runners. 28 tests pass, and the release-download path has now run in a real workflow (see the first real run below).
- Dashboard D5 (maintainer's decision, 2026-10-28; #24): opt-in `history-branch` input. On each default-branch push the Action appends the snapshot to `history.json` on that branch (created with no parent commit; last 200 snapshots kept); the dashboard reads it from raw.githubusercontent.com, which sends `access-control-allow-origin: *` (checked 2026-10-28). Fixture runs now pass `--commit-sha`. 38 tests. Ran in a real workflow: the first real run below created the branch and appended `history.json`.
- First real end-to-end run (2026-10-28): `BudgetGate/budgetgate-action-test` (created by the maintainer), workflow run [40695137554](https://github.com/BudgetGate/budgetgate-action-test/actions/runs/40695137554), a push to `main`, every step green. The Action ran at `@feat/snapshot-history` (`main` + `cb24f8a`), downloaded core `v0.2.0` through `binary-version`, checked it against `SHA256SUMS` and measured the counter v1 `bump` fixture on testnet: 291,573 CPU instructions, 0 read bytes, 80 write bytes, 3 read / 1 write entries, `pct_of_network_cap` 0.75 (the highest of any metric — 3 footprint entries of the 400 limit, per core's `SCHEMA.md`; CPU alone is 0.07% of the 400,000,000 cap). Those numbers are the same ones core measured for the same contract in `soroban-budget-core/testdata/counter`, so the Action's fixture path agrees with core. It then saved the baseline cache (`budgetgate-baseline-cedf1c2…`, 441 bytes) and appended `history.json` (schema `2.0`, 543 bytes) to `budgetgate-history` in commit `ab48e55`.
- Real pull requests in `budgetgate-action-test` (2026-10-28, Action at `@main` = `f897020`), every PR path now verified on GitHub:
  - PR #1, fixture switched to counter v2 (run 40728333666): baseline **restored** from cache entry `budgetgate-baseline-cedf1c2…`, an exact hit on the base commit, so A5's save-and-restore round trip works. Core exit 1; comment `6474905442` posted with CPU 291,573 → 449,005 (+53.99%), write bytes 80 → 380, read entries 3 → 6, write entries 1 → 4, the same numbers as core's counter check; step failed as a regression.
  - PR #1, empty commit (run 40728531842): the same comment updated, still one comment (A9).
  - PR #1, RPC URL broken (run 40728868808): the same comment replaced with "The latest run failed" (A14 replace path).
  - PR #2, RPC URL broken from the start (run 40728712305): comment created with "The latest run failed", exit code 2 and a run link, no stderr (A14 create path); step failed with core's error.
  - PR #3, unchanged v1 fixture (run 40729078960): cache restored, "No regression", comment posted, step green.
  - PRs #1 and #2 are closed with the results. PR #3 moves the test repo's workflow from the deleted `@feat/snapshot-history` to `@main`; it is the maintainer's to merge.
- A3 done (2026-10-28, maintainer's request): `package.json` bumped to `0.2.0`, then `v0.2.0` tagged on `main` as an exact tag (no moving `v0`: moving it would need a force-pushed tag) with a GitHub release. The README and examples already pin `@v0.2.0`.
- `@v0.2.0` ran in a real workflow: test repo PR #4 (run 40736659402) resolved the tag to `467b83f`, downloaded core v0.2.0, matched `SHA256SUMS`, restored the cached baseline and posted "No regression". The test repo's workflow (its PR #4) and the docs site (docs #30) move to `@v0.2.0`.
- A21 (2026-10-29): runtime dependencies moved to the last CommonJS majors (`@actions/core` 2.0.3, `exec` 2.0.0, `tool-cache` 3.0.1, `github` 8.0.1); `npm audit --omit=dev` went from 12 issues (2 high) to 0. 38 tests pass (the `@actions/github` mock is now a factory). The built `dist/` was run locally against a fake GitHub API: it downloaded core v0.2.0, matched `SHA256SUMS`, compared core's counter v1/v2 snapshots (CPU 291,573 → 449,005, exit 1), created the marked comment, updated it on a second run and wrote `regression_detected=true`. Merged in #32 (`909e535`).
- A21 ran on real GitHub (2026-10-29) in `budgetgate-action-test` PR #5, with the Action pinned to `909e535`: counter v2 (run 40845313063) restored the cached baseline `budgetgate-baseline-ed582a4…`, matched `SHA256SUMS`, measured CPU 291,573 → 449,005, write bytes 80 → 380, read entries 3 → 6, write entries 1 → 4 and posted comment `6492257961` (step failed as a regression); counter v1 (run 40845399693) updated the same comment and passed. Merging PR #5 (push run 40845644491 on `86a4a71`, green) saved the cache entry `budgetgate-baseline-86a4a71…` (443 B) and appended the snapshot to `history.json` on `budgetgate-history` (3 → 4 snapshots, read back). The test repo's workflow now pins `909e535`; move it to `@v0.2.1` when that is released (only when the maintainer asks).
- Found during A21: A22, `dist/835.index.js` is emitted by ncc but never committed (see `CLAUDE.md` section 3).
- A22 (2026-10-29): `dist/` is no longer gitignored; `dist/835.index.js` (the `apache-arrow` chunk `index.js` requires) and `dist/licenses.txt` are committed; CI fails on any changed, new or deleted file in `dist/` (`git status --porcelain`, checked locally: the old `git diff --quiet` passed with both files missing, the new check listed them) and uploads all of `dist/`. `dist/index.js` is unchanged, so runtime behaviour is the same.
- Core v0.2.1 (2026-10-29, core C19: built with go1.26.10, which fixes 10 reachable standard-library vulnerabilities in the go1.25.14 v0.2.0 binary): README, `examples/*.yml` and the `binary-version` description now use `0.2.1`; the Action pin stays `@v0.2.0` until an Action `v0.2.1` exists. Ran in `budgetgate-action-test` PR #6 with the Action at `aaba24a` and `binary-version: 0.2.1`: counter v2 (run 40851643805) downloaded core v0.2.1, matched `SHA256SUMS`, restored the cached baseline `budgetgate-baseline-86a4a71…`, CPU 291,573 → 449,005, posted comment `6493278410`, failed as a regression; counter v1 (run 40851712042) updated the same comment and passed.
- `v0.2.1` released 2026-10-29 (maintainer's request): `package.json` bumped in #36, `main` CI green on `913b060`, exact tag `v0.2.1` on `913b060` with a GitHub release. Before tagging, test repo PR #6 merged (push run 40852597200 with the Action at `aaba24a` and core v0.2.1: cache saved, `history.json` 4 → 5). Test repo PR #7 ran `@v0.2.1` (run 40853059748): resolved to `913b060`, downloaded core v0.2.1, matched `SHA256SUMS`, restored the cache saved by that push, "No regression", comment posted. README and examples pin `@v0.2.1`.
- A23 (2026-10-29, open PR): `binary-version` picks the runner's core binary on Linux, macOS and Windows (x64, arm64), reads `SHA256SUMS` first so an older core release fails with a clear message, and skips `chmod` on Windows; 50 tests. It needs a core release built by core C20's workflow before it can run for real.
- Next up: A23 needs a core release with all six binaries (only when the maintainer asks), then a test-repo run on macOS and Windows runners, then an Action release.

## Blocked on core

Nothing left — core delivered all three, so no part of this repo's work order waits on another repository.
- [x] Real measurement merged to `main` (core #9 and #8, verified on testnet 2026-10-26)
- [x] Exit code 2 for errors (core C4, core #15)
- [x] A release containing `budget-core-linux-amd64` (core C12: `v0.2.0` tagged on `61a7a09`, published 2026-10-27 with `SHA256SUMS`; the Action's `binary-version: 0.2.0` downloaded and ran it in the test repo on 2026-10-28)

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
- [x] A19: move `ci.yml`'s `actions/*` pins to current majors (all three are `node20` at `@v4`)
- [x] A20: `SECURITY.md` points to GitHub private vulnerability reporting instead of `security@budgetgate.io`, whose domain does not exist (found 2026-10-28)
- [x] A21: runtime dependencies without known vulnerabilities (`npm audit --omit=dev` 0), staying on CommonJS majors
- [x] A22: commit every file ncc writes to `dist/`, and make CI's dist check and artifact cover the whole directory

## Phase 2: Baseline persistence and PR comment

- [x] A5: restore the cached baseline before comparing (Actions cache, as decided in the workspace `roadmap.md`); typed `@actions/cache` import
- [x] A9: find and update the existing Budget Gate comment by a hidden HTML marker instead of posting a new one
- [x] A14: after a core error the comment says the latest run failed

## Phase 3: Correct regression signal (core C4 done in core #15)

- [x] A8: decide "regression" from core's exit code only (1 = regression, 2 = error → `core.setFailed` with the error, no regression comment); drop the stdout text match and its test

## Phase 4: Usable by others (needs core C12)

- [x] A1: README example and inputs table match `action.yml`; no hand-made snapshots
- [x] A2: a default that obtains a working core binary; examples that run as written
- [x] Run the Action against a real PR in a test repository and record the result (`budgetgate-action-test` PRs #1–#3, 2026-10-28: regression, comment update, failed-run create and replace, cache restore, clean pass)
- [x] A3: release `v0.2.0` (exact tag, no moving `v0`), after a real-workflow run and only when the maintainer asks

## Maintainer actions (Claude must not do these)

- [x] Branch protection on `main` (set by the maintainer 2026-10-29, read back through the API): the `build-and-test` check is required, branches need not be up to date, 0 reviews (single maintainer), no force-push or deletion.
- [x] Repo topics and description (set by the maintainer 2026-10-29, read back through the API): `soroban`, `stellar`, `smart-contracts`, `github-actions`, `ci`, `typescript`; the description says early-stage and unaudited.
- [x] Enable private vulnerability reporting (Settings → Security). `SECURITY.md` points to it (A20); enabled by the maintainer 2026-10-28 (API: `enabled: true`).
- [x] Delete branches `docs/claude-md-and-roadmap` and `feature/complete-missing-specs` (deleted in the 2026-10-28 cleanup; `main` is the only branch).
