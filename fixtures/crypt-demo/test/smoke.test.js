import test from "node:test";
import assert from "node:assert/strict";
import ms from "ms";

test("ms parses a duration", () => {
  assert.equal(ms("1s"), 1000);
});
