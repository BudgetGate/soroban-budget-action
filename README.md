<p align="center"><img src=".github/avatar.png" width="120" alt="Budget Gate logo: a resource-cost gauge behind a gate bar"></p>

# soroban-budget-action

A GitHub Action that runs [soroban-budget-core](https://github.com/BudgetGate/soroban-budget-core) on your Soroban contract calls, comments the cost report on the pull request, and fails the check when a function's cost regresses.

**Documentation:** [budgetgate.github.io/docs/action](https://budgetgate.github.io/docs/action/).

> **Status:** early-stage. Not audited and not production-ready.

## Usage

You need a [fixture](https://budgetgate.github.io/docs/core/api-reference#fixture-format) in your repository: a JSON list of signed or `--build-only` transactions that call your deployed contract, for example `budget/fixture.json`.

```yaml
name: Budget Gate

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

permissions:
  contents: read
  pull-requests: write

jobs:
  budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: BudgetGate/soroban-budget-action@v0.2.1
        with:
          fixture-path: budget/fixture.json
          binary-version: 0.2.1
```

- **Core binary:** `binary-version` downloads the runner's binary from that core release (`budget-core-<os>-<arch>`, for example `budget-core-linux-amd64` or `budget-core-windows-arm64.exe`), checks it against the release's `SHA256SUMS`, and caches it. Core releases after v0.2.1 include Linux, macOS and Windows on x64 and arm64; v0.2.1 and earlier only include Linux x64, so on other runners those versions fail with a message saying so. On any other runner, build core yourself and pass `binary-path`.
- **Baseline:** run the workflow on pushes to the default branch as well as on pull requests. Each default-branch push saves the measured snapshot to the Actions cache, and pull requests compare against it. A file at `baseline-path` is used instead when it exists. With neither, every function is reported as new and the comment says no baseline was found.
- **History for the dashboard (optional):** set `history-branch: budgetgate-history` and grant `contents: write`. Each default-branch push then appends its snapshot to `history.json` on that branch, creating the branch (with no shared history) on the first run and keeping the last 200 snapshots. Point the [dashboard](https://budgetgate-dashboard.vercel.app/) at `https://raw.githubusercontent.com/<owner>/<repo>/budgetgate-history/history.json`. Public repositories only: the dashboard reads the file without a token. A failure to write the history is a warning, not a failed step.
- **PR comment:** one comment per pull request, updated on every run. When core cannot compare (for example, the RPC is down), the comment says the latest run failed and links the workflow run. Commenting needs `pull-requests: write`.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | No | `${{ github.token }}` | Token used to post the PR comment. |
| `fixture-path` | No | — | Fixture to simulate with `simulateTransaction`. The measured snapshot becomes the comparison. |
| `rpc-url` | No | core's default (testnet) | Soroban RPC endpoint, used with `fixture-path`. If it contains an API key, pass it from a secret. |
| `new-path` | No | `new.json` | An existing snapshot to compare, used when `fixture-path` is not set. |
| `baseline-path` | No | `baseline.json` | Baseline snapshot file. When it does not exist, the cached baseline is used. |
| `binary-version` | No | — | Core release to download, for example `0.2.1`. Linux, macOS and Windows runners on x64 or arm64 with core releases after v0.2.1; Linux x64 only with v0.2.1 and earlier. |
| `binary-path` | No | `./budget-core` | Path to a `budget-core` binary. Wins over `binary-version`. |
| `history-branch` | No | — (off) | Branch that keeps `history.json` for the dashboard, e.g. `budgetgate-history`. Needs `contents: write`. |

## Outputs

| Output | Description |
|--------|-------------|
| `regression_detected` | `"true"` when core exited `1` (a regression), otherwise `"false"`. Also `"false"` when core failed, so check the step's outcome too. |

## Examples

[`examples/`](examples/) has a single-contract workflow and a monorepo workflow that only runs when contract code changes.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). In short, with Node.js 24:

```bash
npm ci
npm test          # Jest; GitHub, core and the cache are mocked
npm run build     # bundles src/ into dist/index.js, which action.yml runs
```

Commit all of `dist/` with every change under `src/`; CI fails when any file in it differs from a fresh build.

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
