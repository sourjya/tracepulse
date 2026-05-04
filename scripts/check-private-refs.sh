#!/bin/bash
# Pre-commit hook: reject commits containing private project names.
# Prevents accidental leakage of internal project references into the public repo.
#
# Install: cp scripts/check-private-refs.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# Or add to .kiro/hooks/ for Kiro-managed enforcement.

# Private project names that must NEVER appear in this public repo.
# Add new names as needed. Case-insensitive matching.
PRIVATE_NAMES="coreiq|planiq|tactiq|labeliq|veritygate|shanti"

# Check staged files only, excluding this script and steering (which list the names as rules)
EXCLUDE="check-private-refs.sh|user-project-overrides.md"
MATCHES=$(git diff --cached --name-only | grep -vE "$EXCLUDE" | xargs grep -ilE "$PRIVATE_NAMES" 2>/dev/null)

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
