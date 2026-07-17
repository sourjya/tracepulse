// Fixture for the run_and_watch raw_output redaction test (TM-03 / TRP-54).
// Prints a secret-shaped string to stdout. The AWS example access key
// AKIAIOSFODNN7EXAMPLE matches the redactor's `aws-key` pattern.
// Invoked as: node tests/fixtures/print-secret.cjs
console.log("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE done");
