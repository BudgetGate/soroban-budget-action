# Soroban Budget Guard - GitHub Action

`soroban-budget-action` is a GitHub Action for the **BudgetGate** suite. It executes the `soroban-budget-core` engine directly in your CI/CD pipelines to track Soroban smart contract resource usage, prevent regressions, and automatically post detailed markdown reports as Pull Request comments.

## 🚀 Features

- **Automated Regression Prevention:** Fails your CI workflow if a resource regression is detected (e.g. CPU instructions jump significantly).
- **PR Comments:** Automatically comments on Pull Requests with a beautifully formatted Markdown table detailing resource usage differences.
- **Frictionless Setup:** Integrates seamlessly into standard GitHub Action workflows.

## 📦 Usage

To use this action in your repository, add it to your workflow file (e.g., `.github/workflows/budget.yml`). 

### Example Workflow

```yaml
name: Soroban Resource Budget Guard
on:
  pull_request:
    branches: [ main ]

jobs:
  budget-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
      
      # (Optional) Generate your baseline.json and new.json here using Soroban CLI

      - name: Run Budget Action
        uses: BudgetGate/soroban-budget-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          baseline-path: 'path/to/baseline.json'
          new-path: 'path/to/new.json'
          # binary-path: './budget-core' # Optional: path to a pre-compiled binary
```

## 📥 Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | The GitHub token used to authenticate and post PR comments. | **Yes** | `${{ github.token }}` |
| `baseline-path` | The file path to the baseline snapshot JSON. | No | `baseline.json` |
| `new-path` | The file path to the new/current snapshot JSON. | No | `new.json` |
| `binary-path` | The path to the `budget-core` binary to execute. | No | `./budget-core` |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `regression_detected` | Returns `"true"` if a regression was found, or `"false"` if resources are stable. |

## 🛠️ Development

This action is written in TypeScript and packaged using `@vercel/ncc`.

### Install Dependencies
```bash
npm install
```

### Run Tests
```bash
npm test
```

### Build & Package
Before committing changes to the action, you must compile the TypeScript code into a single executable JavaScript file:
```bash
npm run build
```
This generates the `./dist/index.js` file which is executed by the GitHub Actions runner.