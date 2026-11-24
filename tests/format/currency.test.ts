import assert from "node:assert/strict";
import { test } from "node:test";
import { formatINR } from "../../src/lib/format/currency";

test("INR display uses English Indian grouping and integer paise", () => {
  assert.equal(formatINR(123456789), "\u20b912,34,567.89");
  assert.equal(formatINR(0), "\u20b90.00");
  assert.equal(formatINR(1), "\u20b90.01");
  for (const amount of [-1, 123.45, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatINR(amount), RangeError);
  }
});
