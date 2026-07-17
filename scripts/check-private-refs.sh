#!/bin/bash
# Pre-commit hook: reject commits containing private project names.
# Prevents accidental leakage of internal project references into the public repo.
#
# Install: cp scripts/check-private-refs.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# Or add to .kiro/hooks/ for Kiro-managed enforcement.
#
# DESIGN — mechanism vs data:
# The denylist (the actual private names) is DATA and must never live in this
# public repo, or the guard becomes the leak it is meant to prevent. This script
# is only the MECHANISM. It resolves the names file from the first path that
# exists, in this order:
#
#   1. $PRIVATE_NAMES_FILE                        (explicit override; CI, etc.)
#   2. ~/.config/tracepulse/fleet-private-refs    (absolute, checkout-independent)
#   3. <repo>/../fleet-private-refs               (one level up — the ~/coding
#                                                  fleet convention; symlink here)
#
# Canonical source of truth: the real names file is checked in PRIVATELY in a
# separate private fleet repo. Symlink it one level up (into ~/coding) so resolver #3 finds it
# from every sibling public repo. One name per line, '#' comments allowed.
# See scripts/private-names.example to bootstrap.

DISTINCT="fleet-private-refs"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"

NAMES_FILE=""
for candidate in \
  "${PRIVATE_NAMES_FILE:-}" \
  "$HOME/.config/tracepulse/$DISTINCT" \
  "${REPO_ROOT:+$REPO_ROOT/../$DISTINCT}"
do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    NAMES_FILE="$candidate"
    break
  fi
done

if [ -z "$NAMES_FILE" ]; then
  echo ""
  echo "⚠  check-private-refs: no denylist found (checked \$PRIVATE_NAMES_FILE,"
  echo "   ~/.config/tracepulse/$DISTINCT, and <repo>/../$DISTINCT)."
  echo "   Leak protection is OFF. Bootstrap it:"
  echo "     mkdir -p ~/.config/tracepulse"
  echo "     cp scripts/private-names.example ~/.config/tracepulse/$DISTINCT   # then edit in real names"
  echo ""
  exit 0   # fail-open: don't brick commits on a fresh clone, but warn loudly
fi

# Build an alternation pattern from the file (skip blank lines and comments).
PRIVATE_NAMES="$(grep -vE '^\s*(#|$)' "$NAMES_FILE" | paste -sd'|' -)"
[ -z "$PRIVATE_NAMES" ] && exit 0

# Check staged files. No self-exclusion needed: this script holds no names,
# and the out-of-repo denylist file is never staged.
STAGED="$(git diff --cached --name-only)"
[ -z "$STAGED" ] && exit 0   # nothing staged (also avoids xargs-on-empty hang)
MATCHES=$(printf '%s\n' "$STAGED" | xargs grep -ilE "$PRIVATE_NAMES" 2>/dev/null)

if [ -n "$MATCHES" ]; then
  echo ""
  echo "ERROR: Private project names found in staged files:"
  echo ""
  for f in $MATCHES; do
    echo "  $f:"
    grep -inE "$PRIVATE_NAMES" "$f" | head -3 | sed 's/^/    /'
  done
  echo ""
  echo "These names must not appear in the public TracePulse repo."
  echo "Use anonymized names: 'Nexus' (full-stack app), 'Prism' (library monorepo),"
  echo "or generic descriptions like 'a Python/FastAPI project'."
  echo ""
  echo "To fix: edit the files above, then 'git add' and commit again."
  exit 1
fi

exit 0
