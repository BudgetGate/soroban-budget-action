#!/usr/bin/env bash
# Deploys this commit's contracts to testnet and writes a Budget Gate fixture for them, so each
# run measures the code being built rather than contracts deployed earlier.
#
# Uses a throwaway key funded by friendbot, so no secrets are needed. Needs the stellar CLI
# (stellar/stellar-cli action) and Rust with the wasm32v1-none target; pin the toolchain in
# rust-toolchain.toml so the baseline and every pull request compile the same wasm.
#
# Edit CONTRACTS and CALLS for your contracts.
set -euo pipefail

# One contract per line: a name for it, its wasm as written by `stellar contract build`, then
# its constructor arguments, if it has a constructor. Contracts are deployed in this order, so a
# constructor can take the ID of a contract listed above it.
CONTRACTS=(
  "my_contract target/wasm32v1-none/release/my_contract.wasm"
  # "token target/wasm32v1-none/release/token.wasm --admin {ADDRESS} --decimal 7"
  # "pool target/wasm32v1-none/release/pool.wasm --token {token}"
)
# One call per line: the name it is reported under (unique; the baseline is matched by it), the
# contract's name from CONTRACTS, the function, then its arguments as for `stellar contract invoke`.
CALLS=(
  "increment my_contract increment"
  # "transfer token transfer --from {ADDRESS} --to {ADDRESS} --amount 10"
)
# In both lists, {ADDRESS} is replaced with the funded key's address and {name} with the ID of
# the contract deployed under that name. Arguments are split on spaces.
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

names=()
ids=()

# Replaces {ADDRESS} and the {name} of each contract deployed so far.
fill() {
  local text="${1//\{ADDRESS\}/$address}" i
  for i in "${!names[@]}"; do
    text="${text//\{${names[$i]}\}/${ids[$i]}}"
  done
  printf '%s' "$text"
}

id_of() {
  local i
  for i in "${!names[@]}"; do
    [ "${names[$i]}" = "$1" ] && { printf '%s' "${ids[$i]}"; return 0; }
  done
  echo "CALLS names contract '$1', which is not in CONTRACTS." >&2
  return 1
}

retry stellar keys generate "$key" --network "$network" --fund --overwrite
address="$(stellar keys address "$key")"
stellar contract build

for contract in "${CONTRACTS[@]}"; do
  read -r -a words <<< "$(fill "$contract")"
  id="$(retry stellar contract deploy --wasm "${words[1]}" --source "$key" --network "$network" -- "${words[@]:2}")"
  names+=("${words[0]}")
  ids+=("$id")
  echo "Deployed this commit's ${words[0]}: $id" >&2
done

# Fixture calls are simulated, not submitted, so they all see the storage the contracts have
# right after deployment. To measure with state in place, submit setup calls here, for example:
# retry stellar contract invoke --id "$(id_of vault)" --source "$key" --network "$network" -- deposit --from "$address" --amount 5

entries=()
reported=" "
for call in "${CALLS[@]}"; do
  read -r -a words <<< "$(fill "$call")"
  name="${words[0]}"
  case "$reported" in
    *" $name "*) echo "Two calls in CALLS are named '$name'; give each a unique name." >&2; exit 1 ;;
  esac
  reported+="$name "
  id="$(id_of "${words[1]}")"
  xdr="$(retry stellar contract invoke --id "$id" --source "$key" --network "$network" --build-only -- "${words[@]:2}")"
  entries+=("{\"name\":\"$name\",\"fixture_id\":\"$name\",\"xdr\":\"$xdr\"}")
done

mkdir -p "$(dirname "$OUT")"
( IFS=,; printf '[%s]\n' "${entries[*]}" ) > "$OUT"
echo "Wrote $OUT with ${#entries[@]} call(s)." >&2
