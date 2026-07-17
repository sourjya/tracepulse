// Fixture for the env-scrub integration test (TRP-55).
// Prints two env vars via neutral markers (not "SECRET=" etc., so the KV
// redactor does not rewrite the line and confound the assertion).
// Invoked as: node tests/fixtures/print-env-var.cjs
console.log("marker-a:" + (process.env.TP_TEST_SECRET ?? "MISSING"));
console.log("marker-b:" + (process.env.TP_TEST_PLAIN ?? "MISSING"));
