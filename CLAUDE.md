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
| `src/index.ts` | Reads inputs; if `binary-version` is set and `binary-path` is not, downloads `budget-core-linux-amd64` from core release `v<version>` with `@actions/tool-cache`, otherwise uses `binary-path` or `./budget-core`. Runs core with `--fixture` (+ `--rpc-url`, `--output-json new.json`) or `--new`. Decides from core's exit code only: 0 pass, 1 regression (fails the step), anything else is an error (fails the step with core's stderr, `regression_detected=false`, no PR comment, no cache save). Keeps one report comment per PR: lists the PR's comments (`octokit.paginate`, 100 per page), updates the one containing `COMMENT_MARKER` (`<!-- budgetgate-report -->`, first line of the body), or creates it. On a core error it does not touch the comment. Baseline (`resolveBaseline`): a file at `baseline-path` if it exists; else `cache.restoreCache([BASELINE_CACHE_PATH], 'budgetgate-baseline-<PR base sha or push before-sha>', ['budgetgate-baseline-'])` into `.budgetgate/baseline.json`; else an empty schema-2.0 baseline there, with a warning and a "No baseline found" note at the top of the PR comment. On a push to the default branch (`payload.repository.default_branch`, else `main`/`master`), after exit 0 or 1, copies the compared snapshot (`new.json`, or `new-path`) to `.budgetgate/baseline.json` and saves it with key `budgetgate-baseline-<sha>`. Cache errors are warnings, never failures. |
| `action.yml` | `runs.using: node24` (A11: GitHub removed Node 20 from runners on 2026-09-23; runners had been forcing `node20` actions onto Node 24 with a warning since 2026-06-16). Inputs: `github-token` (optional, default `${{ github.token }}`), `baseline-path` (default `baseline.json`), `new-path`, `fixture-path`, `rpc-url`, `binary-path`, `binary-version`. Output: `regression_detected`. |
| Tests | `__tests__/index.test.ts`, Jest 30 + `ts-jest`, 21 tests (comment create vs update; baseline from file, cache hit, cache miss, cache failure; save on default-branch push after exit 0 and 1, not after an error or on other branches). Each test runs in its own temp directory. Mocks `@actions/cache`, `@actions/core`, `@actions/github`, `@actions/exec`, `@actions/tool-cache`. Exit codes 0, 1, 2 and 127 each have a test; report text alone never counts as a regression. |
| `dist/` | Committed on purpose. Matched a fresh `ncc` build of `src/` on 2026-10-26. |
| `lib/` | `tsc` output (`tsconfig.json` `outDir`); not used by the build (`ncc`) or tests (`ts-jest`), and gitignored. |
| `examples/` | `rust-project.yml`, `monorepo.yml`. Both use `@v1` and `fixture-path`, and set neither `binary-path` nor `binary-version`. |
| `.github/workflows/ci.yml` | `Action CI`, job `build-and-test`: Node 24 (the Action's runtime), `npm ci`, `npm run build`, then fails if the build changed `dist/` (`git diff --quiet -- dist`), then `npm test`. Runs on push/PR to `main` only. `dist/` is in `.gitignore` with only `dist/index.js` force-tracked, so the check covers that file, not new output files. |
| Other | `CONTRIBUTING.md` (local setup, the `dist/` rule, change rules), `SECURITY.md` (reporting address `security@budgetgate.io`, not checked to be deliverable; states the project is unaudited). User docs are on the docs site, linked from the README. |
| Dependencies | `@actions/cache ^5.3.0` (keep below 6: 6.x is ESM-only, cannot be `require`d from this CommonJS build, and ncc then bundles a "Cannot find module" stub; 6.2.0 did exactly that until A5), `@actions/core ^1.10.1`, `@actions/exec ^1.1.1`, `@actions/github ^5.1.1`, `@actions/tool-cache ^2.0.1` |
| Dev dependencies | `@vercel/ncc ^0.44.1`, `jest ^30.4.2`, `ts-jest ^29.4.12`, `typescript ^5.5.4`, `esbuild`, `@types/jest`, `@types/node ^26.1.2` |

## 3. Known defects

Checked 2026-10-26 against `origin/main` (`c03f4c2`).

| ID | Defect | Evidence |
|----|--------|----------|
| A1 | README example still has the user hand-generate `baseline.json`/`new.json` (`new-path`), and its inputs table omits `fixture-path`, `rpc-url` and `binary-version`. The code itself does support `fixture-path`. | `README.md`, `action.yml` |
| A2 | No usable core binary. `binary-version` downloads from a core release that does not exist (core C12); without it, `binary-path` defaults to `./budget-core`, which a user's repo does not have. The examples set neither, so they cannot run. | `src/index.ts`, `examples/*.yml` |
| A3 | README and `examples/*.yml` use `@v1`. Only tag is `v0.1.0`; no releases. | GitHub API |
| A14 | After a core error, the PR keeps the previous run's report comment (e.g. "Passing"), so the comment can show a stale result while the latest check failed. The failed step is visible in the checks list, not in the comment. Open question: update the existing comment with "latest run failed: …", or leave it. | `src/index.ts` (no comment on exit ≠ 0/1); local run against a fake GitHub API 2026-10-27 |
| A19 | This repo's own `ci.yml` pins `actions/checkout@v4`, `actions/setup-node@v4` and `actions/upload-artifact@v4`, which declare `node20`. The runner forces them onto Node 24 and warns on every run: "Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4". Current majors (2026-10-27): checkout v7, setup-node v7.1.0, upload-artifact v7.0.2. | CI log of PR #20 (job 122105764313); each action's `action.yml` at `v4` |

## 4. Work order for this repo

Core's real measurement has landed (core #9, #8; verified on testnet), so the Action can be run against real numbers today by building core from source and passing `binary-path` (the docs site's setup page does this). Core exits 0 pass / 1 regression / 2 error (core #15), and the Action uses that (A8 fixed). Still blocked on core: a release binary (core C12) for A2/A3.

1. Not blocked: A19 (move `ci.yml`'s action pins to current majors).
2. A14: decide with the maintainer how the comment shows a failed run.
3. A1, A2, A3: README and examples that actually run, then a release when asked.

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
- Decide "regression" from core's exit code (0 pass, 1 regression, anything else an error), never by parsing the Markdown report. On an error, fail with core's stderr and post no regression comment.
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
