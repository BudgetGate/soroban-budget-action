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
  # "transfer_from_alice token transfer --from {alice} --to {ADDRESS} --amount 10"
)
# Extra accounts, one name per line, for calls that need authorization from an account other
# than the transaction's source. Each gets a throwaway key funded by friendbot. The account must
# exist: simulating authorization by a missing account skips the signature check and reports far
# less CPU than any real call.
ACCOUNTS=(
  # "alice"
)
# In all three lists, {ADDRESS} is replaced with the funded key's address, {name} with the
# address of the account or the ID of the contract with that name. Arguments are split on spaces.
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

# A call from one contract into another costs slightly more or less depending on which of the
# two contract IDs sorts first (in the test repository 558,474 or 559,224 CPU instructions for the
# same code), and the throwaway key gives new IDs every run. So each contract is deployed with a
# salt that puts its ID in its own slice of the ID range, in CONTRACTS order, and the order (and
# the cost) is the same on every run.
B32=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567
# The first 7 bits of the contract hash in a contract strkey, 0-127: the second character holds
# 3 version bits (0) and the top 2 bits, the third character the next 5.
id_prefix() {
  local high="${B32%%"${1:1:1}"*}" low="${B32%%"${1:2:1}"*}"
  echo $(( ${#high} * 32 + ${#low} ))
}

# Prints a salt whose contract ID falls in slice $1 of $2, then that ID. Computing an ID is
# local and fast.
salt_for_slice() {
  local salt id
  while :; do
    salt="$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
    id="$(stellar contract id wasm --salt "$salt" --source-account "$key" --network "$network")"
    if (( $(id_prefix "$id") * $2 / 128 == $1 )); then
      printf '%s %s' "$salt" "$id"
      return 0
    fi
  done
}

# Deploys wasm $1 with salt $2, which gives contract ID $3, passing the rest to the constructor.
# A deploy can time out after the network created the contract; retrying the same salt would
# then fail, so a failed attempt first checks whether the contract exists. Deployment and
# constructor are one transaction, so an existing contract has run its constructor.
deploy() {
  local wasm="$1" salt="$2" id="$3" attempt
  shift 3
  for attempt in 1 2 3; do
    stellar contract deploy --wasm "$wasm" --salt "$salt" --source "$key" --network "$network" -- "$@" >/dev/null && return 0
    if stellar contract fetch --id "$id" --network "$network" --out-file /dev/null 2>/dev/null; then
      echo "Contract $id exists; an earlier attempt created it." >&2
      return 0
    fi
    echo "Attempt $attempt of deploying $wasm failed." >&2
    [ "$attempt" -lt 3 ] && sleep 15
  done
  return 1
}

retry stellar keys generate "$key" --network "$network" --fund --overwrite
address="$(stellar keys address "$key")"
# ${ACCOUNTS[@]+...} expands to nothing for an empty list instead of failing under set -u.
for account in ${ACCOUNTS[@]+"${ACCOUNTS[@]}"}; do
  retry stellar keys generate "$key-$account" --network "$network" --fund --overwrite
  names+=("$account")
  ids+=("$(stellar keys address "$key-$account")")
done
stellar contract build

for i in "${!CONTRACTS[@]}"; do
  read -r -a words <<< "$(fill "${CONTRACTS[$i]}")"
  read -r salt id <<< "$(salt_for_slice "$i" "${#CONTRACTS[@]}")"
  deploy "${words[1]}" "$salt" "$id" "${words[@]:2}"
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
