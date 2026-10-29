#!/usr/bin/env bash
# Deploys this commit's contract to testnet and writes a Budget Gate fixture for it, so each
# run measures the code being built rather than a contract deployed earlier.
#
# Uses a throwaway key funded by friendbot, so no secrets are needed. Needs the stellar CLI
# (stellar/stellar-cli action) and Rust with the wasm32v1-none target; pin the toolchain in
# rust-toolchain.toml so the baseline and every pull request compile the same wasm.
#
# Edit WASM, CONSTRUCTOR_ARGS and CALLS for your contract.
set -euo pipefail

# The built contract, as written by `stellar contract build`.
WASM=target/wasm32v1-none/release/my_contract.wasm
# {ADDRESS} below is replaced with the funded key's address once it exists.
# Arguments for the contract's constructor, if it has one, e.g. (--admin {ADDRESS}).
CONSTRUCTOR_ARGS=()
# One call per line: the function name, then its arguments as for `stellar contract invoke`.
# Arguments are split on spaces.
CALLS=(
  "increment"
  # "transfer --from {ADDRESS} --to {ADDRESS} --amount 10"
)
OUT=budget/fixture.json

network=testnet
key=budget-gate-run

# Testnet RPC calls sometimes time out; try each network step up to three times.
retry() {
  local attempt
  for attempt in 1 2 3; do
    "$@" && return 0
    echo "Attempt $attempt of '$1 $2 $3' failed." >&2
    [ "$attempt" -lt 3 ] && sleep 15
  done
  return 1
}

retry stellar keys generate "$key" --network "$network" --fund --overwrite
address="$(stellar keys address "$key")"
stellar contract build
constructor_args=("${CONSTRUCTOR_ARGS[@]//\{ADDRESS\}/$address}")
id="$(retry stellar contract deploy --wasm "$WASM" --source "$key" --network "$network" -- "${constructor_args[@]}")"
echo "Deployed this commit's contract: $id" >&2

# Fixture calls are simulated, not submitted, so they all see the storage the contract has right
# after deployment. To measure with state in place, submit setup calls here, for example:
# retry stellar contract invoke --id "$id" --source "$key" --network "$network" -- init --admin "$address"

entries=()
for call in "${CALLS[@]}"; do
  call="${call//\{ADDRESS\}/$address}"
  # shellcheck disable=SC2086 # the call is split into the function name and its arguments on purpose
  xdr="$(retry stellar contract invoke --id "$id" --source "$key" --network "$network" --build-only -- $call)"
  name="${call%% *}"
  entries+=("{\"name\":\"$name\",\"fixture_id\":\"$name\",\"xdr\":\"$xdr\"}")
done

mkdir -p "$(dirname "$OUT")"
( IFS=,; printf '[%s]\n' "${entries[*]}" ) > "$OUT"
echo "Wrote $OUT with ${#entries[@]} call(s)." >&2
