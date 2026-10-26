# soroban-budget-action roadmap

Progress tracker for this repo. The defect IDs (A1, A2, …) and their evidence are in `CLAUDE.md` section 3; the order comes from `CLAUDE.md` section 4. Tick a box only when the change is merged to `main`.

Last updated: 2026-10-26

## Where I left off

- No work has started in this repo yet. `main` is at `ec034b6`, with tests passing and `dist/` in sync with `src/`.
- Most of this repo is blocked on `soroban-budget-core`. The items marked "not blocked" can be done anytime.

## Blocked on core

The Action can't be tested end to end until core has:
- [ ] Real measurement merged to `main` (core PR #9 and #8)
- [ ] Exit code 2 for errors (core C4)
- [ ] A release containing `budget-core-linux-amd64` (core C12)

## Phase 1: Repo accuracy (not blocked)

- [ ] A4: `package.json` license `MIT` and a real description
- [ ] A6: remove the unused `lib/index.js`
- [ ] A7: README example uses `actions/checkout@v4`; resolve `github-token` being both required and defaulted
- [ ] A10: CI step that rebuilds `dist/` and fails if it differs from the committed copy
- [ ] A11: check whether `runs.using: node20` is still supported; move to the current runtime if not

## Phase 2: Baseline persistence and PR comment

- [ ] A5: restore the cached baseline before comparing (Actions cache, as decided in the workspace `roadmap.md`); typed `@actions/cache` import
- [ ] A9: find and update the existing Budget Gate comment by a hidden HTML marker instead of posting a new one

## Phase 3: Correct regression signal (needs core C4)

- [ ] A8: decide "regression" from core's exit code only (1 = regression, 2 = error → `core.setFailed` with the error, no regression comment); drop the stdout text match and its test

## Phase 4: Usable by others (needs core C12)

- [ ] A1: README example and inputs table match `action.yml`; no hand-made snapshots
- [ ] A2: a default that obtains a working core binary; examples that run as written
- [ ] Run the Action against a real PR in a test repository and record the result
- [ ] A3: release and a `v1` tag (only when the maintainer asks)

## Maintainer actions (Claude must not do these)

- [ ] Branch protection on `main`: currently 0 required reviews and no required status checks. Consider requiring `Action CI / build-and-test`.
- [ ] Repo topics and description.
