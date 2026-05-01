/**
 * Pydantic validation error parser for TracePulse.
 *
 * Parses Pydantic ValidationError output from FastAPI/Starlette apps.
 * Pydantic errors appear in two forms:
 * 1. Python traceback with "pydantic.error_wrappers.ValidationError" or
 *    "pydantic_core._pydantic_core.ValidationError"
 * 2. FastAPI 422 response logged in access logs (handled by HTTP parser)
 *
 * This parser catches the traceback form and extracts field names and
 * error types from the validation message.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";

/** pydantic.error_wrappers.ValidationError: 2 validation errors for UserCreate */
const VALIDATION_ERROR = /ValidationError:\s*(\d+)\s*validation\s*error/i;

/** field required (type=missing) or value_error.missing */
const FIELD_ERROR = /^\s+(\S+)\s*$/;

/** Input should be a valid string [type=string_type] */
const TYPE_ERROR = /Input should be (?:a valid )?(\S+).*\[type=(\w+)/;

/** value is not a valid email address [type=value_error] */
const VALUE_ERROR = /value is not a valid (\S+)/;

/** Field required [type=missing, input_value=...] */
const MISSING_FIELD = /Field required\s*\[type=missing/;

/** For model "UserCreate" */
const FOR_MODEL = /for\s+(\w+)/;

export const pydanticParser: ErrorParser = {
  name: "pydantic",

  /** Test for Pydantic ValidationError patterns in tracebacks and log lines. */
  canParse(line: string): boolean {
    return VALIDATION_ERROR.test(line) || TYPE_ERROR.test(line) ||
           MISSING_FIELD.test(line) || VALUE_ERROR.test(line);
  },

  /** Parse Pydantic validation error into structured error with field and type info. */
  parse(line: string): ParsedError | null {
    const valMatch = line.match(VALIDATION_ERROR);
    if (valMatch) {
      const count = parseInt(valMatch[1], 10);
      const modelMatch = line.match(FOR_MODEL);
      const model = modelMatch ? modelMatch[1] : "unknown";
      return {
        message: `Pydantic: ${count} validation error(s) for ${model}`,
        level: "error",
        context: {
          error_type: "ValidationError",
          framework: "pydantic",
        },
        scoring_hints: { is_user_code: true },
      };
    }

    if (MISSING_FIELD.test(line)) {
      return {
        message: `Pydantic: ${line.trim()}`,
        level: "error",
        context: {
          error_type: "ValidationError",
          framework: "pydantic",
        },
        scoring_hints: { is_user_code: true },
      };
    }

    const typeMatch = line.match(TYPE_ERROR);
    if (typeMatch) {
      return {
        message: `Pydantic: Input should be ${typeMatch[1]} [${typeMatch[2]}]`,
        level: "error",
        context: {
          error_type: "ValidationError",
          framework: "pydantic",
        },
        scoring_hints: { is_user_code: true },
      };
    }

    const valueMatch = line.match(VALUE_ERROR);
    if (valueMatch) {
      return {
        message: `Pydantic: value is not a valid ${valueMatch[1]}`,
        level: "error",
        context: {
          error_type: "ValidationError",
          framework: "pydantic",
        },
        scoring_hints: { is_user_code: true },
      };
    }

    return null;
  },
};
