import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Hidden marker that identifies the Budget Gate report comment on a PR.
export const COMMENT_MARKER = '<!-- budgetgate-report -->';

// The Actions cache matches entries by their file paths as well as their key, so the baseline is
// always saved and restored at this one path. It uses '/' on every OS (Node and core accept it on
// Windows) so a baseline saved on a Linux runner matches on Windows.
export const BASELINE_CACHE_PATH = '.budgetgate/baseline.json';
// Without this, @actions/cache marks entries made on Windows as Windows-only and Windows runners
// never restore entries saved elsewhere. It changes nothing on Linux and macOS.
const CROSS_OS_CACHE = true;
export const BASELINE_CACHE_PREFIX = 'budgetgate-baseline-';

// Core releases publish one binary per platform and a SHA256SUMS file covering them (core's
// release.yml). Releases up to v0.2.1 only include budget-core-linux-amd64.
const CORE_OS: Record<string, string> = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
const CORE_ARCH: Record<string, string> = { x64: 'amd64', arm64: 'arm64' };
const CORE_RELEASES = 'https://github.com/BudgetGate/soroban-budget-core/releases/download';

// coreAsset names the core release binary for a runner's os.platform() and os.arch().
export function coreAsset(platform: string, arch: string): string {
  const goos = CORE_OS[platform];
  const goarch = CORE_ARCH[arch];
  if (!goos || !goarch) {
    throw new Error(`binary-version has no core binary for ${platform}/${arch}: releases cover Linux, macOS and Windows on x64 and arm64. Build core and pass binary-path instead.`);
  }
  return `budget-core-${goos}-${goarch}${goos === 'windows' ? '.exe' : ''}`;
}

// verifyChecksum checks a downloaded file against its line in a SHA256SUMS file
// (`<sha256>  <name>` per line, as written by sha256sum).
export function verifyChecksum(filePath: string, sums: string, name: string): void {
  const line = sums.split('\n').map((l) => l.trim().split(/\s+/)).find((parts) => parts[1] === name);
  if (!line) {
    throw new Error(`SHA256SUMS has no entry for ${name}`);
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actual !== line[0].toLowerCase()) {
    throw new Error(`Checksum mismatch for ${name}: expected ${line[0]}, got ${actual}`);
  }
}

// A baseline with no functions: core then reports every function as new.
const EMPTY_BASELINE = '{"schema_version":"2.0","functions":[]}\n';

interface Baseline {
  path: string;
  // Shown at the top of the PR comment when the baseline is not a real one.
  note?: string;
}

// resolveBaseline picks the baseline to compare against: a file at baseline-path if it exists,
// else the snapshot cached from the base branch, else an empty baseline with a visible note.
async function resolveBaseline(baselinePath: string): Promise<Baseline> {
  if (fs.existsSync(baselinePath)) {
    core.info(`Using baseline file ${baselinePath}.`);
    return { path: baselinePath };
  }

  const pr = github.context.payload.pull_request;
  const baseSha: string = pr?.base?.sha ?? github.context.payload.before ?? '';
  try {
    const key = await cache.restoreCache([BASELINE_CACHE_PATH], `${BASELINE_CACHE_PREFIX}${baseSha}`, [BASELINE_CACHE_PREFIX], undefined, CROSS_OS_CACHE);
    if (key) {
      core.info(`Restored baseline from cache entry ${key}.`);
      return { path: BASELINE_CACHE_PATH };
    }
    core.warning(`No baseline file at ${baselinePath} and no cached baseline. Every function will show as new.`);
  } catch (e) {
    core.warning(`Could not restore the cached baseline: ${e}. Every function will show as new.`);
  }

  fs.mkdirSync(path.dirname(BASELINE_CACHE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_CACHE_PATH, EMPTY_BASELINE);
  return {
    path: BASELINE_CACHE_PATH,
    note: `> **No baseline found** (no \`${baselinePath}\` and nothing cached from the base branch), so every function is shown as 🆕 NEW. A baseline is saved when this workflow runs on the default branch.`,
  };
}

// saveBaseline caches the snapshot that was just compared as the baseline for this commit.
async function saveBaseline(snapshotPath: string): Promise<void> {
  try {
    if (path.resolve(snapshotPath) !== path.resolve(BASELINE_CACHE_PATH)) {
      fs.mkdirSync(path.dirname(BASELINE_CACHE_PATH), { recursive: true });
      fs.copyFileSync(snapshotPath, BASELINE_CACHE_PATH);
    }
    const key = `${BASELINE_CACHE_PREFIX}${github.context.sha}`;
    const cacheId = await cache.saveCache([BASELINE_CACHE_PATH], key, undefined, CROSS_OS_CACHE);
    core.info(`Saved baseline to cache entry ${key} (id ${cacheId}).`);
  } catch (e) {
    core.warning(`Failed to save baseline cache: ${e}`);
  }
}

// upsertReportComment keeps one report per PR: it updates the comment that carries the marker,
// or creates it.
async function upsertReportComment(token: string, body: string): Promise<void> {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    return;
  }
  const octokit = github.getOctokit(token);
  const issue = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: pr.number,
  };
  const comments = await octokit.paginate(octokit.rest.issues.listComments, { ...issue, per_page: 100 });
  // Typed by hand: ncc's TypeScript 5.9 build no longer infers paginate's element type.
  const existing = comments.find((c: { id: number; body?: string | null }) => c.body?.includes(COMMENT_MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ owner: issue.owner, repo: issue.repo, comment_id: existing.id, body });
    core.info(`Updated PR comment ${existing.id}.`);
  } else {
    await octokit.rest.issues.createComment({ ...issue, body });
    core.info('Posted PR comment.');
  }
}

