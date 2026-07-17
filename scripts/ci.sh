#!/usr/bin/env bash
set -euo pipefail
echo '=== LINT ===' && npm run lint
echo '=== TESTS ===' && npm test
echo '=== BUILD ===' && npm run build
echo '✅ All CI stages passed'
