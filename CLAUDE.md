# CLAUDE.md — soroban-budget-action

Scope: this repo only. If the workspace-level `CLAUDE.md` exists in the parent folder, read it as well. Where the two differ, this file wins for this repo. The defect table below was checked against `origin/main` (`c03f4c2`) on 2026-10-26. Re-verify an item before relying on it.

## 1. What this repo is

The GitHub-specific layer of Budget Gate. A TypeScript GitHub Action, bundled with `@vercel/ncc`, that runs the `soroban-budget-core` binary, reads the result, and posts a Markdown comment on the pull request. It sets one output, `regression_detected`.

It is a wrapper. Measurement, diffing and thresholds belong in `soroban-budget-core`. Do not reimplement them here.

Boundaries:
- No dependency on `soroban-budget-dashboard`.
- Network access limited to the GitHub API and downloading the core binary.
- No SDK calls to Soroban RPC from this repo.

User docs live in the separate `BudgetGate/docs` site (budgetgate.github.io/docs/), which describes this repo as of `c03f4c2`, including the limitations in section 3. A PR here that changes inputs, outputs, the comment or failure behaviour needs a matching docs PR, linked from both descriptions.

## 2. Known layout

State of `main` (`c03f4c2`) on 2026-10-26. `package.json` name `soroban-budget-action`, version `1.0.0`.

| Item | Detail (read in full unless stated) |
|------|--------|
| Entry | `src/index.ts`, built with `npm run build` to `dist/index.js` (`ncc build src/index.ts -o dist --license licenses.txt`). `tsconfig.json` has `"strict": true`. |
| `src/index.ts` | Reads inputs; if `binary-version` is set and `binary-path` is not, downloads `budget-core-linux-amd64` from core release `v<version>` with `@actions/tool-cache`, otherwise uses `binary-path` or `./budget-core`. Runs core with `--fixture` (+ `--rpc-url`, `--output-json new.json`) or `--new`. Treats any non-zero exit **or** the text `❌ REGRESSION` in stdout as a regression. Posts a new PR comment every run. On `main`/`master` outside a PR, saves `new.json` with `@actions/cache` (key `budgetgate-baseline-<sha>`, loaded with `require`). |
| `action.yml` | `runs.using: node20`. Inputs: `github-token` (required, default `${{ github.token }}`), `baseline-path` (default `baseline.json`), `new-path`, `fixture-path`, `rpc-url`, `binary-path`, `binary-version`. Output: `regression_detected`. |
| Tests | `__tests__/index.test.ts`, Jest 30 + `ts-jest`, 6 tests. Mocks `@actions/core`, `@actions/github`, `@actions/exec`, `@actions/tool-cache`. One test asserts regression detection from output text. |
| `dist/` | Committed on purpose. Matched a fresh `ncc` build of `src/` on 2026-10-26. |
| `lib/index.js` | Committed (August), referenced by nothing (A6). |
| `examples/` | `rust-project.yml`, `monorepo.yml`. Both use `@v1` and `fixture-path`, and set neither `binary-path` nor `binary-version`. |
| `.github/workflows/ci.yml` | `Action CI`, job `build-and-test`: Node 20, `npm ci`, `npm run build`, `npm test`. Runs on push/PR to `main` only. |
| Other | `website/` (unexplained Vite app; its README is the unedited Vite template), `DOCUMENTATION.md`, `PR_BODY.md`, `pr_body_action.md` (A12), `CONTRIBUTING.md` (generic; says Go 1.21+, copied from core), `SECURITY.md` (reporting address `security@budgetgate.io`, not checked to be deliverable; states the project is unaudited). |
| Dependencies | `@actions/cache ^6.2.0`, `@actions/core ^1.10.1`, `@actions/exec ^1.1.1`, `@actions/github ^5.1.1`, `@actions/tool-cache ^2.0.1` |
| Dev dependencies | `@vercel/ncc ^0.44.1`, `jest ^30.4.2`, `ts-jest ^29.4.12`, `typescript ^5.5.4`, `esbuild`, `@types/jest`, `@types/node ^26.1.2` |

## 3. Known defects

Checked 2026-10-26 against `origin/main` (`c03f4c2`).

