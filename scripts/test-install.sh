#!/bin/bash
# TracePulse Installation Test Suite
# Run after: npm install -g tracepulse
# Usage: bash scripts/test-install.sh

set -uo pipefail

PASS=0; FAIL=0; TOTAL=0

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
HEALTH='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_health","arguments":{}}}'

check() {
  local name="$1" expect="$2" log="$3"
  ((TOTAL++))
  if grep -q "$expect" "$log" 2>/dev/null; then
    echo "  ✓ $name"; ((PASS++))
  else
    echo "  ✗ $name (expected '$expect')"; ((FAIL++))
    echo "    stderr: $(head -3 "$log")"
  fi
}

check_stdout() {
  local name="$1" expect="$2" log="$3"
  ((TOTAL++))
  if grep -q "$expect" "$log" 2>/dev/null; then
    echo "  ✓ $name"; ((PASS++))
  else
    echo "  ✗ $name (expected '$expect' in stdout)"; ((FAIL++))
    echo "    stdout: $(head -3 "$log")"
  fi
}

echo "TracePulse Installation Tests"
echo "=============================="
echo ""

# Resolve tracepulse CLI path - use node + dist/cli.js for reliability
TP_DIR=$(npm root -g 2>/dev/null)/tracepulse
if [ -f "$TP_DIR/dist/cli.js" ]; then
  TP_BIN="node $TP_DIR/dist/cli.js"
else
  TP_BIN="tracepulse"
fi

echo "Using: $TP_BIN"
echo ""

# --- S1: Version check ---
echo "S1: Version check"
timeout 3 $TP_BIN --version 2>/tmp/tp-s1.log >/dev/null || true
check "tracepulse --version outputs version" "TracePulse v" /tmp/tp-s1.log

# --- S2: Node.js project ---
echo "S2: Node.js project"
D=$(mktemp -d)
echo '{"name":"test","scripts":{"dev":"echo hi"}}' > "$D/package.json"
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && $TP_BIN" 2>"$D/err.log" >"$D/out.log" || true
check "detects node stack" "node" "$D/err.log"
check_stdout "MCP handshake succeeds" "protocolVersion" "$D/out.log"
rm -rf "$D"

# --- S3: Python project ---
echo "S3: Python project"
D=$(mktemp -d)
echo "fastapi" > "$D/requirements.txt"
echo "DATABASE_URL=postgres://localhost/db" > "$D/.env"
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && $TP_BIN" 2>"$D/err.log" >"$D/out.log" || true
check "detects python stack" "python" "$D/err.log"
check "detects infra stack" "infra" "$D/err.log"
check_stdout "MCP handshake succeeds" "protocolVersion" "$D/out.log"
rm -rf "$D"

# --- S4: Python with start script ---
echo "S4: Python with start script"
D=$(mktemp -d)
mkdir -p "$D/scripts"
echo "fastapi" > "$D/requirements.txt"
printf '#!/bin/bash\necho "starting"' > "$D/scripts/start.sh"
chmod +x "$D/scripts/start.sh"
printf "%s\n%s\n" "$INIT" "$HEALTH" | timeout 5 sh -c "cd '$D' && tracepulse&& tracepulse $TP_BIN" 2>"$D/err.log" >"$D/out.log" || true
check_stdout "suggests bash scripts/start.sh" "scripts/start.sh" "$D/out.log"
rm -rf "$D"

# --- S5: Go project ---
echo "S5: Go project"
D=$(mktemp -d)
echo "module example.com/app" > "$D/go.mod"
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && tracepulse&& tracepulse $TP_BIN" 2>"$D/err.log" >"$D/out.log" || true
check "detects go stack" "go" "$D/err.log"
rm -rf "$D"

# --- S6: Rust project ---
echo "S6: Rust project"
D=$(mktemp -d)
printf '[package]\nname = "test"' > "$D/Cargo.toml"
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && tracepulse&& tracepulse $TP_BIN" 2>"$D/err.log" >"$D/out.log" || true
check "detects rust stack" "rust" "$D/err.log"
rm -rf "$D"

# --- S7: Empty directory ---
echo "S7: Empty directory (fresh project)"
D=$(mktemp -d)
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && tracepulse&& tracepulse $TP_BIN" 2>"$D/err.log" >"$D/out.log" || true
check "starts in standalone mode" "standalone" "$D/err.log"
check_stdout "MCP handshake succeeds" "protocolVersion" "$D/out.log"
rm -rf "$D"

# --- S8: Monorepo (Node + Python) ---
echo "S8: Monorepo"
D=$(mktemp -d)
mkdir -p "$D/frontend" "$D/backend"
echo '{"name":"mono"}' > "$D/frontend/package.json"
echo "django" > "$D/backend/requirements.txt"
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && tracepulse&& tracepulse $TP_BIN" 2>"$D/err.log" >"$D/out.log" || true
check "detects node stack" "node" "$D/err.log"
check "detects python stack" "python" "$D/err.log"
rm -rf "$D"

# --- S9: Bad command diagnostics ---
echo "S9: Shell syntax diagnostics"
D=$(mktemp -d)
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && tracepulse&& tracepulse $TP_BIN start 'PYTHONPATH=src python -m app'" 2>"$D/err.log" >"$D/out.log" || true
check "detects shell syntax" "shell syntax" "$D/err.log"
rm -rf "$D"

# --- S10: Start with working command ---
echo "S10: Start mode with real command"
D=$(mktemp -d)
printf "%s\n" "$INIT" | timeout 5 sh -c "cd '$D' && tracepulse&& tracepulse $TP_BIN start 'python -m http.server 0'" 2>"$D/err.log" >"$D/out.log" || true
check "collector starts" "Collector started" "$D/err.log"
rm -rf "$D"

# --- Summary ---
echo ""
echo "=============================="
echo "$PASS/$TOTAL passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo "All tests passed!"
  exit 0
else
  echo "Some tests failed."
  exit 1
fi
