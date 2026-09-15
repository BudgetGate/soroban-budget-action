# Soroban Budget Action - Documentation

`soroban-budget-action` is a native GitHub Action that automatically catches resource consumption regressions (CPU & Memory) directly in your Soroban CI/CD pipelines. 

By integrating this action, you prevent expensive, unoptimized smart contracts from being merged into your `main` branch.

## How it Works
1.  **Binary Provisioning**: Automatically downloads and caches the specified `soroban-budget-core` release binary using `@actions/tool-cache`.
2.  **Execution**: Runs the budget core engine against your smart contract fixtures and baseline files.
3.  **PR Feedback**: Intercepts the markdown output from the core engine and automatically posts it as an insightful comment directly on your Pull Request.

## Caching Strategy
To ensure ultra-fast pipeline executions, `soroban-budget-action` relies heavily on caching:
- **Tool Cache (`@actions/tool-cache`)**: The downloaded `soroban-budget-core` binary is permanently cached on the GitHub runner based on its version. Future runs on the same runner will skip the download phase entirely.
- **Artifact Caching**: Temporary artifacts (such as JSON baseline differences) are temporarily cached per workflow run, allowing multiple jobs within the same workflow to share computed diffs without re-evaluation.

## Inputs

| Input | Required | Description |
|---|---|---|
| `github-token` | Yes | GITHUB_TOKEN to authenticate the PR commenting bot. |
| `baseline-path` | Yes | Path to the baseline snapshot JSON. |
| `fixture-path` | Yes* | Path to the test fixture to simulate. (*Or provide `new-path`). |
| `new-path` | Yes* | Path to the new snapshot JSON to compare. (*Or provide `fixture-path`). |
| `rpc-url` | No | Soroban RPC endpoint to hit during simulations. |
| `binary-version` | No | The specific GitHub release tag of `soroban-budget-core` to download. |

## Environment Variables
The action can be further configured using the following environment variables:
- `SOROBAN_BUDGET_DEBUG`: Set to `true` to enable verbose debug logging during the execution of the `soroban-budget-core` binary.
- `SOROBAN_RPC_TIMEOUT`: Overrides the default RPC timeout (in milliseconds). Default is `30000`.

## PR Comment Rendering
When the action detects a regression, it automatically constructs and posts a Pull Request comment. The comment is structured into three main sections:
1. **Summary**: A high-level overview (e.g., "⚠️ CPU Budget increased by 15%").
2. **Detailed Diff**: A markdown table comparing the `baseline` and the `new` resource usage (CPU Instructions, Memory Bytes).
3. **Actionable Advice**: Links to optimization guides or specific file lines if the action can deduce the regression source.

Subsequent runs on the same PR will update the *existing* comment rather than spamming the PR with new comments.

## Error Handling
The action is designed to fail gracefully:
- **Missing Baseline**: If the `baseline-path` cannot be found, the action will output a warning and exit with `0` (Success), assuming this is the first run.
- **RPC Failures**: If the Soroban RPC is unreachable, the action will retry 3 times before failing the step with a non-zero exit code.
- **Comment Posting Failures**: If the `github-token` lacks permissions to post comments, the action will print the markdown output to the console instead and continue without failing the step.
