// verify_mcp parity fixture (TRP-56). Does NOT perform the MCP handshake:
// prints an env marker + a secret-shaped value to stderr and exits non-zero,
// so the failure path exercises env scrub + output redaction.
// Invoked as: node tests/fixtures/verify-print-env.cjs
process.stderr.write(
  "envmarker:" + (process.env.TP_TEST_SECRET ?? "MISSING") + " key:AKIAIOSFODNN7EXAMPLE\n",
);
process.exit(1);
