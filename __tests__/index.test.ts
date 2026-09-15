import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import { run } from '../src/index';

jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('@actions/exec');

describe('soroban-budget-action', () => {
  let mockGetInput: jest.Mock;
  let mockSetFailed: jest.Mock;
  let mockSetOutput: jest.Mock;
  let mockExec: jest.Mock;
  let mockCreateComment: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetInput = core.getInput as jest.Mock;
    mockSetFailed = core.setFailed as jest.Mock;
    mockSetOutput = core.setOutput as jest.Mock;
    mockExec = exec.exec as jest.Mock;
    
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

  it('detects regression from output text and fails the action', async () => {
    mockGetInput.mockReturnValue('default');
    
    // Simulate exec writing regression string to stdout
    mockExec.mockImplementation(async (cmd, args, options) => {
      if (options && options.listeners && options.listeners.stdout) {
        options.listeners.stdout(Buffer.from('Something went wrong. ❌ REGRESSION found.'));
      }
      return 0;
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'true');
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('regression detected'));
  });

  it('detects regression from non-zero exit code and fails the action', async () => {
    mockGetInput.mockReturnValue('default');
    
    // Simulate exec exiting with 1
    mockExec.mockImplementation(async (cmd, args, options) => {
      return 1;
    });

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('regression_detected', 'true');
    expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('regression detected'));
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
});
