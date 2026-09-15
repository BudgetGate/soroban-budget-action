import { Infinity as InfinityIcon, Wind, Feather, CheckCircle, Code } from 'lucide-react';

function Home() {
  return (
    <>
      <h1 className="ethereal-title">
        Protect Your <br/> <b>Soroban Budgets</b>
      </h1>
      <p className="ethereal-subtitle">
        A GitHub Action for Soroban smart contracts that automatically catches resource consumption regressions (CPU & Memory) directly in your CI/CD pipelines.
      </p>

      <div className="ethereal-floating-cards">
        <div className="ethereal-card">
          <Wind className="card-icon" size={32} />
          <h3 className="card-title">Airy Integration</h3>
          <p className="card-desc">
            Drops into your GitHub Actions workflow natively. Just add a step and let the action analyze your tests.
          </p>
        </div>
        
        <div className="ethereal-card">
          <Feather className="card-icon" size={32} />
          <h3 className="card-title">Featherweight Limits</h3>
          <p className="card-desc">
            Catch heavy computational regressions before they merge. Stay well within network limits automatically.
          </p>
        </div>

        <div className="ethereal-card">
          <InfinityIcon className="card-icon" size={32} />
          <h3 className="card-title">Infinite Clarity</h3>
          <p className="card-desc">
            Receive beautifully formatted, deeply insightful diff comments on your pull requests instantaneously.
          </p>
        </div>
      </div>

      <section className="ethereal-section">
        <h2 className="section-title">How It Works</h2>
        <div className="steps-container">
          <div className="step-item">
            <CheckCircle className="step-icon" size={24} />
            <div className="step-content">
              <h4>1. Run Tests</h4>
              <p>Executes your Soroban contract tests to collect the latest CPU and Memory budget consumption.</p>
            </div>
          </div>
          <div className="step-item">
            <CheckCircle className="step-icon" size={24} />
            <div className="step-content">
              <h4>2. Compare Baselines</h4>
              <p>Compares the new budget usage against the baseline from the main branch to detect regressions.</p>
            </div>
          </div>
          <div className="step-item">
            <CheckCircle className="step-icon" size={24} />
            <div className="step-content">
              <h4>3. PR Comments</h4>
              <p>Automatically posts a detailed comment on the Pull Request showing the exact budget diffs.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ethereal-section">
        <h2 className="section-title">Usage & Installation</h2>
        <p className="section-desc">Add this step to your <code>.github/workflows/ci.yml</code>.</p>
        <div className="code-block-wrapper">
          <Code className="code-icon" size={20} />
          <pre className="code-block">
            <code>{`- name: Check Soroban Budget Regressions\n  uses: BudgetGate/soroban-budget-action@v1\n  with:\n    github-token: \${{ secrets.GITHUB_TOKEN }}\n    baseline-path: './history/baseline.json'\n    fixture-path: './fixtures/swap_test.json'`}</code>
          </pre>
        </div>
      </section>
    </>
  );
}

export default Home;
