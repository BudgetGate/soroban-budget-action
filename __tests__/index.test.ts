import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import * as path from 'path';
import { run } from '../src/index';

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
  let mockDownloadTool: jest.Mock;
  let mockCacheFile: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetInput = core.getInput as jest.Mock;
    mockSetFailed = core.setFailed as jest.Mock;
    mockSetOutput = core.setOutput as jest.Mock;
    mockExec = exec.exec as jest.Mock;
    
    mockDownloadTool = tc.downloadTool as jest.Mock;
    mockCacheFile = tc.cacheFile as jest.Mock;
    
    mockCreateComment = jest.fn();
    (github.getOctokit as jest.Mock).mockReturnValue({
      rest: {
        issues: {
          createComment: mockCreateComment,
        },
      },
    });

    Object.defineProperty(github, 'context', {
      value: {
        payload: {
          pull_request: {
            number: 123,
          },
        },
        repo: {
          owner: 'test-owner',
          repo: 'test-repo',
        },
      },
      writable: true,
    });
  });

  it('runs the binary successfully and posts a comment with no regression', async () => {
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
});
