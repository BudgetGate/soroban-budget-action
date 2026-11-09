<p align="center"><img src=".github/avatar.png" width="120" alt="Budget Gate logo: a resource-cost gauge behind a gate bar"></p>

# soroban-budget-action

<p align="center">
  <a href="https://github.com/BudgetGate/soroban-budget-action/actions/workflows/ci.yml"><img src="https://github.com/BudgetGate/soroban-budget-action/actions/workflows/ci.yml/badge.svg" alt="Action CI"></a>
  <a href="https://github.com/BudgetGate/soroban-budget-action/releases/latest"><img src="https://img.shields.io/github/v/release/BudgetGate/soroban-budget-action" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/BudgetGate/soroban-budget-action" alt="License: MIT"></a>
</p>

<p align="center"><a href="https://budgetgate.github.io/docs/">Docs</a> · <a href="https://budgetgate.github.io/docs/#see-it-run">Demo (75 s)</a> · <a href="https://budgetgate-dashboard.vercel.app/">Dashboard</a> · <a href="https://github.com/BudgetGate/soroban-budget-core/discussions">Discussions</a></p>

**Budget Gate fails a pull request when a Soroban contract function gets more expensive.** It measures each function through a Soroban RPC, testnet in the examples, so there is no local network to set up, and it keeps the history. Soroban enforces resource limits when a transaction executes, so a change that passes every test can still make a call cost more, or push it past a network limit.

