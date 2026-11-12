#!/usr/bin/env bash
# Pull pstack from cursor/plugins onto the `upstream` branch, merge it into the current branch, and regenerate the
# harness trees. The `upstream` branch holds only upstream files, so the merge keeps your edits and flags real conflicts.
# Usage: scripts/sync-upstream.sh [ref]   (default: main)
set -euo pipefail

REF=${1:-main}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi

tmp=$(mktemp -d)
cleanup() {
  git worktree remove --force "$tmp/upstream" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

git clone --quiet --depth 1 --branch "$REF" --filter=blob:none --sparse https://github.com/cursor/plugins.git "$tmp/src"
git -C "$tmp/src" sparse-checkout set pstack scripts
sha=$(git -C "$tmp/src" rev-parse HEAD)

git worktree add --quiet "$tmp/upstream" upstream
rm -rf "$tmp/upstream/pstack"
cp -R "$tmp/src/pstack" "$tmp/upstream/pstack"
cp "$tmp/src/scripts/generate-pstack-harness-trees.mjs" "$tmp/upstream/scripts/"
printf 'cursor/plugins %s\n' "$sha" >"$tmp/upstream/UPSTREAM"
git -C "$tmp/upstream" add -A
if git -C "$tmp/upstream" diff --cached --quiet; then
  echo "upstream branch already at cursor/plugins@${sha:0:12}"
else
  git -C "$tmp/upstream" commit --quiet -m "upstream: cursor/plugins@${sha:0:12}"
fi

if ! git merge --no-edit upstream; then
  echo "Resolve the conflicts, then run: node scripts/generate-pstack-harness-trees.mjs && git add -A && git commit" >&2
  exit 1
fi
node scripts/generate-pstack-harness-trees.mjs
git add -A
if git diff --cached --quiet; then
  echo "Harness trees unchanged."
else
  git commit --quiet -m "chore: regenerate harness trees for cursor/plugins@${sha:0:12}"
  echo "Merged cursor/plugins@${sha:0:12}. Push, then rerun ./install.sh on each laptop."
fi
