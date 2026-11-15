#!/usr/bin/env bash
# Measure at a COMMIT from a clean tree (M1a measurement rule): every perf, look or row number a lane reports is
# taken here, never in the shared working tree that holds other lanes' uncommitted files.
#
#   tools/perf/clean-measure.sh <commit> <port> <cmd...>
#
#   1. a detached worktree of <commit> at <parent of this tree>/m-<port> (a stale one from a killed run is removed
#      first, through git, never by a glob);
#   2. node_modules symlinked from this tree (no install);
#   3. <cmd...> run inside the worktree with CLEAN_COMMIT, CLEAN_TREE and CLEAN_PORT set (pass the port to the
#      command yourself, e.g. --port "$2"); its output is the command's own;
#   4. the worktree removed (git worktree remove --force, then prune) on every exit path; the exit code is the
#      command's.
#
# Example:
#   tools/perf/clean-measure.sh 2aed071 5270 node tools/frames/film.mjs --port 5270 --only F02,F03 --no-review --label engine-check
# Files the command writes outside the worktree (film runs, review material) stay; anything it writes inside goes.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: tools/perf/clean-measure.sh <commit> <port> <cmd...>" >&2
  exit 2
fi
COMMIT_IN="$1"; PORT="$2"; shift 2

case "$PORT" in (*[!0-9]*|'') echo "clean-measure: port must be a number" >&2; exit 2;; esac
if [ "$PORT" = "5173" ] || [ "$PORT" -lt 5250 ] || [ "$PORT" -gt 5299 ]; then
  echo "clean-measure: port $PORT refused (lane ports are 5250-5299; 5173 is never used)" >&2
  exit 2
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMIT="$(git -C "$REPO" rev-parse --verify --quiet "${COMMIT_IN}^{commit}" || true)"
if [ -z "$COMMIT" ]; then echo "clean-measure: no commit '$COMMIT_IN' in $REPO" >&2; exit 2; fi
SHORT="$(git -C "$REPO" rev-parse --short "$COMMIT")"
WT="$(dirname "$REPO")/m-$PORT"

remove_wt() {
  if git -C "$REPO" worktree list --porcelain | grep -qx "worktree $WT"; then
    git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true
  fi
  git -C "$REPO" worktree prune >/dev/null 2>&1 || true
  if [ -e "$WT" ]; then echo "clean-measure: $WT is still there after git removed the worktree; left for a person to look at" >&2; fi
}

# a stale worktree from a killed run on this port: through git only
if [ -e "$WT" ]; then
  if git -C "$REPO" worktree list --porcelain | grep -qx "worktree $WT"; then
    echo "clean-measure: removing the stale worktree $WT"
    remove_wt
  else
    echo "clean-measure: $WT exists and is not a worktree of $REPO; refusing to touch it" >&2
    exit 3
  fi
fi

git -C "$REPO" worktree add --detach "$WT" "$COMMIT" >/dev/null
trap remove_wt EXIT
trap 'exit 130' INT TERM HUP
ln -s "$REPO/node_modules" "$WT/node_modules"

DIRTY="$(git -C "$WT" status --porcelain --untracked-files=no)"
if [ -n "$DIRTY" ]; then echo "clean-measure: the new worktree is not clean:" >&2; echo "$DIRTY" >&2; exit 3; fi
echo "clean-measure: commit $SHORT, clean worktree $WT, port $PORT"

set +e
( cd "$WT" && CLEAN_COMMIT="$SHORT" CLEAN_TREE="$WT" CLEAN_PORT="$PORT" "$@" )
CODE=$?
set -e
echo "clean-measure: '$*' exited $CODE at commit $SHORT (clean worktree)"
exit "$CODE"
