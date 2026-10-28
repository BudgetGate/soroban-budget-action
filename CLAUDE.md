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
| `src/index.ts` | Reads inputs; if `binary-version` is set and `binary-path` is not, fails unless `os.platform()`/`os.arch()` are `linux`/`x64` (core releases only ship `CORE_ASSET`, `budget-core-linux-amd64`), downloads it and `SHA256SUMS` from core release `v<version>` with `@actions/tool-cache`, checks the binary with `verifyChecksum` (fails on a missing entry or a mismatch, before caching or running it), then caches it; otherwise uses `binary-path` or `./budget-core`. Runs core with `--fixture` (+ `--rpc-url`, `--output-json new.json --commit-sha <context.sha>`) or `--new`. Decides from core's exit code only: 0 pass, 1 regression (fails the step), anything else is an error (fails the step with core's stderr, `regression_detected=false`, no cache save, and in a PR the report comment is replaced by `failedRunComment`: "The latest run failed", core's exit code and a link to the workflow run, without core's stderr since it can contain the RPC URL; a failure to post that comment is a warning). Keeps one report comment per PR: lists the PR's comments (`octokit.paginate`, 100 per page), updates the one containing `COMMENT_MARKER` (`<!-- budgetgate-report -->`, first line of the body), or creates it (`upsertReportComment`), for both the report and the failed-run note. Baseline (`resolveBaseline`): a file at `baseline-path` if it exists; else `cache.restoreCache([BASELINE_CACHE_PATH], 'budgetgate-baseline-<PR base sha or push before-sha>', ['budgetgate-baseline-'])` into `.budgetgate/baseline.json`; else an empty schema-2.0 baseline there, with a warning and a "No baseline found" note at the top of the PR comment. On a push to the default branch (`payload.repository.default_branch`, else `main`/`master`), after exit 0 or 1, copies the compared snapshot (`new.json`, or `new-path`) to `.budgetgate/baseline.json` and saves it with key `budgetgate-baseline-<sha>`. Then, if `history-branch` is set (dashboard D5), `appendToHistory` adds that snapshot to `HISTORY_FILE` (`history.json`, `{"snapshots": [...]}`, oldest first, last `HISTORY_LIMIT` = 200 kept) on that branch through the GitHub API: a missing branch is created by `git.createTree` + `git.createCommit` (no parents) + `git.createRef`; an existing file is updated with `repos.createOrUpdateFileContents` and its blob sha; a file without a `snapshots` array is not overwritten. Cache and history errors are warnings, never failures. |
| `action.yml` | `runs.using: node24` (A11: GitHub removed Node 20 from runners on 2026-09-23; runners had been forcing `node20` actions onto Node 24 with a warning since 2026-06-16). Inputs: `github-token` (optional, default `${{ github.token }}`), `baseline-path` (default `baseline.json`), `new-path`, `fixture-path`, `rpc-url`, `binary-path`, `binary-version`, `history-branch` (off when empty; needs `contents: write`). Output: `regression_detected`. |
| Tests | `__tests__/index.test.ts`, Jest 30 + `ts-jest`, 38 tests (history: branch created with no parent, append with the file sha, the 200 limit, file created on an existing branch, `--commit-sha` passed, warn-only on a non-history file or API error, untouched when the input is empty, on another branch or after a core error; `binary-version`: download, checksum match, mismatch, missing entry, non-Linux and non-x64 runners; `verifyChecksum` case and other entries; comment create vs update; failed-run note created, replacing an earlier report, not posted outside a PR, and a comment-API failure only warning; baseline from file, cache hit, cache miss, cache failure; save on default-branch push after exit 0 and 1, not after an error or on other branches). Each test runs in its own temp directory. Mocks `@actions/cache`, `@actions/core`, `@actions/github`, `@actions/exec`, `@actions/tool-cache`, and `os.platform`/`os.arch` (the rest of `os` is real). Exit codes 0, 1, 2 and 127 each have a test; report text alone never counts as a regression. |
| `dist/` | Committed on purpose. Matched a fresh `ncc` build of `src/` on 2026-10-26. |
| `lib/` | `tsc` output (`tsconfig.json` `outDir`); not used by the build (`ncc`) or tests (`ts-jest`), and gitignored. |
| `examples/` | `rust-project.yml`, `monorepo.yml`. Both pin `@v0.2.0`, set `fixture-path` and `binary-version: '0.2.0'`, and grant `pull-requests: write`. |
| `.github/workflows/ci.yml` | `Action CI`, job `build-and-test` (`actions/checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, all `node24`): Node 24 (the Action's runtime), `npm ci`, `npm run build`, then fails if the build changed `dist/` (`git diff --quiet -- dist`), then `npm test`. Runs on push/PR to `main` only. `dist/` is in `.gitignore` with only `dist/index.js` force-tracked, so the check covers that file, not new output files. |
| Other | `CONTRIBUTING.md` (local setup, the `dist/` rule, change rules), `SECURITY.md` (reporting address `security@budgetgate.io`, not checked to be deliverable; states the project is unaudited). User docs are on the docs site, linked from the README. |
| Dependencies | `@actions/cache ^5.3.0` (keep below 6: 6.x is ESM-only, cannot be `require`d from this CommonJS build, and ncc then bundles a "Cannot find module" stub; 6.2.0 did exactly that until A5), `@actions/core ^1.10.1`, `@actions/exec ^1.1.1`, `@actions/github ^5.1.1`, `@actions/tool-cache ^2.0.1` |
| Dev dependencies | `@vercel/ncc ^0.44.1`, `jest ^30.4.2`, `ts-jest ^29.4.12`, `typescript ^5.5.4`, `esbuild`, `@types/jest`, `@types/node ^26.1.2` |

## 3. Known defects

Checked 2026-10-26 against `origin/main` (`c03f4c2`).

| ID | Defect | Evidence |
|----|--------|----------|

## 4. Work order for this repo

Core's real measurement has landed (core #9, #8; verified on testnet), so the Action can be run against real numbers today by building core from source and passing `binary-path` (the docs site's setup page does this). Core exits 0 pass / 1 regression / 2 error (core #15), and the Action uses that (A8 fixed). Core v0.2.0 is released; `binary-version: 0.2.0` downloads and checks it.

1. Done 2026-10-28: run end to end in `BudgetGate/budgetgate-action-test` (push run and PRs #1–#3, recorded in #25 and #26), and A3: release `v0.2.0`, an exact tag (no moving `v0`).
2. Next releases: a new exact tag (`v0.2.1`, `v0.3.0`, …) only when the maintainer asks, after `main` CI is green; bump `package.json` to match first. Never move or force-push a tag.

`roadmap.md` tracks progress against this list.

## 5. Commands

```
npm ci
npm test            # jest
npm run build       # ncc build, writes dist/
```
After any change under `src/`, run the build and commit the updated `dist/` in the same PR. A stale `dist/` means runners execute old code. Run on 2026-10-27 (Windows) after A5: `npm test` 21 of 21 pass (tests mock `@actions/cache` and run in a temp directory each), and `dist/` was rebuilt from `src/` and committed. `dist/` is in `.gitignore`, so a plain `git add dist/index.js` warns and exits 1 (git 2.43 on Linux still stages the file; an earlier note from a Windows machine said it aborted the whole `git add`). Stage it with `git add -f dist/index.js`, which exits 0 everywhere. Since `@actions/cache` 5.x is bundled, an ncc build on Windows orders modules differently from the Linux build CI does (same size, ~14,600 lines differ), so a Windows-built `dist/` fails the dist check. When that happens, CI uploads its own build as the `dist` artifact: `gh run download <run-id> -n dist -D dist` and commit that file. Tests that check paths build the expected value with `path.join`, so they pass on any OS.

## 6. Rules

### Action behavior
- Read inputs and write outputs through `@actions/core`. Fail with `core.setFailed`.
- Never log the token or any secret.
- Decide "regression" from core's exit code (0 pass, 1 regression, anything else an error), never by parsing the Markdown report. On an error, fail with core's stderr and replace the PR comment with a "latest run failed" note that links the run; never post core's stderr in the comment (it can contain the RPC URL).
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