A GitHub Action that runs [soroban-budget-core](https://github.com/BudgetGate/soroban-budget-core) on your Soroban contract calls, comments the cost report on the pull request, and fails the check when a function's cost regresses.

**Documentation:** [budgetgate.github.io/docs/action](https://budgetgate.github.io/docs/action/).

> **Status:** early-stage. Not audited and not production-ready.

## Usage

You need a [fixture](https://budgetgate.github.io/docs/core/api-reference#fixture-format): a JSON list of signed or `--build-only` transactions that call a deployed contract, for example `budget/fixture.json`.

**A fixture measures whatever contract it calls.** If it calls a contract you deployed once, a pull request that changes the contract's code is measured on the old deployment and shows no change. To measure each commit's own code, build and deploy it in the workflow first and write the fixture against that deployment: see [Measure each commit's contract code](#measure-each-commits-contract-code). The workflow below suits a committed fixture.

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

      - uses: BudgetGate/soroban-budget-action@v0.2.2
        with:
          fixture-path: budget/fixture.json
          binary-version: 0.2.5
```

- **Core binary:** `binary-version` downloads the runner's binary from that core release (`budget-core-<os>-<arch>`, for example `budget-core-linux-amd64` or `budget-core-windows-arm64.exe`), checks it against the release's `SHA256SUMS`, and caches it. Core releases after v0.2.1 include Linux, macOS and Windows on x64 and arm64; v0.2.1 and earlier only include Linux x64, so on other runners those versions fail with a message saying so. On any other runner, build core yourself and pass `binary-path`.
- **Baseline:** run the workflow on pushes to the default branch as well as on pull requests. Each default-branch push saves the measured snapshot to the Actions cache, and pull requests compare against it. A file at `baseline-path` is used instead when it exists. On a pull request, a committed baseline file is read from the base commit, since the pull request could edit it: a change to it is noted in the comment and applies once merged, and a baseline the pull request adds is not used. A file written by an earlier step (not committed) is used as it is. With neither, every function is reported as new and the comment says no baseline was found. When nothing was cached for the base commit (for example, GitHub evicted the entry), the newest cached baseline is used and the comment says which commit it is from.
- **History for the dashboard (optional):** set `history-branch: budgetgate-history` and grant `contents: write`. Each default-branch push then appends its snapshot to `history.json` on that branch, creating the branch (with no shared history) on the first run and keeping the last 200 snapshots. Point the [dashboard](https://budgetgate-dashboard.vercel.app/) at `https://raw.githubusercontent.com/<owner>/<repo>/budgetgate-history/history.json`. Public repositories only: the dashboard reads the file without a token. A failure to write the history is a warning, not a failed step.
- **Measure each commit's contract code:**<a id="measure-each-commits-contract-code"></a> copy [`examples/build-fixture.sh`](examples/build-fixture.sh) to `budget/build-fixture.sh`, set `CONTRACTS` (each contract's name, wasm and constructor arguments) and `CALLS` (a unique reported name, the contract, the function and its arguments) in it, pin your Rust toolchain in `rust-toolchain.toml` (`targets = ["wasm32v1-none"]`), and use [`examples/measure-contract-code.yml`](examples/measure-contract-code.yml). Each run builds the contracts, deploys them to testnet in order with a throwaway friendbot-funded key, or with a funded account from an optional `BUDGET_GATE_SECRET_KEY` repository secret so runs do not depend on friendbot (only pushes get the secret, since a pull request's run executes the pull request's own build code; no secrets needed otherwise; `{ADDRESS}` is that key's address and `{<name>}` the ID of a contract deployed earlier, or the address of an extra funded account listed in `ACCOUNTS`, for calls that need authorization from an account other than the source), writes the fixture against those deployments, then runs Budget Gate, so a change to the code shows up in the report. Pinning the toolchain matters: a different Rust version compiles different wasm and changes the measured cost slightly. The workflow caches crates and compiled dependencies on `rust-toolchain.toml` and `Cargo.lock`; the contracts themselves are rebuilt every run and compile to the same wasm as an uncached build. The CLI install, build and deploy add about a minute (54–65 s for three contracts in the test repo, most of it testnet deploys).
- **PR comment:** one comment per pull request, updated on every run. Only a comment written by the token's own identity is updated, so a comment someone else posts with the marker is left alone. When core cannot compare (for example, the RPC is down), the comment says the latest run failed and links the workflow run. Commenting needs `pull-requests: write`. Pull requests from forks get a read-only token: the comment cannot be posted there, which is a warning, not a failure. Every run also writes the report to the job summary.
- **Pull requests cannot replace the checker:** on a pull request, a core binary (`binary-path`, or the default `./budget-core`) or a `new-path` snapshot that is committed in the repository fails the run, since the pull request could change it. Use `binary-version`, or build core in an earlier step without committing it.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | No | `${{ github.token }}` | Token used to post the PR comment. |
| `fixture-path` | No | — | Fixture to simulate with `simulateTransaction`. The measured snapshot becomes the comparison. |
| `rpc-url` | No | core's default (testnet) | Soroban RPC endpoint, used with `fixture-path`. If it contains an API key, pass it from a secret. The value is masked in the log either way. |
| `new-path` | No | `new.json` | An existing snapshot to compare, used when `fixture-path` is not set. On a pull request it must not be committed. |
| `baseline-path` | No | `baseline.json` | Baseline snapshot file. When it does not exist, the cached baseline is used. On a pull request a committed file is read from the base commit. |
| `binary-version` | No | — | Core release to download, for example `0.2.5`. Linux, macOS and Windows runners on x64 or arm64 with core releases after v0.2.1; Linux x64 only with v0.2.1 and earlier. |
| `binary-path` | No | `./budget-core` | Path to a `budget-core` binary. Wins over `binary-version`. On a pull request it must not be committed. |
| `history-branch` | No | — (off) | Branch that keeps `history.json` for the dashboard, e.g. `budgetgate-history`. Needs `contents: write`. |

## Outputs

| Output | Description |
|--------|-------------|
| `regression_detected` | `"true"` when core exited `1` (a regression), otherwise `"false"`. Also `"false"` when core failed, so check the step's outcome too. |

## Examples

[`examples/`](examples/) has a workflow that builds, deploys and measures each commit's contract code (`measure-contract-code.yml` with `build-fixture.sh`), a single-contract workflow with a committed fixture, and a monorepo workflow that only runs when contract code changes.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). In short, with Node.js 24:

```bash
npm ci
npm test          # Jest; GitHub, core and the cache are mocked
npm run build     # bundles src/ into dist/index.js, which action.yml runs
```

Commit all of `dist/` with every change under `src/`; CI fails when any file in it differs from a fresh build.

## Community

Questions and ideas: [GitHub Discussions](https://github.com/BudgetGate/soroban-budget-core/discussions). Contributions are welcome; see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the [open issues](https://github.com/BudgetGate/soroban-budget-action/issues).

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