// failedRunComment replaces the report after core could not compare, so the PR does not keep
// showing an earlier result. Core's error text stays in the run log: it can include the RPC URL.
export function failedRunComment(exitCode: number): string {
  const { serverUrl, repo, runId } = github.context;
  const runUrl = `${serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${runId}`;
  return `${COMMENT_MARKER}\n### 📊 Soroban Resource Budget Report\n\n![BudgetGate Status](https://img.shields.io/badge/BudgetGate-Run%20Failed-lightgrey)\n\n**The latest run failed:** soroban-budget-core exited with code ${exitCode} and did not produce a report. Any earlier report for this PR is out of date. See the [workflow run](${runUrl}) for the error.\n\n*Generated by BudgetGate*`;
}

// The history file the dashboard reads: {"snapshots": [...]} with the oldest snapshot first.
export const HISTORY_FILE = 'history.json';
// Older snapshots are dropped so the file stays small enough to fetch from a browser.
export const HISTORY_LIMIT = 200;

function isNotFound(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { status?: unknown }).status === 404;
}

// appendToHistory adds the snapshot to HISTORY_FILE on the history branch. A missing branch is
// created with no parent commit, so it shares no history with the code branches.
async function appendToHistory(token: string, branch: string, snapshotPath: string): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const snapshot: unknown = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const message = `Add Budget Gate snapshot for ${github.context.sha.substring(0, 7)}`;

  let branchExists = true;
  try {
    await octokit.rest.repos.getBranch({ owner, repo, branch });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    branchExists = false;
  }

  if (!branchExists) {
    const content = `${JSON.stringify({ snapshots: [snapshot] }, null, 2)}\n`;
    const tree = await octokit.rest.git.createTree({ owner, repo, tree: [{ path: HISTORY_FILE, mode: '100644', type: 'blob', content }] });
    const commit = await octokit.rest.git.createCommit({ owner, repo, message, tree: tree.data.sha, parents: [] });
    await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.data.sha });
    core.info(`Created branch ${branch} with ${HISTORY_FILE} (1 snapshot).`);
    return;
  }

  let snapshots: unknown[] = [];
  let fileSha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo, path: HISTORY_FILE, ref: branch });
    if (Array.isArray(existing.data) || existing.data.type !== 'file' || !('content' in existing.data)) {
      throw new Error(`${HISTORY_FILE} on ${branch} is not a file`);
    }
    const parsed: unknown = JSON.parse(Buffer.from(existing.data.content, 'base64').toString('utf8'));
    const list = typeof parsed === 'object' && parsed !== null ? (parsed as { snapshots?: unknown }).snapshots : undefined;
    if (!Array.isArray(list)) {
      throw new Error(`${HISTORY_FILE} on ${branch} has no "snapshots" array; not overwriting it`);
    }
    snapshots = list;
    fileSha = existing.data.sha;
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }

  snapshots = [...snapshots, snapshot].slice(-HISTORY_LIMIT);
  const content = Buffer.from(`${JSON.stringify({ snapshots }, null, 2)}\n`).toString('base64');
  await octokit.rest.repos.createOrUpdateFileContents({ owner, repo, path: HISTORY_FILE, branch, message, content, sha: fileSha });
  core.info(`Added the snapshot to ${HISTORY_FILE} on ${branch} (${snapshots.length} snapshots).`);
}

// isDefaultBranchPush is true for a push to the repository's default branch.
function isDefaultBranchPush(): boolean {
  const defaultBranch: string | undefined = github.context.payload.repository?.default_branch;
  if (defaultBranch) {
    return github.context.ref === `refs/heads/${defaultBranch}`;
  }
  return github.context.ref === 'refs/heads/main' || github.context.ref === 'refs/heads/master';
}

