# Contributing to soroban-budget-action

## Local setup

1. Install Node.js 20 (CI and the Action's runtime, `runs.using: node20`, both use it).
2. Clone the repository and install the locked dependencies:
   ```bash
   npm ci
   ```
3. Check your environment:
   ```bash
   npm test          # Jest via ts-jest; no network, GitHub and core are mocked
   npm run build     # ncc bundles src/ into dist/index.js
   ```

The Action runs `soroban-budget-core`, which lives in its own repository. To try the Action against real measurements, follow the [setup page](https://budgetgate.github.io/docs/action/setup), which builds core from source.

## `dist/` must match `src/`

`action.yml` runs the committed `dist/index.js`, not `src/`. After any change under `src/`:

1. Run `npm run build`.
2. Commit `dist/index.js` in the same PR. `dist` is in `.gitignore`, so stage it with `git add -f dist/index.js` (a plain `git add` prints a warning and exits 1).

CI rebuilds `dist/` and fails if it differs from the committed file. A build made on Windows can differ from CI's Linux build. When the check fails, the run uploads its own build as the `dist` artifact: download it with `gh run download <run-id> -n dist -D dist` and commit that file.

## Rules for changes

- **Measurement belongs in core.** This repo runs the core binary and reports its result. Do not reimplement diffing, thresholds or RPC calls here.
- **Regression comes from core's exit code:** `0` pass, `1` regression, `2` error. Do not parse the Markdown report to decide.
- **Inputs and outputs** go through `@actions/core`; fail the step with `core.setFailed`. Never log the token.
- **One PR comment.** The Action updates the comment carrying the hidden marker `<!-- budgetgate-report -->` instead of posting a new one.
- **Tests** mock `@actions/exec`, `@actions/cache`, `@actions/tool-cache` and the GitHub client. No live network in tests. Build expected paths with `path.join` so tests pass on any OS.
- **Strict TypeScript.** No `any` without a comment saying why.
- **Dependencies:** check whether an existing `@actions/*` package already does the job before adding one, and say why in the PR.

## Submitting a PR

- Base your branch on `main`.
- Link the issue it resolves (`Closes #<n>`), and keep the change to that issue.
- Say in the PR what you ran and what you saw.
- If you change inputs, outputs or the PR comment, update `action.yml` and the README together, and open a matching PR in [BudgetGate/docs](https://github.com/BudgetGate/docs). Link the two.
