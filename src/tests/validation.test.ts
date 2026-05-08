import test from "node:test";
import assert from "node:assert/strict";
import { paginationSchema, validateInput } from "../lib/validation";

test("coerces and validates pagination", () => {
  const result = validateInput(paginationSchema, { page: "2", pageSize: "50" });
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 50);
});

test("throws on invalid payload", () => {
  assert.throws(() => validateInput(paginationSchema, { page: 0, pageSize: 1000 }), /Validation failed/);
});
