import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { run, verifyChecksum, coreAsset, COMMENT_MARKER, BASELINE_CACHE_PATH, BASELINE_CACHE_PREFIX, HISTORY_FILE, HISTORY_LIMIT } from '../src/index';

jest.mock('@actions/cache');
jest.mock('@actions/core');
// A factory, not an automock: automocking loads the real module, and @actions/github 8 pulls in ESM-only @octokit packages that Jest does not transform.
jest.mock('@actions/github', () => ({ __esModule: true, getOctokit: jest.fn(), context: {} }));
jest.mock('@actions/exec');
jest.mock('@actions/tool-cache');
// Only platform and arch are replaced, so tests can pick the runner the Action sees.
jest.mock('os', () => ({ ...jest.requireActual('os'), platform: jest.fn(), arch: jest.fn() }));

describe('soroban-budget-action', () => {
  let mockGetInput: jest.Mock;
  let mockSetFailed: jest.Mock;
  let mockSetOutput: jest.Mock;
  let mockExec: jest.Mock;
  let mockCreateComment: jest.Mock;
  let mockUpdateComment: jest.Mock;
  let mockListComments: jest.Mock;
  let mockPaginate: jest.Mock;
  let mockDownloadTool: jest.Mock;
  let mockCacheFile: jest.Mock;
  let mockRestoreCache: jest.Mock;
  let mockSaveCache: jest.Mock;
  let originalCwd: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Each test runs in its own empty directory: the Action reads and writes baseline files.
    originalCwd = process.cwd();
    process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'budgetgate-action-')));

    mockRestoreCache = cache.restoreCache as jest.Mock;
    mockSaveCache = cache.saveCache as jest.Mock;
    // No cached baseline unless a test says otherwise.
    mockRestoreCache.mockResolvedValue(undefined);
    mockSaveCache.mockResolvedValue(1);

    mockGetInput = core.getInput as jest.Mock;
    mockSetFailed = core.setFailed as jest.Mock;
    mockSetOutput = core.setOutput as jest.Mock;
    mockExec = exec.exec as jest.Mock;
    
    mockDownloadTool = tc.downloadTool as jest.Mock;
    mockCacheFile = tc.cacheFile as jest.Mock;
    
    mockCreateComment = jest.fn();
    mockUpdateComment = jest.fn();
    mockListComments = jest.fn();
    // No earlier comments unless a test says otherwise.
    mockPaginate = jest.fn().mockResolvedValue([]);
    (github.getOctokit as jest.Mock).mockReturnValue({
      paginate: mockPaginate,
      rest: {
        issues: {
          createComment: mockCreateComment,
          updateComment: mockUpdateComment,
          listComments: mockListComments,
        },
      },
    });

    Object.defineProperty(github, 'context', {
      value: {
        payload: {
          pull_request: {
            number: 123,
            base: { sha: 'basesha' },
          },
        },
        repo: {
          owner: 'test-owner',
          repo: 'test-repo',
        },
        sha: 'headsha',
        ref: 'refs/pull/123/merge',
        serverUrl: 'https://github.com',
        runId: 987,
      },
      writable: true,
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('runs the binary successfully and posts a comment with no regression', async () => {
    fs.writeFileSync('base.json', '{"schema_version":"2.0","functions":[]}');
    mockGetInput.mockImplementation((name: string) => {
      switch (name) {
        case 'github-token': return 'fake-token';
        case 'baseline-path': return 'base.json';
        case 'new-path': return 'new.json';
        case 'binary-path': return './budget-core';
        default: return '';
      }
    });

    // Simulate exec writing to stdout and exiting with 0
    mockExec.mockImplementation(async (cmd, args, options) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('All good, no regression.'));
      }
      return 0;
    });

    await run();

    expect(mockExec).toHaveBeenCalledWith(
      './budget-core',
      ['--baseline', 'base.json', '--new', 'new.json'],
      expect.any(Object)
    );
    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      issue_number: 123,
      body: expect.stringContaining('All good, no regression.'),
    });
    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'false');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('does not treat report text as a regression when core exits 0', async () => {
    mockGetInput.mockReturnValue('default');

    mockExec.mockImplementation(async (cmd, args, options) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('| f | CPUInstructions | 1000 | 1000 | 0 | 0.00% | n/a | ❌ REGRESSION |'));
      }
      return 0;
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'false');
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it('reports a regression when core exits 1 and comments on the PR', async () => {
    mockGetInput.mockReturnValue('default');

    mockExec.mockImplementation(async (cmd, args, options) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('| f | CPUInstructions | 1000 | 2000 | 1000 | 100.00% | 0.00% | ❌ REGRESSION |'));
      }
      return 1;
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'true');
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('regression detected'));
    expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('Regression%20Detected'),
    }));
  });

  it('fails with a failed-run comment, not a regression, when core cannot compare', async () => {
    mockGetInput.mockReturnValue('default');

    // Core exits 2 on usage and runtime errors, with the reason on stderr and nothing on stdout.
    mockExec.mockImplementation(async (cmd, args, options) => {
      if (options && options.listeners && options.listeners.stderr) {
        options.listeners.stderr(Buffer.from('Error opening baseline: open default: no such file or directory\n'));
      }
      return 2;
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'false');
    expect(mockSetFailed).toHaveBeenCalledWith(
      'soroban-budget-core failed with exit code 2: Error opening baseline: open default: no such file or directory'
    );
    expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 123,
      body: expect.stringContaining('**The latest run failed:** soroban-budget-core exited with code 2'),
    }));
    const body: string = mockCreateComment.mock.calls[0][0].body;
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain('[workflow run](https://github.com/test-owner/test-repo/actions/runs/987)');
    expect(body).not.toContain('Regression');
    // Core's stderr stays in the run log; it can include the RPC URL.
    expect(body).not.toContain('Error opening baseline');
  });

  it('treats any other exit code as a failure, not a regression', async () => {
    mockGetInput.mockReturnValue('default');
    mockExec.mockResolvedValue(127);

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'false');
    expect(mockSetFailed).toHaveBeenCalledWith('soroban-budget-core failed with exit code 127: no error output');
    expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('exited with code 127'),
    }));
  });

  it('creates the report comment with the hidden marker when the PR has none', async () => {
    mockGetInput.mockReturnValue('default');
    mockPaginate.mockResolvedValue([{ id: 7, body: 'Looks good to me' }]);
    mockExec.mockResolvedValue(0);

    await run();

    expect(mockPaginate).toHaveBeenCalledWith(mockListComments, {
      owner: 'test-owner', repo: 'test-repo', issue_number: 123, per_page: 100,
    });
    expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 123,
      body: expect.stringMatching(new RegExp('^' + COMMENT_MARKER)),
    }));
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it('updates the existing report comment instead of posting a new one', async () => {
    mockGetInput.mockReturnValue('default');
    mockPaginate.mockResolvedValue([
      { id: 7, body: 'Looks good to me' },
      { id: 42, body: `${COMMENT_MARKER}
### 📊 Soroban Resource Budget Report

old report` },
    ]);
    mockExec.mockImplementation(async (cmd, args, options) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('new report'));
      }
      return 0;
    });

    await run();

    expect(mockUpdateComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 42,
      body: expect.stringContaining('new report'),
    });
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('replaces an earlier report with the failed-run note when core fails', async () => {
    mockGetInput.mockReturnValue('default');
    mockPaginate.mockResolvedValue([{ id: 42, body: `${COMMENT_MARKER}
![BudgetGate Status](https://img.shields.io/badge/BudgetGate-Passing-success)
old report` }]);
    mockExec.mockResolvedValue(2);

    await run();

    expect(mockUpdateComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 42,
      body: expect.stringContaining('**The latest run failed:**'),
    });
    const body: string = mockUpdateComment.mock.calls[0][0].body;
    expect(body).not.toContain('old report');
    expect(body).not.toContain('Passing');
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('still fails with core\'s error when the failed-run comment cannot be posted', async () => {
    mockGetInput.mockReturnValue('default');
    mockPaginate.mockRejectedValue(new Error('Resource not accessible by integration'));
    mockExec.mockResolvedValue(2);

    await run();

    expect(mockSetFailed).toHaveBeenCalledTimes(1);
    expect(mockSetFailed).toHaveBeenCalledWith('soroban-budget-core failed with exit code 2: no error output');
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Could not update the PR comment'));
  });

  it('does not comment after a core failure outside a pull request', async () => {
    mockGetInput.mockReturnValue('default');
    Object.defineProperty(github, 'context', {
      value: { payload: {}, repo: { owner: 'test-owner', repo: 'test-repo' }, serverUrl: 'https://github.com', runId: 987 },
      writable: true,
    });
    mockExec.mockResolvedValue(2);

    await run();

    expect(mockPaginate).not.toHaveBeenCalled();
    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(mockSetFailed).toHaveBeenCalledWith('soroban-budget-core failed with exit code 2: no error output');
  });

  it('skips comment creation when not in a PR context', async () => {
    mockGetInput.mockReturnValue('default');
    
    // Remove PR context
    Object.defineProperty(github, 'context', {
      value: {
        payload: {},
        repo: { owner: 'test-owner', repo: 'test-repo' },
      },
      writable: true,
    });

    mockExec.mockResolvedValue(0);

    await run();

    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'false');
  });

  it('catches and reports thrown errors', async () => {
    const errorMsg = 'Failed to execute binary';
    mockGetInput.mockReturnValue('default');
    mockExec.mockRejectedValue(new Error(errorMsg));

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith(errorMsg);
  });
  describe('binary-version', () => {
    const RELEASE = 'https://github.com/BudgetGate/soroban-budget-core/releases/download/v1.2.3';
    const CORE_ASSET = 'budget-core-linux-amd64';
    const sha256 = (data: string) => crypto.createHash('sha256').update(data).digest('hex');

    beforeEach(() => {
      fs.writeFileSync('base.json', '{"schema_version":"2.0","functions":[]}');
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'github-token': return 'fake-token';
          case 'baseline-path': return 'base.json';
          case 'fixture-path': return 'fixture.json';
          case 'rpc-url': return 'https://rpc.example';
          case 'binary-version': return '1.2.3';
          default: return '';
        }
      });
      (os.platform as jest.Mock).mockReturnValue('linux');
      (os.arch as jest.Mock).mockReturnValue('x64');
      fs.writeFileSync('downloaded-binary', 'binary bytes');
      mockCacheFile.mockResolvedValue('/tmp/cached');
      mockExec.mockResolvedValue(0);
    });

    // downloadTool returns the binary first, then the checksum file with the given contents.
    const serveRelease = (sums: string) => {
      fs.writeFileSync('downloaded-sums', sums);
      mockDownloadTool.mockImplementation(async (url: string) =>
        url.endsWith('/SHA256SUMS') ? 'downloaded-sums' : 'downloaded-binary');
    };

    it('downloads the release binary, checks it against SHA256SUMS and runs it', async () => {
      serveRelease(`${sha256('binary bytes')}  ${CORE_ASSET}\n`);

      await run();

      expect(mockDownloadTool).toHaveBeenCalledWith(`${RELEASE}/budget-core-linux-amd64`);
      expect(mockDownloadTool).toHaveBeenCalledWith(`${RELEASE}/SHA256SUMS`);
      expect(mockCacheFile).toHaveBeenCalledWith('downloaded-binary', 'budget-core', 'soroban-budget-core', '1.2.3');
      // The binary path is built with path.join, so it uses the runner's separator.
      const cachedBinary = path.join('/tmp/cached', 'budget-core');
      expect(mockExec).toHaveBeenCalledWith('chmod', ['+x', cachedBinary]);
      expect(mockExec).toHaveBeenCalledWith(
        cachedBinary,
        ['--baseline', 'base.json', '--fixture', 'fixture.json', '--rpc-url', 'https://rpc.example', '--output-json', 'new.json', '--commit-sha', 'headsha'],
        expect.any(Object)
      );
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'the checksum differs', sums: `${'0'.repeat(64)}  ${CORE_ASSET}\n`, error: `Checksum mismatch for ${CORE_ASSET}` },
      { name: 'SHA256SUMS has no entry for the binary', sums: `${sha256('binary bytes')}  other-file\n`, error: `soroban-budget-core v1.2.3 has no ${CORE_ASSET}` },
    ])('fails without caching or running the binary when $name', async ({ sums, error }) => {
      serveRelease(sums);

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining(error));
      expect(mockCacheFile).not.toHaveBeenCalled();
      expect(mockExec).not.toHaveBeenCalled();
    });

    it.each([
      { platform: 'linux', arch: 'arm64', asset: 'budget-core-linux-arm64', binary: 'budget-core' },
      { platform: 'darwin', arch: 'x64', asset: 'budget-core-darwin-amd64', binary: 'budget-core' },
      { platform: 'darwin', arch: 'arm64', asset: 'budget-core-darwin-arm64', binary: 'budget-core' },
      { platform: 'win32', arch: 'x64', asset: 'budget-core-windows-amd64.exe', binary: 'budget-core.exe' },
      { platform: 'win32', arch: 'arm64', asset: 'budget-core-windows-arm64.exe', binary: 'budget-core.exe' },
    ])('downloads $asset on $platform/$arch', async ({ platform, arch, asset, binary }) => {
      (os.platform as jest.Mock).mockReturnValue(platform);
      (os.arch as jest.Mock).mockReturnValue(arch);
      serveRelease(`${sha256('other bytes')}  ${CORE_ASSET}\n${sha256('binary bytes')}  ${asset}\n`);

      await run();

      expect(mockDownloadTool).toHaveBeenCalledWith(`${RELEASE}/${asset}`);
      expect(mockCacheFile).toHaveBeenCalledWith('downloaded-binary', binary, 'soroban-budget-core', '1.2.3');
      const cachedBinary = path.join('/tmp/cached', binary);
      // Windows has no chmod and needs none.
      if (platform === 'win32') {
        expect(mockExec).not.toHaveBeenCalledWith('chmod', expect.anything());
      } else {
        expect(mockExec).toHaveBeenCalledWith('chmod', ['+x', cachedBinary]);
      }
      expect(mockExec).toHaveBeenCalledWith(cachedBinary, expect.any(Array), expect.any(Object));
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it('fails clearly on a release without the runner\'s binary', async () => {
      (os.platform as jest.Mock).mockReturnValue('darwin');
      (os.arch as jest.Mock).mockReturnValue('arm64');
      // Releases up to v0.2.1 list only the Linux x64 binary.
      serveRelease(`${sha256('binary bytes')}  ${CORE_ASSET}\n`);

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('soroban-budget-core v1.2.3 has no budget-core-darwin-arm64'));
      expect(mockDownloadTool).not.toHaveBeenCalledWith(`${RELEASE}/budget-core-darwin-arm64`);
      expect(mockCacheFile).not.toHaveBeenCalled();
      expect(mockExec).not.toHaveBeenCalled();
    });

    it.each([
      { platform: 'win32', arch: 'ia32' },
      { platform: 'freebsd', arch: 'x64' },
    ])('refuses to download on $platform/$arch', async ({ platform, arch }) => {
      (os.platform as jest.Mock).mockReturnValue(platform);
      (os.arch as jest.Mock).mockReturnValue(arch);

      await run();

      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining(`binary-version has no core binary for ${platform}/${arch}`));
      expect(mockDownloadTool).not.toHaveBeenCalled();
    });
  });

  describe('coreAsset', () => {
    it.each([
      ['linux', 'x64', 'budget-core-linux-amd64'],
      ['linux', 'arm64', 'budget-core-linux-arm64'],
      ['darwin', 'x64', 'budget-core-darwin-amd64'],
      ['darwin', 'arm64', 'budget-core-darwin-arm64'],
      ['win32', 'x64', 'budget-core-windows-amd64.exe'],
      ['win32', 'arm64', 'budget-core-windows-arm64.exe'],
    ])('names the binary for %s/%s', (platform, arch, asset) => {
      expect(coreAsset(platform, arch)).toBe(asset);
    });
  });

  describe('verifyChecksum', () => {
    it('accepts an uppercase checksum and ignores other entries', () => {
      fs.writeFileSync('f', 'abc');
      const sum = crypto.createHash('sha256').update('abc').digest('hex').toUpperCase();
      expect(() => verifyChecksum('f', `deadbeef  other\n${sum}  f\n`, 'f')).not.toThrow();
    });
  });

  describe('history', () => {
    const NEW_SNAPSHOT = { schema_version: '2.0', commit_sha: 'headsha', functions: [{ name: 'f' }] };
    const notFound = Object.assign(new Error('Not Found'), { status: 404 });
    let repos: Record<string, jest.Mock>;
    let git: Record<string, jest.Mock>;

    const push = (ref: string) => {
      Object.defineProperty(github, 'context', {
        value: {
          payload: { repository: { default_branch: 'main' }, before: 'prevsha' },
          repo: { owner: 'test-owner', repo: 'test-repo' },
          sha: 'headsha',
          ref,
        },
        writable: true,
      });
    };
    const inputs = (overrides: Record<string, string> = {}) => (name: string) =>
      ({ 'github-token': 'fake-token', 'fixture-path': 'fixture.json', 'binary-path': './budget-core', 'history-branch': 'budgetgate-history', ...overrides } as Record<string, string>)[name] ?? '';
    const existingHistory = (snapshots: unknown[]) => ({
      data: { type: 'file', sha: 'filesha', content: Buffer.from(JSON.stringify({ snapshots })).toString('base64') },
    });
    const writtenSnapshots = (): unknown[] => {
      const { content } = repos.createOrUpdateFileContents.mock.calls[0][0];
      return JSON.parse(Buffer.from(content, 'base64').toString('utf8')).snapshots;
    };

    beforeEach(() => {
      push('refs/heads/main');
      mockGetInput.mockImplementation(inputs());
      mockExec.mockImplementation(async () => {
        fs.writeFileSync('new.json', JSON.stringify(NEW_SNAPSHOT));
        return 0;
      });
      repos = {
        getBranch: jest.fn().mockResolvedValue({ data: {} }),
        getContent: jest.fn(),
        createOrUpdateFileContents: jest.fn().mockResolvedValue({ data: {} }),
      };
      git = {
        createTree: jest.fn().mockResolvedValue({ data: { sha: 'treesha' } }),
        createCommit: jest.fn().mockResolvedValue({ data: { sha: 'commitsha' } }),
        createRef: jest.fn().mockResolvedValue({ data: {} }),
      };
      (github.getOctokit as jest.Mock).mockReturnValue({ paginate: mockPaginate, rest: { repos, git, issues: {} } });
    });

    it('creates the history branch with no parent commit when it does not exist', async () => {
      repos.getBranch.mockRejectedValue(notFound);

      await run();

      const tree = git.createTree.mock.calls[0][0];
      expect(tree.tree).toEqual([expect.objectContaining({ path: HISTORY_FILE, mode: '100644', type: 'blob' })]);
      expect(JSON.parse(tree.tree[0].content)).toEqual({ snapshots: [NEW_SNAPSHOT] });
      expect(git.createCommit).toHaveBeenCalledWith(expect.objectContaining({ tree: 'treesha', parents: [], message: 'Add Budget Gate snapshot for headsha' }));
      expect(git.createRef).toHaveBeenCalledWith({ owner: 'test-owner', repo: 'test-repo', ref: 'refs/heads/budgetgate-history', sha: 'commitsha' });
      expect(repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });

    it('appends to the existing history and updates the file by its sha', async () => {
      repos.getContent.mockResolvedValue(existingHistory([{ commit_sha: 'a' }, { commit_sha: 'b' }]));

      await run();

      expect(repos.getContent).toHaveBeenCalledWith({ owner: 'test-owner', repo: 'test-repo', path: HISTORY_FILE, ref: 'budgetgate-history' });
      expect(repos.createOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({ path: HISTORY_FILE, branch: 'budgetgate-history', sha: 'filesha' }));
      expect(writtenSnapshots()).toEqual([{ commit_sha: 'a' }, { commit_sha: 'b' }, NEW_SNAPSHOT]);
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it(`keeps only the last ${HISTORY_LIMIT} snapshots`, async () => {
      const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => ({ commit_sha: `c${i}` }));
      repos.getContent.mockResolvedValue(existingHistory(full));

      await run();

      const written = writtenSnapshots();
      expect(written).toHaveLength(HISTORY_LIMIT);
      expect(written[0]).toEqual({ commit_sha: 'c1' });
      expect(written[HISTORY_LIMIT - 1]).toEqual(NEW_SNAPSHOT);
    });

    it('creates the file on an existing branch without one', async () => {
      repos.getContent.mockRejectedValue(notFound);

      await run();

      expect(repos.createOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({ sha: undefined }));
      expect(writtenSnapshots()).toEqual([NEW_SNAPSHOT]);
    });

    it('records the pushed commit in the snapshot core writes', async () => {
      repos.getContent.mockRejectedValue(notFound);

      await run();

      expect(mockExec).toHaveBeenCalledWith('./budget-core', expect.arrayContaining(['--commit-sha', 'headsha']), expect.any(Object));
    });

    it.each([
      { name: 'the file is not a history', setup: () => repos.getContent.mockResolvedValue({ data: { type: 'file', sha: 's', content: Buffer.from('{"other":1}').toString('base64') } }), warning: 'has no "snapshots" array' },
      { name: 'the GitHub API fails', setup: () => repos.getBranch.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 500 })), warning: 'Server Error' },
    ])('only warns, without writing, when $name', async ({ setup, warning }) => {
      setup();

      await run();

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining(warning));
      expect(repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'history-branch is not set', act: () => mockGetInput.mockImplementation(inputs({ 'history-branch': '' })) },
      { name: 'the push is to another branch', act: () => push('refs/heads/feature') },
      { name: 'core fails', act: () => mockExec.mockResolvedValue(2) },
    ])('does not touch the history when $name', async ({ act }) => {
      act();

      await run();

      expect(repos.getBranch).not.toHaveBeenCalled();
      expect(git.createRef).not.toHaveBeenCalled();
      expect(repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });
  });

  describe('baseline', () => {
    const EMPTY = '{"schema_version":"2.0","functions":[]}';
    const baselineArg = () => {
      const call = mockExec.mock.calls.find((c) => Array.isArray(c[1]) && c[1][0] === '--baseline');
      return call ? call[1][1] : undefined;
    };
    const inputs = (overrides: Record<string, string> = {}) => (name: string) =>
      ({ 'github-token': 'fake-token', 'baseline-path': 'baseline.json', 'fixture-path': 'fixture.json', 'binary-path': './budget-core', ...overrides } as Record<string, string>)[name] ?? '';

    it('uses the baseline file when it exists, without touching the cache', async () => {
      fs.writeFileSync('baseline.json', EMPTY);
      mockGetInput.mockImplementation(inputs());
      mockExec.mockResolvedValue(0);

      await run();

      expect(baselineArg()).toBe('baseline.json');
      expect(mockRestoreCache).not.toHaveBeenCalled();
    });

    it('caches the baseline at a path with forward slashes, so Linux and Windows runners share it', () => {
      expect(BASELINE_CACHE_PATH).toBe('.budgetgate/baseline.json');
    });

    it('restores the cached baseline for the PR base commit when there is no file', async () => {
      mockGetInput.mockImplementation(inputs());
      mockRestoreCache.mockResolvedValue(`${BASELINE_CACHE_PREFIX}basesha`);
      mockExec.mockResolvedValue(0);

      await run();

      expect(mockRestoreCache).toHaveBeenCalledWith([BASELINE_CACHE_PATH], `${BASELINE_CACHE_PREFIX}basesha`, [BASELINE_CACHE_PREFIX], undefined, true);
      expect(baselineArg()).toBe(BASELINE_CACHE_PATH);
      expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({ body: expect.not.stringContaining('No baseline found') }));
    });

    it('falls back to an empty baseline with a visible note when nothing is cached', async () => {
      mockGetInput.mockImplementation(inputs());
      mockExec.mockResolvedValue(0);

      await run();

      expect(baselineArg()).toBe(BASELINE_CACHE_PATH);
      expect(fs.readFileSync(BASELINE_CACHE_PATH, 'utf8').trim()).toBe(EMPTY);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('no cached baseline'));
      expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('No baseline found') }));
    });

    it('falls back to an empty baseline when the cache service fails', async () => {
      mockGetInput.mockImplementation(inputs());
      mockRestoreCache.mockRejectedValue(new Error('cache service unavailable'));
      mockExec.mockResolvedValue(0);

      await run();

      expect(baselineArg()).toBe(BASELINE_CACHE_PATH);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('cache service unavailable'));
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    describe('on a push', () => {
      const push = (ref: string) => {
        Object.defineProperty(github, 'context', {
          value: {
            payload: { repository: { default_branch: 'trunk' }, before: 'prevsha' },
            repo: { owner: 'test-owner', repo: 'test-repo' },
            sha: 'headsha',
            ref,
          },
          writable: true,
        });
      };

      it.each([
        ['no regression', 0],
        ['a regression (merged code is the new reference)', 1],
      ])('saves the new snapshot to the default branch cache after %s', async (_label, exitCode) => {
        push('refs/heads/trunk');
        mockGetInput.mockImplementation(inputs());
        mockExec.mockImplementation(async () => {
          fs.writeFileSync('new.json', '{"schema_version":"2.0","functions":[{"name":"f"}]}');
          return exitCode;
        });

        await run();

        expect(mockSaveCache).toHaveBeenCalledWith([BASELINE_CACHE_PATH], `${BASELINE_CACHE_PREFIX}headsha`, undefined, true);
        expect(fs.readFileSync(BASELINE_CACHE_PATH, 'utf8')).toContain('"name":"f"');
      });

      it('restores using the previous commit of the push', async () => {
        push('refs/heads/trunk');
        mockGetInput.mockImplementation(inputs());
        mockExec.mockResolvedValue(0);

        await run();

        expect(mockRestoreCache).toHaveBeenCalledWith([BASELINE_CACHE_PATH], `${BASELINE_CACHE_PREFIX}prevsha`, [BASELINE_CACHE_PREFIX], undefined, true);
      });

      it('does not save on another branch', async () => {
        push('refs/heads/feature');
        mockGetInput.mockImplementation(inputs());
        mockExec.mockResolvedValue(0);

        await run();

        expect(mockSaveCache).not.toHaveBeenCalled();
      });

      it('does not save when core fails', async () => {
        push('refs/heads/trunk');
        mockGetInput.mockImplementation(inputs());
        mockExec.mockResolvedValue(2);

        await run();

        expect(mockSaveCache).not.toHaveBeenCalled();
      });

      it('only warns when saving fails', async () => {
        push('refs/heads/trunk');
        mockGetInput.mockImplementation(inputs());
        mockSaveCache.mockRejectedValue(new Error('reserve failed'));
        mockExec.mockImplementation(async () => {
          fs.writeFileSync('new.json', EMPTY);
          return 0;
        });

        await run();

        expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('reserve failed'));
        expect(mockSetFailed).not.toHaveBeenCalled();
      });
    });
  });
});
