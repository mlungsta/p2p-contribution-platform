import test from "node:test";
import assert from "node:assert/strict";
import { roles } from "../lib/permissions";

test("contains required system roles", () => {
  assert.equal(roles.includes("MEMBER"), true);
  assert.equal(roles.includes("SUPER_ADMIN"), true);
});
