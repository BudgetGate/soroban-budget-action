## 🚀 Background
The `SPEC.md` requires the GitHub action to autonomously download the latest compiled `soroban-budget-core` binary from GitHub Releases before executing it in the CI runner. It also requires the action to support passing fixture files down to the core engine.

## 🛠️ Problem
The MVP implementation of `index.ts` hardcoded the binary path to a local `./budget-core` executable, completely ignoring the GitHub release download requirement. Furthermore, it only passed `--new` paths to the binary, lacking support for the newly implemented `--fixture` logic in the core engine.

## ✨ Solution & Implementation
This PR completes the missing specification by integrating `@actions/tool-cache` and updating the argument forwarding logic.
- **Tool Cache Integration:** Added `@actions/tool-cache` dependency. If the `binary-version` input is provided, the action will now hit the GitHub Releases API, download the specified Linux AMD64 executable, cache it, and execute `chmod +x` on it.
- **Fixture Support:** Updated `action.yml` with `fixture-path` and `rpc-url` inputs.
- **CLI Forwarding:** The execution engine in `index.ts` now correctly forwards `--fixture` and `--rpc-url` to the underlying Go binary instead of defaulting to `--new`.

## 📋 Testing
- [x] Added rigorous Jest test blocks verifying the `@actions/tool-cache` logic.
- [x] Mocked the `downloadTool` and `cacheFile` methods to ensure the execution path successfully parses the release URL and applies executable permissions.
- [x] Recompiled the `@vercel/ncc` bundle (`dist/index.js`).
