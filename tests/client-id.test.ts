import { test } from "node:test";
import assert from "node:assert/strict";
import { createClientId } from "../src/lib/client-id";
test("fallback sem randomUUID preserva UUID v4 e identificadores distintos", () => {
  const original = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", {
    value: undefined,
    configurable: true,
  });
  try {
    const ids = Array.from({ length: 100 }, () => createClientId());
    for (const id of ids)
      assert.match(
        id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    if (original) Object.defineProperty(crypto, "randomUUID", original);
    else Reflect.deleteProperty(crypto, "randomUUID");
  }
});
