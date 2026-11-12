#!/usr/bin/env bash
# Install pstack from pstacky into Claude Code and omp at user scope. Rerun it to update.
# PSTACKY_SOURCE sets where the marketplace comes from: owner/repo (default), a git URL, or a local path.

# `source install.sh` would leave `set -e` on in your shell, so the next failing command closes it.
if (return 0 2>/dev/null); then
  echo "Run this script, don't source it: bash ${BASH_SOURCE[0]}" >&2
  return 1
fi
set -euo pipefail

SOURCE=${PSTACKY_SOURCE:-winmorre/pstacky}
MARKETPLACE=pstacky
PLUGIN=pstack@$MARKETPLACE
found=0

if command -v claude >/dev/null 2>&1; then
  found=1
  echo "== Claude Code"
  if claude plugin marketplace list 2>/dev/null | grep -qw "$MARKETPLACE"; then
    claude plugin marketplace update "$MARKETPLACE"
  else
    claude plugin marketplace add "$SOURCE"
  fi
  if claude plugin list 2>/dev/null | grep -qF "$PLUGIN"; then
    claude plugin update "$PLUGIN"
  else
    claude plugin install "$PLUGIN"
  fi
fi

if command -v omp >/dev/null 2>&1; then
  found=1
  echo "== omp"
  if omp plugin marketplace list 2>/dev/null | grep -qw "$MARKETPLACE"; then
    omp plugin marketplace update "$MARKETPLACE"
  else
    omp plugin marketplace add "$SOURCE"
  fi
  if omp plugin list 2>/dev/null | grep -qF "$PLUGIN"; then
    omp plugin upgrade "$PLUGIN"
  else
    omp plugin install "$PLUGIN"
  fi
fi

if [ "$found" = 0 ]; then
  echo "Neither claude nor omp is on PATH." >&2
  exit 1
fi
echo "Done. Start a new session, then run /pstack:setup-pstack (Claude Code) or /skill:setup-pstack (omp)."
