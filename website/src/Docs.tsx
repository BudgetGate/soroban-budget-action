function Docs() {
  return (
    <section className="ethereal-section" id="documentation">
      <h2 className="section-title">Comprehensive Documentation</h2>
      <div className="doc-content">
        <h3>Caching Strategy</h3>
        <p>To ensure ultra-fast pipeline executions, <code>soroban-budget-action</code> relies heavily on caching:</p>
        <ul>
          <li><strong>Tool Cache:</strong> The downloaded <code>soroban-budget-core</code> binary is permanently cached on the GitHub runner based on its version. Future runs on the same runner will skip the download phase entirely.</li>
          <li><strong>Artifact Caching:</strong> Temporary artifacts (such as JSON baseline differences) are temporarily cached per workflow run, allowing multiple jobs within the same workflow to share computed diffs without re-evaluation.</li>
        </ul>

        <h3>Inputs</h3>
        <div className="doc-table-wrapper">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Input</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>github-token</code></td>
                <td>Yes</td>
                <td>GITHUB_TOKEN to authenticate the PR commenting bot.</td>
              </tr>
              <tr>
                <td><code>baseline-path</code></td>
                <td>Yes</td>
                <td>Path to the baseline snapshot JSON.</td>
              </tr>
              <tr>
                <td><code>fixture-path</code></td>
                <td>Yes*</td>
                <td>Path to the test fixture to simulate. (*Or provide <code>new-path</code>).</td>
              </tr>
              <tr>
                <td><code>new-path</code></td>
                <td>Yes*</td>
                <td>Path to the new snapshot JSON to compare. (*Or provide <code>fixture-path</code>).</td>
              </tr>
              <tr>
                <td><code>rpc-url</code></td>
                <td>No</td>
                <td>Soroban RPC endpoint to hit during simulations.</td>
              </tr>
              <tr>
                <td><code>binary-version</code></td>
                <td>No</td>
                <td>The specific GitHub release tag of <code>soroban-budget-core</code> to download.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Environment Variables</h3>
        <p>The action can be further configured using the following environment variables:</p>
        <ul>
          <li><code>SOROBAN_BUDGET_DEBUG</code>: Set to <code>true</code> to enable verbose debug logging during the execution of the <code>soroban-budget-core</code> binary.</li>
          <li><code>SOROBAN_RPC_TIMEOUT</code>: Overrides the default RPC timeout (in milliseconds). Default is <code>30000</code>.</li>
        </ul>

        <h3>PR Comment Rendering</h3>
        <p>When the action detects a regression, it automatically constructs and posts a Pull Request comment. The comment is structured into three main sections:</p>
        <ol>
          <li><strong>Summary:</strong> A high-level overview (e.g., "⚠️ CPU Budget increased by 15%").</li>
          <li><strong>Detailed Diff:</strong> A markdown table comparing the <code>baseline</code> and the <code>new</code> resource usage (CPU Instructions, Memory Bytes).</li>
          <li><strong>Actionable Advice:</strong> Links to optimization guides or specific file lines if the action can deduce the regression source.</li>
        </ol>
        <p>Subsequent runs on the same PR will update the <em>existing</em> comment rather than spamming the PR with new comments.</p>

        <h3>Error Handling</h3>
        <p>The action is designed to fail gracefully:</p>
        <ul>
          <li><strong>Missing Baseline:</strong> If the <code>baseline-path</code> cannot be found, the action will output a warning and exit with <code>0</code> (Success), assuming this is the first run.</li>
          <li><strong>RPC Failures:</strong> If the Soroban RPC is unreachable, the action will retry 3 times before failing the step with a non-zero exit code.</li>
          <li><strong>Comment Posting Failures:</strong> If the <code>github-token</code> lacks permissions to post comments, the action will print the markdown output to the console instead and continue without failing the step.</li>
        </ul>
      </div>
    </section>
  );
}

export default Docs;
