# CLAUDE.md — soroban-budget-action

Scope: this repo only. If the workspace-level `CLAUDE.md` exists in the parent folder, read it as well. Where the two differ, this file wins for this repo. The defect table below was checked against `origin/main` (`7efaa4b`) on 2026-10-29. Re-verify an item before relying on it.

## 1. What this repo is

The GitHub-specific layer of Budget Gate. A TypeScript GitHub Action, bundled with `@vercel/ncc`, that runs the `soroban-budget-core` binary, reads the result, and posts a Markdown comment on the pull request. It sets one output, `regression_detected`.

It is a wrapper. Measurement, diffing and thresholds belong in `soroban-budget-core`. Do not reimplement them here.

Boundaries:
- No dependency on `soroban-budget-dashboard`.
- Network access limited to the GitHub API and downloading the core binary.
- No SDK calls to Soroban RPC from this repo.

User docs live in the separate `BudgetGate/docs` site (budgetgate.github.io/docs/), which describes this repo as of `7efaa4b` (v0.2.1), including its limitations. A PR here that changes inputs, outputs, the comment or failure behaviour needs a matching docs PR, linked from both descriptions.

## 2. Known layout

Layout last checked in full against `main` `c03f4c2` on 2026-10-26; later PRs (through #37, `7efaa4b`, 2026-10-29) updated the rows they changed. `package.json` name `soroban-budget-action`, version `0.2.1` (was `1.0.0` on 2026-10-26; `0.2.0` for the v0.2.0 release).

| Item | Detail (read in full unless stated) |
|------|--------|
| Entry | `src/index.ts`, built with `npm run build` to `dist/index.js` (`ncc build src/index.ts -o dist --license licenses.txt`). `tsconfig.json` has `"strict": true`. |
| `src/index.ts` | Reads inputs; if `binary-version` is set and `binary-path` is not, `coreAsset(os.platform(), os.arch())` names the runner's core binary (`budget-core-<linux|darwin|windows>-<amd64|arm64>`, `.exe` on Windows; other runners fail, A23), then it downloads core release `v<version>`'s `SHA256SUMS` with `@actions/tool-cache` and fails clearly when it has no entry for that binary (releases up to v0.2.1 only ship Linux x64), downloads the binary, checks it with `verifyChecksum` (fails on a mismatch, before caching or running it), caches it as `budget-core` (`budget-core.exe` on Windows) and runs `chmod +x` except on Windows; otherwise uses `binary-path` or `./budget-core`. Runs core with `--fixture` (+ `--rpc-url`, `--output-json new.json --commit-sha <context.sha>`) or `--new`. Decides from core's exit code only: 0 pass, 1 regression (fails the step), anything else is an error (fails the step with core's stderr, `regression_detected=false`, no cache save, and in a PR the report comment is replaced by `failedRunComment`: "The latest run failed", core's exit code and a link to the workflow run, without core's stderr since it can contain the RPC URL; a failure to post that comment is a warning). Keeps one report comment per PR: lists the PR's comments (`octokit.paginate`, 100 per page), updates the one containing `COMMENT_MARKER` (`<!-- budgetgate-report -->`, first line of the body), or creates it (`upsertReportComment`), for both the report and the failed-run note. Baseline (`resolveBaseline`): a file at `baseline-path` if it exists; else `cache.restoreCache([BASELINE_CACHE_PATH], 'budgetgate-baseline-<PR base sha or push before-sha>', ['budgetgate-baseline-'])` into `.budgetgate/baseline.json`; else an empty schema-2.0 baseline there, with a warning and a "No baseline found" note at the top of the PR comment. On a push to the default branch (`payload.repository.default_branch`, else `main`/`master`), after exit 0 or 1, copies the compared snapshot (`new.json`, or `new-path`) to `.budgetgate/baseline.json` and saves it with key `budgetgate-baseline-<sha>`. Then, if `history-branch` is set (dashboard D5), `appendToHistory` adds that snapshot to `HISTORY_FILE` (`history.json`, `{"snapshots": [...]}`, oldest first, last `HISTORY_LIMIT` = 200 kept) on that branch through the GitHub API: a missing branch is created by `git.createTree` + `git.createCommit` (no parents) + `git.createRef`; an existing file is updated with `repos.createOrUpdateFileContents` and its blob sha; a file without a `snapshots` array is not overwritten. Cache and history errors are warnings, never failures. |
| `action.yml` | `runs.using: node24` (A11: GitHub removed Node 20 from runners on 2026-09-23; runners had been forcing `node20` actions onto Node 24 with a warning since 2026-06-16). Inputs: `github-token` (optional, default `${{ github.token }}`), `baseline-path` (default `baseline.json`), `new-path`, `fixture-path`, `rpc-url`, `binary-path`, `binary-version`, `history-branch` (off when empty; needs `contents: write`). Output: `regression_detected`. |
| Tests | `__tests__/index.test.ts`, Jest 30 + `ts-jest`, 51 tests (the cache path uses `/`; `coreAsset` for six runners; downloads on Linux arm64, macOS and Windows; an older release without the runner's binary; unsupported runners; history: branch created with no parent, append with the file sha, the 200 limit, file created on an existing branch, `--commit-sha` passed, warn-only on a non-history file or API error, untouched when the input is empty, on another branch or after a core error; `binary-version`: download, checksum match, mismatch, missing entry, non-Linux and non-x64 runners; `verifyChecksum` case and other entries; comment create vs update; failed-run note created, replacing an earlier report, not posted outside a PR, and a comment-API failure only warning; baseline from file, cache hit, cache miss, cache failure; save on default-branch push after exit 0 and 1, not after an error or on other branches). Each test runs in its own temp directory. Mocks `@actions/cache`, `@actions/core`, `@actions/github` (a factory with `__esModule`, `getOctokit` and `context`; see Dependencies), `@actions/exec`, `@actions/tool-cache`, and `os.platform`/`os.arch` (the rest of `os` is real). Exit codes 0, 1, 2 and 127 each have a test; report text alone never counts as a regression. |
| `dist/` | Committed on purpose, every file ncc writes (A22): `index.js`, the chunk `835.index.js` that `index.js` loads with `require` (`apache-arrow`, used by `@azure/storage-blob` inside `@actions/cache` for Arrow blob listings), and `licenses.txt` (licenses of the bundled packages). Not in `.gitignore`. Matched a fresh Linux `ncc` build of `src/` on 2026-10-29. |
| `lib/` | `tsc` output (`tsconfig.json` `outDir`); not used by the build (`ncc`) or tests (`ts-jest`), and gitignored. |
| `examples/` | `rust-project.yml`, `monorepo.yml`. Both pin `@v0.2.1`, set `fixture-path` and `binary-version: '0.2.1'` (core v0.2.1, built with go1.26.10, C19 in core), and grant `pull-requests: write`. |
| `.github/workflows/ci.yml` | `Action CI`, job `build-and-test` (`actions/checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, all `node24`): Node 24 (the Action's runtime), `npm ci`, `npm run build`, then fails if `git status --porcelain -- dist` prints anything (a changed, new or deleted file), uploading all of `dist/` as the `dist` artifact, then `npm test`. Runs on push/PR to `main` only. |
| Other | `CONTRIBUTING.md` (local setup, the `dist/` rule, change rules), `SECURITY.md` (reports through GitHub private vulnerability reporting, which the maintainer must enable in the repo settings; states the project is unaudited and not production-ready). User docs are on the docs site, linked from the README. |
| Dependencies | `@actions/cache ^5.3.0` (keep below 6: 6.x is ESM-only, cannot be `require`d from this CommonJS build, and ncc then bundles a "Cannot find module" stub; 6.2.0 did exactly that until A5), `@actions/core ^2.0.3`, `@actions/exec ^2.0.0`, `@actions/github ^8.0.1`, `@actions/tool-cache ^3.0.1` (A21: the last CommonJS majors; core 3, exec 3, tool-cache 4 and github 9 are `"type": "module"`, the same trap as cache 6). All share `@actions/http-client` 3 and `undici` 6; `npm audit --omit=dev` reported 0 on 2026-10-29. `@actions/github` 8 is CommonJS but loads ESM-only `@octokit/*` 7+; ncc bundles them, Jest does not transform them, so the test mocks `@actions/github` with a factory instead of automocking it. |
| Dev dependencies | `@vercel/ncc ^0.44.1`, `jest ^30.4.2`, `ts-jest ^29.4.12`, `typescript ^5.5.4`, `esbuild`, `@types/jest`, `@types/node ^26.1.2` |

## 3. Known defects

Checked 2026-10-29 against `origin/main` (`7efaa4b`): no open defects; `npm audit --omit=dev` 0.

| ID | Defect | Evidence |
|----|--------|----------|

Resolved and removed: A24 (found 2026-10-29 while running A23 on Windows): Windows runners never restored the cached baseline saved by a Linux default-branch run, so every function showed as new and no regression could be reported there. `@actions/cache` adds a `windows-only` part to the cache version on Windows unless `enableCrossOsArchive` is set, and `BASELINE_CACHE_PATH` came from `path.join` (a backslash on Windows; the version hashes the paths verbatim). Now `BASELINE_CACHE_PATH` is `.budgetgate/baseline.json` on every OS and restore and save pass `enableCrossOsArchive`; the flag changes nothing on Linux and macOS, so existing entries still match. Checked in `budgetgate-action-test` PR #8 (run 40875749663): all six runners, `windows-latest` and `windows-11-arm` included, restored `budgetgate-baseline-5fbacd3…`. A23 (found in the live walkthrough, 2026-10-29): `binary-version` refused every runner but Linux x64; since #40 it downloads the runner's binary on Linux, macOS and Windows (x64, arm64), and with core v0.2.2 (the first release with all six) it ran on all six runners in PR #8 (run 40875361973). Resolved and removed: A22 (found during A21, 2026-10-29): ncc wrote `dist/835.index.js` and `dist/licenses.txt`, but `.gitignore` ignored `dist` and only `dist/index.js` was force-tracked, so neither was ever committed (including in `v0.2.0`), and CI's `git diff --quiet -- dist` could not see them. The chunk only loads for Arrow blob listings, which `@actions/cache` 5.3.0 never requests, so no run hit it. `dist` is no longer ignored, both files are committed, and CI checks `dist/` with `git status --porcelain` and uploads all of it.

Resolved and removed: A21 (found in the workspace audit, 2026-10-29): `npm audit --omit=dev` reported 12 runtime issues bundled into `dist/` (2 high: `undici` 5 and `@fastify/busboy` through `@actions/http-client` 2; moderate: `@octokit/*` ReDoS through `@actions/github` 5, `uuid` through `@actions/core` 1 and `@actions/tool-cache` 2). Fixed by moving `@actions/core`, `exec`, `tool-cache` and `github` to their last CommonJS majors; 0 runtime issues.

Resolved and removed: A20 (found 2026-10-28): `SECURITY.md` sent reports to `security@budgetgate.io`, but `budgetgate.io` does not exist (NXDOMAIN on Google DNS), so reports could not arrive and whoever registered the domain would receive them. It now points to GitHub private vulnerability reporting (maintainer's decision); that was off on 2026-10-28 and has to be enabled in the repo settings.

## 4. Work order for this repo

Core's real measurement has landed (core #9, #8; verified on testnet), so the Action can be run against real numbers today by building core from source and passing `binary-path` (the docs site's setup page does this). Core exits 0 pass / 1 regression / 2 error (core #15), and the Action uses that (A8 fixed). Core v0.2.0 is released; `binary-version: 0.2.0` downloads and checks it.

1. Done 2026-10-28: run end to end in `BudgetGate/budgetgate-action-test` (push run and PRs #1–#3, recorded in #25 and #26), and A3: release `v0.2.0`, an exact tag (no moving `v0`).
2. `v0.2.1` (2026-10-29, maintainer's request): A21, A22 and core `0.2.1` in the examples; `package.json` bumped first, then an exact tag.
3. Next releases: a new exact tag (`v0.2.2`, `v0.3.0`, …) only when the maintainer asks, after `main` CI is green; bump `package.json` to match first. Never move or force-push a tag.

`roadmap.md` tracks progress against this list.

## 5. Commands

```
npm ci
npm test            # jest
npm run build       # ncc build, writes dist/
```
After any change under `src/`, run the build and commit the updated `dist/` in the same PR. A stale `dist/` means runners execute old code. Run on 2026-10-29 on `7efaa4b` (Linux, Node 22): `npm test` 38 of 38 pass (each test runs in its own temp directory); CI's dist check passed on the same commit. Stage it with `git add dist` (A22: `dist/` is no longer gitignored, and ncc writes more than `index.js`; a file the build stops writing must be deleted too). Since `@actions/cache` 5.x is bundled, an ncc build on Windows orders modules differently from the Linux build CI does (same size, ~14,600 lines differ), so a Windows-built `dist/` fails the dist check. When that happens, CI uploads its own build as the `dist` artifact: `gh run download <run-id> -n dist -D dist` and commit those files. Tests that check paths build the expected value with `path.join`, so they pass on any OS.

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