export async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token');
    const baselinePath = core.getInput('baseline-path') || 'baseline.json';
    const newPath = core.getInput('new-path');
    const fixturePath = core.getInput('fixture-path');
    const rpcUrl = core.getInput('rpc-url');
    let binaryPath = core.getInput('binary-path');
    const binaryVersion = core.getInput('binary-version');
    const historyBranch = core.getInput('history-branch');

    // Download binary if version is specified
    if (binaryVersion && !binaryPath) {
      const asset = coreAsset(os.platform(), os.arch());
      core.info(`Downloading soroban-budget-core v${binaryVersion} (${asset})...`);
      const release = `${CORE_RELEASES}/v${binaryVersion}`;
      // SHA256SUMS lists every binary in the release, so an older release without this platform's
      // binary fails here with a clear message instead of a 404.
      const sums = fs.readFileSync(await tc.downloadTool(`${release}/SHA256SUMS`), 'utf8');
      if (!sums.split('\n').some((line) => line.trim().split(/\s+/)[1] === asset)) {
        throw new Error(`soroban-budget-core v${binaryVersion} has no ${asset}: releases up to v0.2.1 only include budget-core-linux-amd64. Use a newer binary-version, a Linux x64 runner, or binary-path.`);
      }
      const downloadPath = await tc.downloadTool(`${release}/${asset}`);
      verifyChecksum(downloadPath, sums, asset);
      core.info(`Checksum of ${asset} matches the release's SHA256SUMS.`);

      const binaryName = asset.endsWith('.exe') ? 'budget-core.exe' : 'budget-core';
      const cachedPath = await tc.cacheFile(downloadPath, binaryName, 'soroban-budget-core', binaryVersion);
      binaryPath = path.join(cachedPath, binaryName);

      if (os.platform() !== 'win32') {
        await exec.exec('chmod', ['+x', binaryPath]);
      }
    } else if (!binaryPath) {
      binaryPath = './budget-core';
    }

    const baseline = await resolveBaseline(baselinePath);
    core.info(`Running Soroban Budget Guard Core against ${baseline.path}`);

    let output = '';
    let errorOutput = '';

    const options: exec.ExecOptions = {};
    options.listeners = {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        errorOutput += data.toString();
      }
    };

    options.ignoreReturnCode = true;

    // The snapshot core compares against the baseline; it becomes the next baseline on the default branch.
    let snapshotPath: string;
    const args = ['--baseline', baseline.path];
    if (fixturePath) {
      args.push('--fixture', fixturePath);
      if (rpcUrl) {
        args.push('--rpc-url', rpcUrl);
      }
      snapshotPath = 'new.json';
      // Recorded in the snapshot, so the history shows which commit each measurement is from.
      args.push('--output-json', snapshotPath, '--commit-sha', github.context.sha);
    } else {
      snapshotPath = newPath || 'new.json';
      args.push('--new', snapshotPath);
    }

    const exitCode = await exec.exec(binaryPath, args, options);

    // Core exits 0 when nothing regressed, 1 on a regression, and 2 when it could not compare
    // (bad input, RPC failure, ...). Only its exit code decides; the report text is not parsed.
    if (exitCode !== 0 && exitCode !== 1) {
      core.setOutput('regression_detected', 'false');
      const detail = errorOutput.trim() || 'no error output';
      core.setFailed(`soroban-budget-core failed with exit code ${exitCode}: ${detail}`);
      try {
        await upsertReportComment(token, failedRunComment(exitCode));
      } catch (e) {
        core.warning(`Could not update the PR comment: ${e}`);
      }
      return;
    }
    if (errorOutput.trim()) {
      core.info(errorOutput.trim());
    }

    const hasRegression = exitCode === 1;
    core.info(hasRegression ? 'Regression found. Generating PR comment...' : 'No regression. Generating PR comment...');

    // Post the markdown table to the PR
    if (github.context.payload.pull_request) {
      const badgeUrl = hasRegression
        ? 'https://img.shields.io/badge/BudgetGate-Regression%20Detected-red'
        : 'https://img.shields.io/badge/BudgetGate-Passing-success';

      const note = baseline.note ? `${baseline.note}\n\n` : '';
      await upsertReportComment(token, `${COMMENT_MARKER}\n### 📊 Soroban Resource Budget Report\n\n![BudgetGate Status](${badgeUrl})\n\n${note}${output}\n\n*Generated by BudgetGate*`);
    } else {
      core.info('Not running in a Pull Request context. Skipping comment generation.');
      // Merged code is the new reference, so the snapshot is saved even after a regression.
      if (isDefaultBranchPush()) {
        await saveBaseline(snapshotPath);
        if (historyBranch) {
          try {
            await appendToHistory(token, historyBranch, snapshotPath);
          } catch (e) {
            core.warning(`Could not add the snapshot to ${HISTORY_FILE} on ${historyBranch}: ${e}`);
          }
        }
      }
    }

    core.setOutput('regression_detected', hasRegression.toString());

    if (hasRegression) {
      core.setFailed('Resource cost regression detected! Check the PR comment for details.');
    }

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

if (require.main === module) {
  run();
}