| ID | Defect | Evidence |
|----|--------|----------|
| A1 | README example still has the user hand-generate `baseline.json`/`new.json` (`new-path`), and its inputs table omits `fixture-path`, `rpc-url` and `binary-version`. The code itself does support `fixture-path`. | `README.md`, `action.yml` |
| A2 | No usable core binary. `binary-version` downloads from a core release that does not exist (core C12); without it, `binary-path` defaults to `./budget-core`, which a user's repo does not have. The examples set neither, so they cannot run. | `src/index.ts`, `examples/*.yml` |
| A3 | README and `examples/*.yml` use `@v1`. Only tag is `v0.1.0`; no releases. | GitHub API |
| A4 | `package.json` license `ISC` (repo LICENSE is MIT), empty description. | `package.json` |
| A5 | Baseline persistence half-built: `new.json` is saved to the Actions cache on `main`, but nothing restores it, so PRs still need `baseline.json` on disk. `@actions/cache` is loaded with an untyped `require`. Decision recorded in the workspace `roadmap.md` (Actions cache), never implemented end to end. | `src/index.ts`, no `restoreCache` |
| A6 | `lib/index.js` committed and unused (`action.yml` runs `dist/index.js`). | `git ls-tree`, grep |
| A7 | README example pins `actions/checkout@v3` (examples use `@v4`). `github-token` is `required: true` but has a default. | `README.md`, `action.yml` |
| A8 | Regression is decided by core's exit code **or** by finding `❌ REGRESSION` in stdout, against the rule in section 6. Any core error (exit 1 today) is reported as a regression, and the error text is posted as the PR comment. Fixing it properly needs core's exit code 2 (core C4). | `src/index.ts` `hasRegression`, test "detects regression from output text" |
| A9 | Posts a new PR comment on every run instead of updating one found by a hidden marker. | `src/index.ts` `createComment` |
| A10 | CI does not check that `dist/` matches `src/`. | `.github/workflows/ci.yml` |
| A11 | Unverified: `runs.using: node20` may be deprecated on GitHub-hosted runners. Check GitHub's current Node runtime support before the first release. | `action.yml` |
| A12 | `DOCUMENTATION.md` describes behaviour that does not exist: `SOROBAN_BUDGET_DEBUG` / `SOROBAN_RPC_TIMEOUT` env vars, 3 RPC retries, "missing baseline exits 0", updating the existing comment, falling back to the console when commenting fails, a summary/advice comment layout, memory in the diff. It duplicates the docs site. `PR_BODY.md` and `pr_body_action.md` are stale PR descriptions; `pr_body_action.md` claims PRs "consume the previously cached baseline", which nothing does (A5). | `DOCUMENTATION.md`, `pr_body_action.md`, `src/index.ts` |
| A13 | The test "downloads binary via tool-cache when binary-version is provided" fails on Windows: `src/index.ts` builds the cached path with `path.join` (backslashes on Windows) and the test expects `/tmp/cached/budget-core`. CI runs on Linux and passes. | `npm test` on Windows 2026-10-26: 5 pass, 1 fail; `Action CI` green on `c03f4c2` |

## 4. Work order for this repo

Core's real measurement has landed (core #9, #8; verified on testnet), so the Action can be run against real numbers today by building core from source and passing `binary-path` (the docs site's setup page does this). Still blocked on core: exit code 2 (core C4) for A8, and a release binary (core C12) for A2/A3.

1. Not blocked: A4, A6, A7, A10, A12, A13 (license, unused `lib/`, README accuracy, dist-sync check in CI, stale repo docs, Windows-safe test).
2. A5: implement baseline restore (Actions cache, as decided) and type the `@actions/cache` import.
3. A9: update one PR comment by hidden marker.
4. A8: decide regression from core's exit code only, once core has exit code 2.
5. A1, A2, A3: README and examples that actually run, then a release when asked.

`roadmap.md` tracks progress against this list.

## 5. Commands

```
npm ci
npm test            # jest
npm run build       # ncc build, writes dist/
```
After any change under `src/`, run the build and commit the updated `dist/` in the same PR. A stale `dist/` means runners execute old code. Run on `c03f4c2` on 2026-10-26 (Windows): `npm test` 5 of 6 pass (A13; all 6 pass in Linux CI), `npm run build` leaves `dist/` unchanged, so it is in sync with `src/`.

## 6. Rules

### Action behavior
- Read inputs and write outputs through `@actions/core`. Fail with `core.setFailed`.
- Never log the token or any secret.
- Decide "regression" from core's exit code, not by parsing the Markdown report. This needs core's exit code fix (C4 in that repo). Until then, say so in the report instead of parsing text.
- Update the existing Budget Gate PR comment instead of posting a new one per push. Find it with a hidden HTML marker.
- Tests mock `@actions/exec` and the GitHub client. No live network in tests.
- Keep the example workflow in the README runnable. If you change an input, change the example.

### TypeScript conventions
- `strict` TypeScript. No `any` without a comment explaining why.
- Add a dependency only after checking that an existing `@actions/*` package cannot do the job.

### Commit and PR conventions
These are the maintainer's rules and override default tool attribution.
- Never add "Co-Authored-By" lines to git commits.
- Do not include Claude attribution or footers in commit messages or pull request descriptions.
- Keep commit messages concise, starting with an imperative verb (e.g., "Fix bug", "Add feature").

### Git
- Never `git add .` or `git add -A`. Stage named files only.
- One logical unit per commit. Work on a branch, push after every commit, open a PR. No pushes to `main`, no force-push.
- Commit `dist/` only together with the `src/` change that produced it. Do not create tags or releases unless asked.
- Do not change repo settings or branch protection. Report what needs changing.

### Code style and behavior
- Write clean, idiomatic code matching the existing style of the repository.
- Avoid introducing speculative features or unused dependencies.
- Do not add conversational filler (e.g., "Sure, I can help with that!") inside code comments.
- Fix what was asked. List nearby problems in your report instead of fixing them in the same PR.

## 7. Done means

- [ ] `npm test` passes and `npm run build` was run, with `dist/` committed
- [ ] The Action was run against a real pull request in a test repository, or the report says it was not
- [ ] README inputs, outputs and example workflow match `action.yml`
- [ ] The report lists what you ran, what you saw, and what you did not verify

## 8. Keeping this file honest

When you fix a defect, delete its row in the same PR. When you find a new one, add a row with evidence. The workspace `CLAUDE.md` carries a copy of these rows. This file is authoritative for this repo. Update the workspace copy when you can.
