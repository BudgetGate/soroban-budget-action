import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { run, COMMENT_MARKER, BASELINE_CACHE_PATH, BASELINE_CACHE_PREFIX } from '../src/index';

jest.mock('@actions/cache');
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('@actions/exec');
jest.mock('@actions/tool-cache');

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

  it('fails without a regression comment when core cannot compare', async () => {
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
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('treats any other exit code as a failure, not a regression', async () => {
    mockGetInput.mockReturnValue('default');
    mockExec.mockResolvedValue(127);

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'false');
    expect(mockSetFailed).toHaveBeenCalledWith('soroban-budget-core failed with exit code 127: no error output');
    expect(mockCreateComment).not.toHaveBeenCalled();
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

  it('does not comment when core fails, even if a report comment exists', async () => {
    mockGetInput.mockReturnValue('default');
    mockPaginate.mockResolvedValue([{ id: 42, body: `${COMMENT_MARKER}
old report` }]);
    mockExec.mockResolvedValue(2);

    await run();

    expect(mockPaginate).not.toHaveBeenCalled();
    expect(mockUpdateComment).not.toHaveBeenCalled();
    expect(mockCreateComment).not.toHaveBeenCalled();
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
  it('downloads binary via tool-cache when binary-version is provided', async () => {
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

    mockDownloadTool.mockResolvedValue('/tmp/downloaded');
    mockCacheFile.mockResolvedValue('/tmp/cached');
    
    mockExec.mockResolvedValue(0);

    await run();

    expect(mockDownloadTool).toHaveBeenCalledWith('https://github.com/BudgetGate/soroban-budget-core/releases/download/v1.2.3/budget-core-linux-amd64');
    expect(mockCacheFile).toHaveBeenCalledWith('/tmp/downloaded', 'budget-core', 'soroban-budget-core', '1.2.3');
    // The binary path is built with path.join, so it uses the runner's separator.
    const cachedBinary = path.join('/tmp/cached', 'budget-core');
    expect(mockExec).toHaveBeenCalledWith('chmod', ['+x', cachedBinary]);
    expect(mockExec).toHaveBeenCalledWith(
      cachedBinary,
      ['--baseline', 'base.json', '--fixture', 'fixture.json', '--rpc-url', 'https://rpc.example', '--output-json', 'new.json'],
      expect.any(Object)
    );
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

    it('restores the cached baseline for the PR base commit when there is no file', async () => {
      mockGetInput.mockImplementation(inputs());
      mockRestoreCache.mockResolvedValue(`${BASELINE_CACHE_PREFIX}basesha`);
      mockExec.mockResolvedValue(0);

      await run();

      expect(mockRestoreCache).toHaveBeenCalledWith([BASELINE_CACHE_PATH], `${BASELINE_CACHE_PREFIX}basesha`, [BASELINE_CACHE_PREFIX]);
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

        expect(mockSaveCache).toHaveBeenCalledWith([BASELINE_CACHE_PATH], `${BASELINE_CACHE_PREFIX}headsha`);
        expect(fs.readFileSync(BASELINE_CACHE_PATH, 'utf8')).toContain('"name":"f"');
      });

      it('restores using the previous commit of the push', async () => {
        push('refs/heads/trunk');
        mockGetInput.mockImplementation(inputs());
        mockExec.mockResolvedValue(0);

        await run();

        expect(mockRestoreCache).toHaveBeenCalledWith([BASELINE_CACHE_PATH], `${BASELINE_CACHE_PREFIX}prevsha`, [BASELINE_CACHE_PREFIX]);
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
